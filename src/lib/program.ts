import { clamp, estimate1RM, roundToPlate, weightForReps } from './oneRepMax'
import { programWeekOf, todayISO, weekPosition } from './date'
import type { Exercise, Experience, Goal, Profile, Session, Settings } from './types'

/* ────────────────────────────────────────────────────────────────────────────
 * Configuración de objetivos y niveles
 * ──────────────────────────────────────────────────────────────────────────── */

export type ProgressionMode = 'carga' | 'volumen' | 'repeticiones'

export interface GoalConfig {
  label: string
  description: string
  reps: number
  repRange: [number, number]
  sets: number
  rpe: number
  /** Multiplicador sobre la tasa de ganancia de 1RM (la fuerza máxima progresa más rápido entrenando pesado). */
  rateMultiplier: number
  progression: ProgressionMode
  restSeconds: number
}

export const GOALS: Record<Goal, GoalConfig> = {
  fuerza: {
    label: 'Fuerza máxima',
    description: 'Cargas altas, pocas repeticiones. Prioriza el 1RM.',
    reps: 5,
    repRange: [3, 6],
    sets: 5,
    rpe: 8,
    rateMultiplier: 1,
    progression: 'carga',
    restSeconds: 180,
  },
  hipertrofia: {
    label: 'Hipertrofia',
    description: 'Volumen progresivo en rango medio para ganar músculo.',
    reps: 10,
    repRange: [8, 12],
    sets: 3,
    rpe: 8,
    rateMultiplier: 0.85,
    progression: 'volumen',
    restSeconds: 120,
  },
  resistencia: {
    label: 'Resistencia muscular',
    description: 'Series largas y densas para tolerar la fatiga.',
    reps: 15,
    repRange: [15, 20],
    sets: 3,
    rpe: 7,
    rateMultiplier: 0.6,
    progression: 'repeticiones',
    restSeconds: 60,
  },
}

export interface ExperienceConfig {
  label: string
  description: string
  /** Ganancia semanal relativa de 1RM esperada al inicio del ciclo. */
  baseRate: number
  /** Decaimiento semanal de la tasa (rendimientos decrecientes). */
  decay: number
  /** Cada cuántas semanas se programa una descarga. */
  deloadEvery: number
}

export const EXPERIENCE: Record<Experience, ExperienceConfig> = {
  principiante: {
    label: 'Principiante',
    description: 'Menos de 1 año entrenando con constancia.',
    baseRate: 0.025,
    decay: 0.96,
    deloadEvery: 6,
  },
  intermedio: {
    label: 'Intermedio',
    description: 'Entre 1 y 3 años, técnica sólida.',
    baseRate: 0.0125,
    decay: 0.97,
    deloadEvery: 4,
  },
  avanzado: {
    label: 'Avanzado',
    description: 'Más de 3 años, cerca de tu potencial.',
    baseRate: 0.006,
    decay: 0.98,
    deloadEvery: 4,
  },
}

