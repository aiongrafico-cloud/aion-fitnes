import { estimate1RM } from './oneRepMax'
import { daysBetween, programWeekOf } from './date'
import { analyzeExercise, baselineE1RM, effectiveLoad, isWorkSet, type ExerciseAnalysis } from './program'
import type { Exercise, Goal, MuscleGroup, Profile, Routine, Session, Settings } from './types'
import { isStraight } from './routine'

export interface SessionSummary {
  session: Session
  week: number
  tonnage: number
  sets: number
  reps: number
  /** Ejercicios en los que esta sesión superó el mejor 1RM estimado previo (incluida la evaluación). */
  prs: { exerciseId: string; e1rm: number; previous: number }[]
  bestByExercise: Map<string, number>
}

/** Tonelaje de una serie. Los ejercicios unilaterales cuentan ambos lados. */
export function setTonnage(ex: Exercise | undefined, weight: number, reps: number, bodyweight: number): number {
  const load = ex ? effectiveLoad(ex, weight, bodyweight) : weight
  return load * reps * (ex?.unilateral ? 2 : 1)
}

/** Resume todas las sesiones en orden cronológico, detectando récords personales (PR). */
export function summarizeSessions(
  sessions: Session[],
  exercises: Exercise[],
  profile: Profile,
  settings: Settings,
): SessionSummary[] {
  const exById = new Map(exercises.map((e) => [e.id, e]))
  const bestSoFar = new Map<string, number>()
  for (const ex of exercises) bestSoFar.set(ex.id, baselineE1RM(ex, profile, settings))

  const sorted = [...sessions].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))
  const out: SessionSummary[] = []
  for (const s of sorted) {
    let tonnage = 0
    let setCount = 0
    let repCount = 0
    const bestByExercise = new Map<string, number>()
    for (const entry of s.entries) {
      const ex = exById.get(entry.exerciseId)
      for (const set of entry.sets) {
        if (!set.done || !isWorkSet(set)) continue
        setCount++
        repCount += set.reps
        tonnage += setTonnage(ex, set.weight, set.reps, profile.bodyweight)
        if (ex) {
          const v = estimate1RM(effectiveLoad(ex, set.weight, profile.bodyweight), set.reps, set.rpe, settings.formula)
          bestByExercise.set(ex.id, Math.max(bestByExercise.get(ex.id) ?? 0, v))
        }
      }
    }
    const prs: SessionSummary['prs'] = []
    for (const [id, v] of bestByExercise) {
      const prev = bestSoFar.get(id) ?? 0
      if (prev > 0 && v > prev + 1e-6) {
        prs.push({ exerciseId: id, e1rm: v, previous: prev })
        bestSoFar.set(id, v)
      }
    }
    out.push({
      session: s,
      week: programWeekOf(profile.startDate, s.date),
      tonnage,
      sets: setCount,
      reps: repCount,
      prs,
      bestByExercise,
    })
  }
  return out
}

/** Tonelaje por semana del programa (índice 1..W). */
export function weeklyTonnage(summaries: SessionSummary[], profile: Profile, weeks: number): number[] {
  const arr = new Array(weeks + 1).fill(0)
  for (const s of summaries) {
    if (s.session.date < profile.startDate) continue
    if (s.week >= 1 && s.week <= weeks) arr[s.week] += s.tonnage
  }
  return arr
}

export interface DashboardKpis {
  currentWeek: number
  totalWeeks: number
  weekTonnage: number
  prevWeekTonnage: number
  /** Tonelaje de la semana anterior hasta el mismo día de la semana (comparación justa con una semana en curso). */
  prevWeekToDate: number
  tonnageByWeek: number[]
  compliancePct: number | null
  avgPerformanceRatio: number | null
  sessionsThisWeek: number
  analyses: ExerciseAnalysis[]
}

