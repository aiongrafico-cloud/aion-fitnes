import { describe, expect, it } from 'vitest'
import { brzycki, epley, estimate1RM, weightForReps, roundToPlate } from './oneRepMax'
import { analyzeExercise, fitResponse, growthSchedule, isDeloadWeek, prescribe, projectCurve, todaysPrescription } from './program'
import { summarizeSessions, weeklyMuscleVolume } from './analytics'
import { metricChange, trailingAverage } from './body'
import { buildDemoState } from './demo'
import { addDays, programWeekOf } from './date'
import { defaultState } from './storage'
import type { Exercise, Profile, RoutineItem, Session } from './types'
import { buildDefaultRoutine, LEGACY_ROUTINE, nextDayIndex, progressionAlert, protocolFor, protocolForDate, rpeForRir, setsFromProtocol } from './routine'
import { ensureRoutine } from '../store/AppStore'

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
  it('la rutina predeterminada es Push / Pull / Pierna A / Torso / Pierna B con series rectas', () => {
    const { routine, exercises } = buildDefaultRoutine()
    expect(routine.days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Pierna A', 'Torso', 'Pierna B'])
    expect(exercises.length).toBe(29)
    expect(exercises.every((e) => e.calibrated === false)).toBe(true)
    expect(routine.days.every((d) => d.items.every((i) => i.scheme === 'straight' && i.sets! >= 2))).toBe(true)
    expect(routine.days.filter((d) => d.restAfter).map((d) => d.name)).toEqual(['Pierna A', 'Pierna B'])
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
    const s: Session = { id: 'x', date: '2026-01-06', createdAt: '2026-01-06', dayId: routine.days[4].id, entries: [] }
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

describe('Mejoras: progresión, volumen y cuerpo', () => {
  const it8: RoutineItem = { id: 'r', exerciseId: 'b', top: [6, 8], backoff: [8, 10], restSeconds: 180, partials: false, notes: '' }
  const topSession = (date: string, weight: number, reps: number, rpe = 9.5): Session => ({
    id: date, date, createdAt: date, entries: [{ exerciseId: 'b', sets: [{ id: date, weight, reps, rpe, done: true, kind: 'top' }, { id: date + 'b', weight: weight * 0.875, reps: 9, rpe: 10, done: true, kind: 'backoff' }] }],
  })

  it('tocar el tope del rango sube el Top Set un escalón y la prescripción lo respeta', () => {
    const sessions = [topSession('2026-01-06', 100, 8)]
    const a = progressionAlert(bench, it8, sessions, profile, settings)!
    expect(a.kind).toBe('subir')
    expect(a.to).toBe(102.5)
    const p = protocolForDate(bench, it8, profile, sessions, settings, '2026-01-13')
    expect(p.top.weight).toBeGreaterThanOrEqual(102.5)
  })
  it('quedarse por debajo del rango baja la carga', () => {
    const a = progressionAlert(bench, it8, [topSession('2026-01-06', 100, 4)], profile, settings)!
    expect(a.kind).toBe('bajar')
    expect(a.to!).toBeLessThan(100)
  })
  it('tres sesiones sin mejorar el 1RM marcan estancamiento; las descargas no cuentan', () => {
    const sessions = [topSession('2026-01-06', 100, 7), topSession('2026-01-13', 100, 7), topSession('2026-01-16', 70, 6, 7), topSession('2026-01-20', 100, 6), topSession('2026-01-27', 100, 7)]
    expect(progressionAlert(bench, it8, sessions, profile, settings)!.kind).toBe('estancado')
    expect(progressionAlert(bench, it8, sessions.slice(0, 2), profile, settings)!.kind).toBe('enRango')
  })
  it('el volumen por músculo cuenta series efectivas de la semana y el plan de la rutina', () => {
    const sessions = [topSession('2026-01-06', 100, 7)]
    const routine = { name: 'x', days: [{ id: 'd', name: 'A', focus: '', items: [it8] }] }
    const v = weeklyMuscleVolume([bench], sessions, profile, routine, 1)
    expect(v[0].group).toBe('pecho')
    expect(v[0].sets).toBe(2)
    expect(v[0].planned).toBe(8) // 2 series × 4 días / 1 día de rutina
    expect(weeklyMuscleVolume([bench], sessions, profile, routine, 2)[0].prevSets).toBe(2)
  })
  it('el ritmo semanal de peso sale de la regresión de las últimas 4 semanas', () => {
    const body = Array.from({ length: 8 }, (_, i) => ({ id: String(i), date: addDays('2026-01-01', i * 4), weight: 80 + i * 4 * (0.3 / 7) }))
    const c = metricChange(body, 'weight')!
    expect(c.weeklyRate!).toBeCloseTo(0.3, 6)
    expect(c.total).toBeCloseTo(1.2, 6)
    expect(trailingAverage([{ date: '2026-01-01', value: 80 }, { date: '2026-01-03', value: 82 }, { date: '2026-01-20', value: 90 }])).toEqual([80, 81, 90])
  })
  it('la demo incluye registros corporales válidos', () => {
    const d = buildDemoState('2026-03-01')
    expect(d.body!.length).toBeGreaterThan(10)
    expect(d.profile!.bodyweight).toBe(d.body![d.body!.length - 1].weight)
  })
})

describe('series rectas (Push / Pull / Pierna)', () => {
  const st: RoutineItem = { id: 's', exerciseId: 'b', scheme: 'straight', sets: 3, rir: [1, 2], top: [6, 8], backoff: [6, 8], restSeconds: 165, partials: false, notes: '' }
  const work = (date: string, weight: number, reps: number[], rpe = 8.5): Session => ({
    id: date, date, createdAt: date, entries: [{ exerciseId: 'b', sets: reps.map((r, i) => ({ id: date + i, weight, reps: r, rpe, done: true, kind: 'work' as const })) }],
  })

  it('prescribe N series con el mismo peso al centro del rango y el RIR objetivo', () => {
    expect(rpeForRir([1, 2])).toBe(8.5)
    const p = protocolFor(120, st, settings, false)
    expect(p.straight).toBe(true)
    expect(p.workSets).toBe(3)
    expect(p.top.target).toBe(7)
    expect(estimate1RM(p.top.weight, 7, 8.5)).toBeCloseTo(120, -1)
    const sets = setsFromProtocol(p)
    expect(sets.filter((x) => x.kind === 'work').length).toBe(3)
    expect(sets.filter((x) => x.kind === 'work').every((x) => x.weight === p.top.weight)).toBe(true)
  })
  it('en descarga: una serie menos a RIR 3', () => {
    const p = protocolFor(120, st, settings, true)
    expect(p.workSets).toBe(2)
    expect(p.top.rpe).toBe(7)
  })
  it('solo sube cuando todas las series llegan al tope del rango', () => {
    expect(progressionAlert(bench, st, [work('2026-01-06', 90, [8, 8, 7])], profile, settings)!.kind).toBe('enRango')
    const up = progressionAlert(bench, st, [work('2026-01-06', 90, [8, 8, 8])], profile, settings)!
    expect(up.kind).toBe('subir')
    expect(up.to).toBe(92.5)
    expect(protocolForDate(bench, st, profile, [work('2026-01-06', 90, [8, 8, 8])], settings, '2026-01-13').top.weight).toBeGreaterThanOrEqual(92.5)
    expect(progressionAlert(bench, st, [work('2026-01-06', 90, [5, 5, 4])], profile, settings)!.kind).toBe('bajar')
  })
  it('migra la rutina Torso / Pierna anterior conservando historial y calibración', () => {
    const legacy = buildDefaultRoutine([], 0, LEGACY_ROUTINE)
    const incline = legacy.exercises.find((e) => e.name === 'Press inclinado en Multipower')!
    const exercises = legacy.exercises.map((e) => (e.id === incline.id ? { ...e, calibrated: true, baseline: { weight: 70, reps: 7, rpe: 9.5 } } : e))
    const old = { ...defaultState, profile: { ...profile, daysPerWeek: 4 }, exercises, routine: legacy.routine, sessions: [] }
    const next = ensureRoutine(old)
    expect(next.routine!.days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Pierna A', 'Torso', 'Pierna B'])
    expect(next.profile!.daysPerWeek).toBe(5)
    const renamed = next.exercises.find((e) => e.id === incline.id)!
    expect(renamed.name).toBe('Press inclinado en Multipower o mancuernas')
    expect(renamed.calibrated).toBe(true)
    expect(next.routine!.days[0].items[0].exerciseId).toBe(incline.id)
    // Los ejercicios de la rutina anterior que ya no se usan quedan archivados, no borrados.
    expect(next.exercises.find((e) => e.name === 'Aductores en máquina')!.archived).toBe(true)
    // Idempotente: al volver a cargar no cambia nada.
    expect(ensureRoutine(next).routine!.days[0].id).toBe(next.routine!.days[0].id)
  })
})

describe('animaciones de técnica', () => {
  it('todos los ejercicios de la rutina tienen animación y sus poses son válidas', async () => {
    const { motionFor, solve, sample } = await import('./motion')
    const { routine, exercises } = buildDefaultRoutine()
    for (const d of routine.days)
      for (const it of d.items) {
        const name = exercises.find((e) => e.id === it.exerciseId)!.name
        const m = motionFor(name)
        expect(m, name).not.toBeNull()
        for (const t of [0, 0.7, 1.9, 3.3, 5.1]) {
          const sk = solve(sample(m!, t).pose)
          for (const p of Object.values(sk)) expect(p.every(Number.isFinite), name).toBe(true)
        }
      }
  })
})
