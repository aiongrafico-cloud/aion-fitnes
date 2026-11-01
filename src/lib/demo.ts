import { addDays, todayISO } from './date'
import { clamp } from './oneRepMax'
import { baselineE1RM, growthSchedule, suggestedIncrement } from './program'
import { buildDefaultRoutine, protocolForDate, PROTOCOL } from './routine'
import { defaultState, uid } from './storage'
import type { AppState, Profile, Session, SetLog } from './types'

/**
 * Atleta de ejemplo con ~5 semanas de la rutina Torso/Pierna (Top Set + Back-off).
 * Cada ejercicio tiene una "respuesta real" distinta y el atleta ejecuta lo que el motor le prescribe,
 * reportando las reps y el RPE que le corresponderían según su 1RM verdadero de ese día.
 */
export function buildDemoState(today = todayISO()): AppState {
  const settings = defaultState.settings
  const startDate = addDays(today, -36)
  const profile: Profile = {
    name: 'Atleta demo',
    age: 29,
    sex: 'masculino',
    bodyweight: 78,
    height: 178,
    experience: 'intermedio',
    daysPerWeek: 4,
    goal: 'hipertrofia',
    programWeeks: 12,
    startDate,
  }

  const { routine, exercises: raw, samples } = buildDefaultRoutine([], 0)
  const exercises = raw.map((ex) => {
    const item = routine.days.flatMap((d) => d.items).find((i) => i.exerciseId === ex.id)!
    const cal = { ...ex, calibrated: true, baseline: { weight: samples.get(ex.id) ?? 20, reps: item.top[1] - 1, rpe: PROTOCOL.topRpe }, createdAt: `${startDate}T09:00:00.000Z` }
    cal.weeklyIncrement = suggestedIncrement(baselineE1RM(cal, profile, settings), profile, settings)
    return cal
  })

  // Generador pseudoaleatorio determinista para que la demo sea reproducible.
  let seed = 42
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const response = new Map(exercises.map((e) => [e.id, 0.7 + rand() * 0.7]))

  const dayOffsets = [0, 1, 3, 4]
  const sessions: Session[] = []
  let rot = 0
  for (let wk = 0; wk < 6; wk++) {
    for (const off of dayOffsets) {
      const date = addDays(startDate, wk * 7 + off)
      if (date >= today) continue
      const day = routine.days[rot % routine.days.length]
      rot++
      const entries = day.items.map((it) => {
        const ex = exercises.find((e) => e.id === it.exerciseId)!
        const p = protocolForDate(ex, it, profile, sessions, settings, date)
        const g = growthSchedule(ex, profile, settings)
        let S = 0
        for (let w = 1; w <= p.week; w++) S += Math.log(1 + g[w])
        const trueMax = baselineE1RM(ex, profile, settings) * Math.exp((response.get(ex.id) ?? 1) * S) * (1 + (rand() - 0.5) * 0.04)
        const toFailure = (load: number) => Math.max(1, 30 * (trueMax / Math.max(load, 0.5) - 1))
        const sets: SetLog[] = p.warmups.map((w) => ({ id: uid(), weight: w.weight, reps: w.reps, done: true, kind: 'warmup' }))
        const rtf = toFailure(p.top.weight)
        const rir = p.deload ? 3 : 0.5
        const topReps = clamp(Math.floor(rtf - rir), 1, it.top[1] + 3)
        sets.push({ id: uid(), weight: p.top.weight, reps: topReps, rpe: clamp(Math.round((10 - (rtf - topReps)) * 2) / 2, 6, 10), done: true, kind: 'top' })
        if (p.backoff) {
          const boReps = Math.max(1, Math.floor(toFailure(p.backoff.weight) - 1.5))
          sets.push({ id: uid(), weight: p.backoff.weight, reps: boReps, rpe: 10, done: true, kind: 'backoff', partials: p.partials || undefined })
        }
        return { exerciseId: ex.id, sets }
      })
      sessions.push({ id: uid(), date, dayId: day.id, entries, createdAt: `${date}T18:00:00.000Z` })
    }
  }

  return { ...defaultState, profile, exercises, sessions, routine }
}