export function computeKpis(
  profile: Profile,
  exercises: Exercise[],
  sessions: Session[],
  settings: Settings,
  today: string,
): DashboardKpis {
  const active = exercises.filter((e) => !e.archived && e.calibrated !== false)
  const analyses = active.map((ex) => analyzeExercise(ex, profile, sessions, settings, { today }))
  const totalWeeks = profile.programWeeks
  const currentWeek = Math.min(totalWeeks, Math.max(1, programWeekOf(profile.startDate, today)))
  const summaries = summarizeSessions(sessions, exercises, profile, settings)
  const tonnageByWeek = weeklyTonnage(summaries, profile, Math.max(totalWeeks, currentWeek))
  let hits = 0
  let total = 0
  let ratioWeighted = 0
  for (const a of analyses) {
    hits += a.compliance.hits
    total += a.compliance.total
    ratioWeighted += a.compliance.avgRatio * a.compliance.total
  }
  const todayDay = daysBetween(profile.startDate, today) % 7
  const prevWeekToDate = summaries
    .filter((s) => s.week === currentWeek - 1 && s.session.date >= profile.startDate && daysBetween(profile.startDate, s.session.date) % 7 <= todayDay)
    .reduce((a, s) => a + s.tonnage, 0)
  return {
    currentWeek,
    totalWeeks,
    prevWeekToDate,
    weekTonnage: tonnageByWeek[currentWeek] ?? 0,
    prevWeekTonnage: tonnageByWeek[currentWeek - 1] ?? 0,
    tonnageByWeek,
    compliancePct: total ? (hits / total) * 100 : null,
    avgPerformanceRatio: total ? ratioWeighted / total : null,
    sessionsThisWeek: summaries.filter((s) => s.week === currentWeek && s.session.date >= profile.startDate).length,
    analyses,
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Volumen semanal por grupo muscular
 * ──────────────────────────────────────────────────────────────────────────── */

/** Rango orientativo de series efectivas (cerca del fallo) por músculo y semana. */
export const VOLUME_TARGET: Record<Goal, [number, number]> = {
  hipertrofia: [6, 14],
  fuerza: [4, 10],
  resistencia: [6, 16],
}

export interface MuscleVolume {
  group: MuscleGroup
  /** Series efectivas completadas (sin aproximaciones). */
  sets: number
  prevSets: number
  /** Series que la rutina programa por semana. */
  planned: number
  tonnage: number
}

function setsByGroup(sessions: Session[], exById: Map<string, Exercise>, profile: Profile, week: number) {
  const out = new Map<MuscleGroup, { sets: number; tonnage: number }>()
  for (const s of sessions) {
    if (s.date < profile.startDate || programWeekOf(profile.startDate, s.date) !== week) continue
    for (const entry of s.entries) {
      const ex = exById.get(entry.exerciseId)
      if (!ex) continue
      const cur = out.get(ex.muscleGroup) ?? { sets: 0, tonnage: 0 }
      for (const set of entry.sets) {
        if (!set.done || !isWorkSet(set) || set.reps <= 0) continue
        cur.sets += 1
        cur.tonnage += setTonnage(ex, set.weight, set.reps, profile.bodyweight)
      }
      out.set(ex.muscleGroup, cur)
    }
  }
  return out
}

/** Series por grupo muscular en una semana del programa, frente a la semana anterior y a lo planificado. */
export function weeklyMuscleVolume(exercises: Exercise[], sessions: Session[], profile: Profile, routine: Routine | null | undefined, week: number): MuscleVolume[] {
  const exById = new Map(exercises.map((e) => [e.id, e]))
  const cur = setsByGroup(sessions, exById, profile, week)
  const prev = setsByGroup(sessions, exById, profile, week - 1)
  const planned = new Map<MuscleGroup, number>()
  if (routine && routine.days.length) {
    // La rotación se repite: días de entrenamiento por semana / días de la rutina.
    const cycles = profile.daysPerWeek / routine.days.length
    for (const d of routine.days) {
      for (const it of d.items) {
        const ex = exById.get(it.exerciseId)
        if (ex) planned.set(ex.muscleGroup, (planned.get(ex.muscleGroup) ?? 0) + (isStraight(it) ? it.sets ?? 3 : 2) * cycles)
      }
    }
  }
  const groups = new Set<MuscleGroup>([...cur.keys(), ...prev.keys(), ...planned.keys()])
  return [...groups]
    .map((g) => ({ group: g, sets: cur.get(g)?.sets ?? 0, prevSets: prev.get(g)?.sets ?? 0, planned: Math.round((planned.get(g) ?? 0) * 10) / 10, tonnage: cur.get(g)?.tonnage ?? 0 }))
    .filter((r) => r.sets > 0 || r.prevSets > 0 || r.planned > 0)
    .sort((a, b) => b.planned - a.planned || b.sets - a.sets)
}
