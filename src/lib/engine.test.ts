import { describe, expect, it } from 'vitest'
import { brzycki, epley, estimate1RM, weightForReps, roundToPlate } from './oneRepMax'
import { analyzeExercise, fitResponse, growthSchedule, isDeloadWeek, prescribe, projectCurve, todaysPrescription } from './program'
import { summarizeSessions } from './analytics'
import { buildDemoState } from './demo'
import { addDays, programWeekOf } from './date'
import { defaultState } from './storage'
import type { Exercise, Profile, RoutineItem, Session } from './types'
import { buildDefaultRoutine, nextDayIndex, protocolFor, protocolForDate } from './routine'

const settings = defaultState.settings
const profile: Profile = {
  name: 'T', age: 30, sex: 'masculino', bodyweight: 80, experience: 'intermedio', daysPerWeek: 4,
  goal: 'fuerza', programWeeks: 12, startDate: '2026-01-05',
}
const bench: Exercise = {
  id: 'b', name: 'Banca', muscleGroup: 'pecho', bodyweight: false, baseline: { weight: 100, reps: 5, rpe: 10 },
  weeklyIncrement: 2.5, startWeek: 0, createdAt: '2026-01-05',
}

describe('1RM', () => {
  it('Epley y Brzycki coinciden con los valores de referencia', () => {
    expect(epley(100, 5)).toBeCloseTo(116.667, 2)
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 2)
    expect(epley(100, 1)).toBe(100)
  })
  it('el RPE añade repeticiones en reserva', () => {
    expect(estimate1RM(100, 5, 8, 'epley')).toBeCloseTo(epley(100, 7), 6)
    expect(estimate1RM(100, 5, 10, 'promedio')).toBeCloseTo((116.667 + 112.5) / 2, 2)
  })
  it('weightForReps es la inversa exacta', () => {
    for (const f of ['epley', 'brzycki', 'promedio'] as const) {
      for (const [w, r, rpe] of [[100, 5, 8], [60, 12, 7], [140, 2, 9]]) {
        const e = estimate1RM(w, r, rpe, f)
        expect(weightForReps(e, r, rpe, f)).toBeCloseTo(w, 6)
      }
    }
  })
  it('redondea a discos', () => expect(roundToPlate(83.7, 2.5)).toBe(82.5))
})

describe('programa', () => {
  it('programa descargas cada 4 semanas en intermedio, no en la última', () => {
    expect(isDeloadWeek(4, 4, 12)).toBe(true)
    expect(isDeloadWeek(12, 4, 12)).toBe(false)
    const g = growthSchedule(bench, profile, settings)
    expect(g[4]).toBe(0)
    expect(g[8]).toBe(0)
    expect(g[1]).toBeGreaterThan(g[2]) // rendimientos decrecientes
  })
  it('la curva crece monótonamente y se aplana en descargas', () => {
    const g = growthSchedule(bench, profile, settings)
    const c = projectCurve(g, 0, 112) as number[]
    for (let w = 1; w < c.length; w++) expect(c[w]).toBeGreaterThanOrEqual(c[w - 1])
    expect(c[4]).toBeCloseTo(c[3], 9)
  })
  it('prescribe peso coherente con el objetivo y menor en descarga', () => {
    const p = prescribe(3, 120, bench, profile, settings)
    expect(p.sets).toBe(5)
    expect(p.reps).toBe(5)
    expect(p.weight % 2.5).toBe(0)
    const d = prescribe(4, 120, bench, profile, settings)
    expect(d.deload).toBe(true)
    expect(d.weight).toBeLessThan(p.weight)
    expect(d.sets).toBeLessThan(p.sets)
  })
})

function sessionAt(week: number, weight: number, reps: number, rpe: number): Session {
  const date = addDays(profile.startDate, (week - 1) * 7 + 2)
  return { id: `s${week}`, date, createdAt: date, entries: [{ exerciseId: 'b', sets: [{ id: 'x', weight, reps, rpe, done: true }] }] }
}

describe('recálculo adaptativo', () => {
  it('sin datos, la proyección ajustada es la original', () => {
    const a = analyzeExercise(bench, profile, [], settings, { today: '2026-01-06' })
    expect(a.fit.multiplier).toBe(1)
    expect(a.projectedEnd).toBeCloseTo(a.originalEnd, 6)
  })
  it('superar el plan eleva la curva; quedarse corto la baja', () => {
    const a0 = analyzeExercise(bench, profile, [], settings)
    const strong = [1, 2, 3].map((w) => sessionAt(w, a0.plan[w].weight + 7.5, 5, 8))
    const weak = [1, 2, 3].map((w) => sessionAt(w, a0.plan[w].weight - 7.5, 5, 8))
    const s = analyzeExercise(bench, profile, strong, settings)
    const k = analyzeExercise(bench, profile, weak, settings)
    expect(s.fit.multiplier).toBeGreaterThan(1)
    expect(k.fit.multiplier).toBeLessThan(1)
    expect(s.projectedEnd).toBeGreaterThan(a0.originalEnd)
    expect(k.projectedEnd).toBeLessThan(a0.originalEnd)
    expect(s.anchorWeek).toBe(3)
  })
  it('fitResponse recupera el multiplicador verdadero con datos sin ruido', () => {
    const g = growthSchedule(bench, profile, settings)
    const best = new Map<number, number>()
    let S = 0
    for (let w = 1; w <= 10; w++) { S += Math.log(1 + g[w]); best.set(w, 100 * Math.exp(1.5 * S)) }
    const fit = fitResponse(100, g, best, new Set([4, 8]))
    expect(fit.observed).toBeCloseTo(1.5, 6)
    expect(fit.multiplier).toBeGreaterThan(1.3)
  })
  it('la prescripción de hoy no cambia con sesiones de la semana en curso', () => {
    const today = addDays(profile.startDate, 15) // semana 3
    expect(programWeekOf(profile.startDate, today)).toBe(3)
    const before = todaysPrescription(bench, profile, [], settings, today)
    const after = todaysPrescription(bench, profile, [sessionAt(3, 150, 5, 8)], settings, today)
    expect(after.weight).toBe(before.weight)
  })
})