/** Más frecuencia = más estímulo semanal, con techo. 2 días → 0.7 · 5 días → 1.0 · 6 días → 1.1 */
export function frequencyFactor(daysPerWeek: number): number {
  return clamp(0.7 + 0.1 * (daysPerWeek - 2), 0.7, 1.1)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Utilidades de carga
 * ──────────────────────────────────────────────────────────────────────────── */

/** Las series de aproximación no cuentan para 1RM ni tonelaje efectivo. */
export function isWorkSet(s: { kind?: string }): boolean {
  return s.kind !== 'warmup'
}

/** Carga efectiva: en ejercicios con peso corporal se suma el peso del atleta. */
export function effectiveLoad(ex: Pick<Exercise, 'bodyweight'>, weight: number, bodyweight: number): number {
  return ex.bodyweight ? weight + bodyweight : weight
}

export function baselineE1RM(ex: Exercise, profile: Profile, settings: Settings): number {
  const { weight, reps, rpe } = ex.baseline
  return estimate1RM(effectiveLoad(ex, weight, profile.bodyweight), reps, rpe, settings.formula)
}

/** Carga de trabajo de la semana 0 según el objetivo (reps y RPE objetivo). */
export function initialWorkingLoad(e1rm: number, goal: Goal, settings: Settings): number {
  const g = GOALS[goal]
  return weightForReps(e1rm, g.reps, g.rpe, settings.formula)
}

/** Incremento semanal sugerido (kg de carga de trabajo) a partir del perfil. */
export function suggestedIncrement(
  e1rm: number,
  profile: Pick<Profile, 'experience' | 'goal' | 'daysPerWeek'>,
  settings: Settings,
): number {
  const working = initialWorkingLoad(e1rm, profile.goal, settings)
  const rate = EXPERIENCE[profile.experience].baseRate * GOALS[profile.goal].rateMultiplier * frequencyFactor(profile.daysPerWeek)
  const raw = working * rate
  return Math.max(0.25, Math.round(raw * 4) / 4)
}

export function isDeloadWeek(week: number, deloadEvery: number, totalWeeks: number): boolean {
  // La última semana del ciclo se reserva para expresar fuerza (test), no se descarga.
  return week > 0 && week < totalWeeks && week % deloadEvery === 0
}

/* ────────────────────────────────────────────────────────────────────────────
 * Proyección
 * ──────────────────────────────────────────────────────────────────────────── */

export function totalWeeksFor(ex: Exercise, profile: Profile): number {
  return Math.max(profile.programWeeks, ex.startWeek + 4)
}

/** Tasa inicial: el incremento deseado expresado como fracción de la carga de trabajo inicial. */
export function initialRate(ex: Exercise, profile: Profile, settings: Settings): number {
  const base = baselineE1RM(ex, profile, settings)
  const working = initialWorkingLoad(base, profile.goal, settings)
  if (working <= 0) return 0
  return clamp(ex.weeklyIncrement / working, 0, 0.1)
}

/**
 * Crecimiento relativo planificado para cada semana (índice 0..W).
 * g[w] = r0 · decay^(k−1), con k = semanas de plan transcurridas para el ejercicio; 0 en descargas.
 */
export function growthSchedule(ex: Exercise, profile: Profile, settings: Settings): number[] {
  const W = totalWeeksFor(ex, profile)
  const { decay, deloadEvery } = EXPERIENCE[profile.experience]
  const r0 = initialRate(ex, profile, settings)
  const g: number[] = new Array(W + 1).fill(0)
  let k = 0
  for (let w = 1; w <= W; w++) {
    if (w <= ex.startWeek) continue
    if (isDeloadWeek(w, deloadEvery, W)) continue
    k++
    g[w] = r0 * Math.pow(decay, k - 1)
  }
  return g
}

/** Curva de 1RM: v[w] = v[w−1]·(1 + m·g[w]) a partir de (fromWeek, fromValue). Las semanas previas son null. */
export function projectCurve(
  growth: number[],
  fromWeek: number,
  fromValue: number,
  multiplier = 1,
): (number | null)[] {
  const out: (number | null)[] = growth.map(() => null)
  out[fromWeek] = fromValue
  for (let w = fromWeek + 1; w < growth.length; w++) {
    out[w] = (out[w - 1] as number) * (1 + multiplier * growth[w])
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * Prescripción semanal (series × reps @ peso)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WeekPlan {
  week: number
  deload: boolean
  targetE1RM: number
  sets: number
  reps: number
  rpe: number
  /** Peso a cargar en la barra (o lastre), redondeado a discos. */
  weight: number
  /** Carga efectiva (incluye peso corporal si aplica). */
  load: number
  /** Tonelaje objetivo de la semana para este ejercicio por sesión. */
  volume: number
}

export function prescribe(
  week: number,
  targetE1RM: number,
  ex: Exercise,
  profile: Profile,
  settings: Settings,
): WeekPlan {
  const goal = GOALS[profile.goal]
  const { deloadEvery } = EXPERIENCE[profile.experience]
  const W = totalWeeksFor(ex, profile)
  const deload = isDeloadWeek(week, deloadEvery, W)
  const k = Math.max(0, week - ex.startWeek) // semana dentro del plan del ejercicio
  const p = k === 0 ? 0 : (k - 1) % deloadEvery // posición dentro del mesociclo (0-based)

  let sets = goal.sets
  let reps = goal.reps
  // Rampa de esfuerzo dentro del bloque: RPE −1 → objetivo.
  let rpe = clamp(goal.rpe - 1 + 0.5 * Math.min(p, 2), 5, 10)

  if (goal.progression === 'volumen') {
    sets = goal.sets + Math.min(p, 2) // 3 → 4 → 5 series
  } else if (goal.progression === 'repeticiones') {
    reps = Math.min(goal.repRange[1], goal.repRange[0] + 2 * p) // 15 → 17 → 19 → 20
  }

  if (deload) {
    sets = Math.max(2, Math.round(goal.sets * 0.6))
    reps = goal.reps
    rpe = 6
  }

  const load = weightForReps(targetE1RM, reps, rpe, settings.formula)
  const bw = ex.bodyweight ? profile.bodyweight : 0
  const weight = Math.max(0, roundToPlate(load - bw, settings.rounding))
  const realLoad = weight + bw
  return { week, deload, targetE1RM, sets, reps, rpe, weight, load: realLoad, volume: sets * reps * realLoad }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Rendimiento real y recálculo adaptativo
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ActualPoint {
  sessionId: string
  date: string
  week: number
  x: number
  e1rm: number
  bestSet: { weight: number; reps: number; rpe?: number }
}

/** Mejor 1RM estimado de un ejercicio en cada sesión del ciclo actual. */
export function actualPoints(ex: Exercise, sessions: Session[], profile: Profile, settings: Settings): ActualPoint[] {
  const pts: ActualPoint[] = []
  for (const s of sessions) {
    if (s.date < profile.startDate) continue
    const entry = s.entries.find((e) => e.exerciseId === ex.id)
    if (!entry) continue
    let best = 0
    let bestSet: ActualPoint['bestSet'] | null = null
    for (const set of entry.sets) {
      if (!set.done || set.reps <= 0 || !isWorkSet(set)) continue
      const v = estimate1RM(effectiveLoad(ex, set.weight, profile.bodyweight), set.reps, set.rpe, settings.formula)
      if (v > best) {
        best = v
        bestSet = { weight: set.weight, reps: set.reps, rpe: set.rpe }
      }
    }
    if (bestSet && best > 0) {
      pts.push({
        sessionId: s.id,
        date: s.date,
        week: programWeekOf(profile.startDate, s.date),
        x: weekPosition(profile.startDate, s.date),
        e1rm: best,
        bestSet,
      })
    }
  }
  return pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function weeklyBest(points: ActualPoint[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const p of points) m.set(p.week, Math.max(m.get(p.week) ?? 0, p.e1rm))
  return m
}

export interface ResponseFit {
  /** Multiplicador de respuesta aplicado (1 = progresa exactamente como el plan). */
  multiplier: number
  /** Multiplicador observado sin regularizar (null si no hay datos suficientes). */
  observed: number | null
  /** Semanas de datos usadas en el ajuste. */
  samples: number
}

const PRIOR_WEIGHT = 2

/**
 * Ajusta la respuesta del atleta al plan.
 * Modelo: ln(1RM_w / 1RM_0) ≈ m · S_w, con S_w = Σ ln(1 + g_i) (crecimiento logarítmico planificado acumulado).
 * Mínimos cuadrados por el origen → m_obs = Σ S·y / Σ S². Se regulariza hacia 1 con un prior de peso 2 semanas
 * para evitar sobrerreaccionar a una sola sesión. Se excluyen descargas (esfuerzo submáximo intencionado).
 */
export function fitResponse(base: number, growth: number[], best: Map<number, number>, deloadWeeks: Set<number>): ResponseFit {
  const cum: number[] = []
  let acc = 0
  for (let w = 0; w < growth.length; w++) {
    acc += Math.log(1 + growth[w])
    cum[w] = acc
  }
  let sxy = 0
  let sxx = 0
  let n = 0
  for (const [w, v] of best) {
    if (w <= 0 || w >= growth.length || deloadWeeks.has(w)) continue
    const S = cum[w]
    if (S <= 1e-9) continue
    const y = Math.log(v / base)
    sxy += S * y
    sxx += S * S
    n++
  }
  if (n === 0 || sxx === 0) return { multiplier: 1, observed: null, samples: 0 }
  const observed = sxy / sxx
  const multiplier = clamp((PRIOR_WEIGHT * 1 + n * observed) / (PRIOR_WEIGHT + n), 0, 2.5)
  return { multiplier, observed, samples: n }
}

export interface ExerciseAnalysis {
  exercise: Exercise
  totalWeeks: number
  currentWeek: number
  base: number
  growth: number[]
  deloadWeeks: Set<number>
  /** Proyección original del plan (fija desde la evaluación). */
  original: number[]
  /** Proyección recalculada con el rendimiento real (null antes del ancla). */
  adjusted: (number | null)[]
  anchorWeek: number
  points: ActualPoint[]
  best: Map<number, number>
  fit: ResponseFit
  /** Plan semanal: semanas pasadas con el objetivo original, futuras con el objetivo ajustado. */
  plan: WeekPlan[]
  originalEnd: number
  projectedEnd: number
  currentBest: number
  compliance: { hits: number; total: number; avgRatio: number }
}

export interface AnalyzeOptions {
  /** Considerar solo datos hasta esta semana (incluida). Útil para prescribir la semana en curso sin que cambie a mitad. */
  untilWeek?: number
  today?: string
}

export function analyzeExercise(
  ex: Exercise,
  profile: Profile,
  sessions: Session[],
  settings: Settings,
  opts: AnalyzeOptions = {},
): ExerciseAnalysis {
  const W = totalWeeksFor(ex, profile)
  const { deloadEvery } = EXPERIENCE[profile.experience]
  const base = baselineE1RM(ex, profile, settings)
  const growth = growthSchedule(ex, profile, settings)
  const deloadWeeks = new Set<number>()
  for (let w = 1; w <= W; w++) if (isDeloadWeek(w, deloadEvery, W)) deloadWeeks.add(w)

  const originalRaw = projectCurve(growth, 0, base)
  const original = originalRaw.map((v) => v ?? base)

  // Sin línea base (ejercicio sin calibrar) no hay curva que ajustar.
  let points = base > 0 ? actualPoints(ex, sessions, profile, settings) : []
  if (opts.untilWeek != null) points = points.filter((p) => p.week <= (opts.untilWeek as number))
  const best = weeklyBest(points)
  const fit = fitResponse(base, growth, best, deloadWeeks)

  // Ancla: última semana con datos (no descarga), suavizada entre el dato real y el valor del modelo ajustado.
  let anchorWeek = 0
  let anchorValue = base
  const trainingWeeks = [...best.keys()].filter((w) => w > 0 && !deloadWeeks.has(w) && w <= W)
  if (trainingWeeks.length > 0) {
    anchorWeek = Math.max(...trainingWeeks)
    let S = 0
    for (let w = 1; w <= anchorWeek; w++) S += Math.log(1 + growth[w])
    const fitted = base * Math.exp(fit.multiplier * S)
    anchorValue = 0.6 * (best.get(anchorWeek) as number) + 0.4 * fitted
  }
  const adjusted = projectCurve(growth, anchorWeek, anchorValue, fit.multiplier)

  const plan: WeekPlan[] = []
  for (let w = 0; w <= W; w++) {
    const target = w > anchorWeek ? (adjusted[w] as number) : original[w]
    plan.push(prescribe(w, target, ex, profile, settings))
  }

  let hits = 0
  let total = 0
  let ratioSum = 0
  for (const [w, v] of best) {
    if (w <= ex.startWeek || w > W || deloadWeeks.has(w) || original[w] <= 0) continue
    const ratio = v / original[w]
    total++
    ratioSum += ratio
    if (ratio >= 0.98) hits++
  }

  const today = opts.today ?? todayISO()
  const currentWeek = clamp(programWeekOf(profile.startDate, today), 0, W)

  return {
    exercise: ex,
    totalWeeks: W,
    currentWeek,
    base,
    growth,
    deloadWeeks,
    original,
    adjusted,
    anchorWeek,
    points,
    best,
    fit,
    plan,
    originalEnd: original[W],
    projectedEnd: adjusted[W] as number,
    currentBest: Math.max(base, ...points.map((p) => p.e1rm)),
    compliance: { hits, total, avgRatio: total ? ratioSum / total : 1 },
  }
}

/** Prescripción para entrenar hoy: usa solo datos de semanas anteriores para que el objetivo sea estable dentro de la semana. */
export function todaysPrescription(
  ex: Exercise,
  profile: Profile,
  sessions: Session[],
  settings: Settings,
  today = todayISO(),
): WeekPlan {
  const W = totalWeeksFor(ex, profile)
  const week = clamp(programWeekOf(profile.startDate, today), 1, W)
  const a = analyzeExercise(ex, profile, sessions, settings, { untilWeek: week - 1, today })
  return a.plan[week]
}