describe('analítica y demo', () => {
  it('detecta PRs y calcula tonelaje', () => {
    const s = [sessionAt(1, 100, 5, 9), sessionAt(2, 105, 5, 9)]
    const sum = summarizeSessions(s, [bench], profile, settings)
    expect(sum[0].tonnage).toBe(500)
    expect(sum[1].prs.length).toBe(1)
  })
  it('la demo genera la rutina con respuestas distintas por ejercicio', () => {
    const st = buildDemoState('2026-06-01')
    const res = st.exercises.map((e) => analyzeExercise(e, st.profile!, st.sessions, st.settings, { today: '2026-06-01' }))
    const ms = res.map((r) => r.fit.multiplier)
    expect(Math.max(...ms) - Math.min(...ms)).toBeGreaterThan(0.1)
    expect(st.sessions.length).toBeGreaterThan(15)
    expect(st.sessions.every((x) => x.dayId)).toBe(true)
  })
})

describe('rutina Top Set + Back-off', () => {
  const item: RoutineItem = { id: 'i', exerciseId: 'b', top: [6, 8], backoff: [8, 10], restSeconds: 180, partials: true, notes: '' }
  it('la rutina predeterminada tiene 4 días y 22 ejercicios sin calibrar', () => {
    const { routine, exercises } = buildDefaultRoutine()
    expect(routine.days.map((d) => d.name)).toEqual(['Torso A', 'Pierna A', 'Torso B', 'Pierna B'])
    expect(exercises.length).toBe(22)
    expect(exercises.every((e) => e.calibrated === false)).toBe(true)
  })
  it('Back-off un 12,5 % por debajo del Top Set, al fallo y con parciales', () => {
    const p = protocolFor(120, item, settings, false)
    expect(p.top.target).toBe(7)
    expect(p.top.rpe).toBe(9.5)
    expect(estimate1RM(p.top.weight, 7, 9.5)).toBeCloseTo(120, -1)
    expect(p.backoff!.weight).toBe(roundToPlate(p.top.weight * 0.875, 2.5))
    expect(p.backoff!.rpe).toBe(10)
    expect(p.partials).toBe(4)
    expect(p.warmups.length).toBe(3)
    expect(p.warmups.every((w) => w.weight < p.top.weight)).toBe(true)
  })
  it('en descarga: Top Set a RIR 3 y sin Back-off', () => {
    const p = protocolFor(120, item, settings, true)
    expect(p.backoff).toBeNull()
    expect(p.top.rpe).toBe(7)
    expect(p.partials).toBe(0)
  })
  it('un ejercicio sin calibrar pide calibración', () => {
    const ex = { ...bench, calibrated: false, baseline: { weight: 0, reps: 8, rpe: 9.5 } }
    const p = protocolForDate(ex, item, profile, [], settings, '2026-01-07')
    expect(p.calibrate).toBe(true)
  })
  it('la rotación sigue al último día entrenado', () => {
    const { routine } = buildDefaultRoutine()
    expect(nextDayIndex(routine, [])).toBe(0)
    const s: Session = { id: 'x', date: '2026-01-06', createdAt: '2026-01-06', dayId: routine.days[3].id, entries: [] }
    expect(nextDayIndex(routine, [s])).toBe(0)
    expect(nextDayIndex(routine, [{ ...s, dayId: routine.days[1].id }])).toBe(2)
  })
  it('las aproximaciones no cuentan para el 1RM ni el tonelaje', () => {
    const sess: Session = { id: 'w', date: '2026-01-07', createdAt: '2026-01-07', entries: [{ exerciseId: 'b', sets: [{ id: '1', weight: 200, reps: 10, done: true, kind: 'warmup' }, { id: '2', weight: 100, reps: 5, rpe: 10, done: true, kind: 'top' }] }] }
    const sum = summarizeSessions([sess], [bench], profile, settings)
    expect(sum[0].tonnage).toBe(500)
    expect(sum[0].bestByExercise.get('b')).toBeCloseTo(estimate1RM(100, 5, 10), 6)
  })
})
