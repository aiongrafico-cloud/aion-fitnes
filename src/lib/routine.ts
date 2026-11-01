import { clamp, roundToPlate, weightForReps } from './oneRepMax'
import { programWeekOf, todayISO } from './date'
import { analyzeExercise, totalWeeksFor } from './program'
import { uid } from './storage'
import type { Exercise, MuscleGroup, Profile, Routine, RoutineItem, Session, SetLog, Settings } from './types'

/* ────────────────────────────────────────────────────────────────────────────
 * Protocolo de trabajo: Calentamiento → Top Set (RIR 1–0) → Back-off (−10–15 %, RIR 0) [+LP]
 * ──────────────────────────────────────────────────────────────────────────── */

export const PROTOCOL = {
  /** RPE objetivo del Top Set (RIR 1–0 → RPE 9–10, punto medio 9,5). */
  topRpe: 9.5,
  /** RPE del Back-off: fallo concéntrico absoluto. */
  backoffRpe: 10,
  /** Reducción de carga del Back-off respecto al Top Set (10–15 % → 12,5 %). */
  backoffDrop: 0.125,
  /** Parciales [+LP] sugeridas al fallar el Back-off. */
  partials: 4,
  /** En semana de descarga: Top Set a RIR 3 y sin Back-off. */
  deloadTopRpe: 7,
  warmupRestSeconds: 60,
}

export const PROTOCOL_STEPS = [
  { key: 'Calentamiento', text: '2–3 series de aproximación progresivas, sin cansancio: activar articulaciones y calibrar el peso.' },
  { key: 'Top Set', text: '1 serie con la carga más pesada posible dentro del rango a RIR 1–0 (fallo concéntrico técnico).' },
  { key: 'Back-off', text: 'Tras el descanso indicado, baja el peso un 10–15 % y ve al fallo concéntrico absoluto (RIR 0).' },
  { key: '+LP', text: 'Al fallar el Back-off, 3–5 parciales en la mitad inferior del recorrido (máximo estiramiento).' },
]

/* ────────────────────────────────────────────────────────────────────────────
 * Rutina predeterminada: Torso / Pierna, 4 días
 * ──────────────────────────────────────────────────────────────────────────── */

interface TemplateItem {
  name: string
  group: MuscleGroup
  unilateral?: boolean
  top: [number, number]
  backoff: [number, number]
  rest: number
  lp?: boolean
  notes: string
  /** Peso de referencia para la demo (Top Set, kg). */
  sample: number
}

interface TemplateDay {
  name: string
  focus: string
  items: TemplateItem[]
}

export const DEFAULT_ROUTINE_NAME = 'Torso / Pierna · Top Set + Back-off'

export const DEFAULT_ROUTINE: TemplateDay[] = [
  {
    name: 'Torso A',
    focus: 'Pectoral superior y espalda',
    items: [
      { name: 'Press inclinado en Multipower', group: 'pecho', top: [6, 8], backoff: [8, 10], rest: 180, sample: 70, notes: 'Banco a 30°–35°. Descenso controlado en 3 s hasta rozar la parte alta del esternón (debajo de la clavícula). Pausa de 1 s abajo sin rebotar.' },
      { name: 'Cruces de abajo hacia arriba en polea', group: 'pecho', top: [8, 10], backoff: [10, 12], rest: 120, lp: true, sample: 12.5, notes: 'Poleas a la altura de los tobillos. Aducción diagonal llevando los puños hacia el mentón. En la BS, remata con 4 parciales desde el estiramiento profundo abajo.' },
      { name: 'Remo con apoyo en el pecho', group: 'espalda', top: [6, 8], backoff: [8, 10], rest: 150, sample: 60, notes: 'En máquina o banco inclinado. Codos a 45° del torso. Pecho firme contra el respaldo para no tirar con la zona lumbar; estira completamente las escápulas al frente.' },
      { name: 'Jalón unilateral en polea (agarre neutro)', group: 'espalda', unilateral: true, top: [8, 10], backoff: [10, 12], rest: 90, sample: 30, notes: 'Por lado; 1,5 min entre brazos. Tira dirigiendo el codo en línea recta hacia la cadera para ensanchar el dorsal alto y medio.' },
      { name: 'Elevaciones laterales en polea', group: 'hombros', top: [8, 10], backoff: [10, 12], rest: 90, lp: true, sample: 7.5, notes: 'Cables cruzados tras la cadera, poleas a la altura de rodillas o cadera. Tensión constante; remata la última serie con parciales en la base.' },
      { name: 'Extensión de tríceps en polea alta', group: 'triceps', top: [8, 10], backoff: [10, 12], rest: 90, lp: true, sample: 30, notes: 'Barra recta o empuñaduras. Codos bloqueados contra los costados; fase excéntrica (subida) en 2 s controlados.' },
    ],
  },
  {
    name: 'Pierna A',
    focus: 'Cuádriceps',
    items: [
      { name: 'Hack Squat o Sentadilla en Multipower', group: 'piernas', top: [6, 8], backoff: [8, 10], rest: 180, sample: 100, notes: 'Pies adelantados para permitir máxima flexión de rodilla sin levantar talones. Rompe la paralela con 3 s de bajada.' },
      { name: 'Curl femoral sentado', group: 'piernas', top: [6, 8], backoff: [9, 12], rest: 120, lp: true, sample: 50, notes: 'Almohadilla superior muy firme contra los muslos para inmovilizar la pelvis. En la BS, 4 parciales en la zona de extensión (estiramiento de isquios).' },
      { name: 'Extensiones de cuádriceps en máquina', group: 'piernas', top: [8, 10], backoff: [10, 12], rest: 90, lp: true, sample: 55, notes: 'Pausa de 1 s arriba. Al fallar la BS, 5 parciales saliendo desde abajo hasta la mitad del recorrido.' },
      { name: 'Peso muerto rumano', group: 'piernas', top: [6, 8], backoff: [8, 10], rest: 150, sample: 90, notes: 'Con mancuernas o barra. Flexión fija de rodillas; lleva la cadera atrás hasta máxima tensión de isquios sin perder la neutralidad lumbar.' },
      { name: 'Elevación de talones de pie en máquina', group: 'piernas', top: [8, 10], backoff: [10, 12], rest: 90, sample: 80, notes: 'Pausa obligatoria de 2–3 s abajo en máximo estiramiento para disipar la elasticidad del tendón de Aquiles antes de subir.' },
    ],
  },
  {
    name: 'Torso B',
    focus: 'Clavicular, estabilidad y espalda media',
    items: [
      { name: 'Press inclinado con mancuernas', group: 'pecho', top: [6, 8], backoff: [8, 10], rest: 180, sample: 28, notes: 'O máquina convergente inclinada. Banco a 30°, agarre semi-neutro (palmas a 45°). Desciende profundo para estirar al máximo el pectoral superior. Peso por mancuerna.' },
      { name: 'Pec Deck (asiento bajo)', group: 'pecho', top: [8, 10], backoff: [10, 12], rest: 120, lp: true, sample: 50, notes: 'Asiento bajo para que los brazos queden a la altura de la clavícula. En la BS, 4 parciales solo en el recorrido amplio/abierto.' },
      { name: 'Remo en polea baja agarre neutro amplio', group: 'espalda', top: [8, 10], backoff: [10, 12], rest: 120, sample: 55, notes: 'Codos abiertos a 60° con retracción escapular pronunciada al final para corregir hombros adelantados.' },
      { name: 'Press militar sentado en Multipower', group: 'hombros', top: [6, 8], backoff: [8, 10], rest: 150, sample: 45, notes: 'Respaldo a 75° (no a 90°). Baja la barra controlada hasta la altura de la nariz o el mentón.' },
      { name: 'Pájaros en polea (deltoides posterior)', group: 'hombros', top: [10, 12], backoff: [12, 15], rest: 90, lp: true, sample: 7.5, notes: 'Cables cruzados a la altura de los hombros, sin manerales (sujeta los cables). Tracciona hacia afuera y atrás.' },
      { name: 'Curl bayesiano en polea', group: 'biceps', top: [8, 10], backoff: [10, 12], rest: 90, lp: true, sample: 12.5, notes: 'De espaldas a la polea baja; el brazo empieza por detrás de la línea del torso para estirar la cabeza larga del bíceps.' },
    ],
  },
  {
    name: 'Pierna B',
    focus: 'Cadena posterior y glúteo',
    items: [
      { name: 'Prensa de piernas', group: 'piernas', top: [8, 10], backoff: [10, 12], rest: 180, sample: 180, notes: 'Plataforma media/alta. Recorrido amplio y fluido sin que la pelvis se despegue del respaldo abajo.' },
      { name: 'Sentadilla búlgara en Multipower', group: 'gluteos', unilateral: true, top: [6, 8], backoff: [8, 10], rest: 120, sample: 40, notes: 'Por pierna; 2 min entre piernas. Torso ligeramente inclinado adelante para dirigir la tensión al glúteo mayor y vasto lateral.' },
      { name: 'Curl femoral acostado', group: 'piernas', top: [8, 10], backoff: [10, 12], rest: 120, lp: true, sample: 40, notes: 'Cadera clavada al banco. Al fallar la segunda serie, 4 parciales en la posición de máxima extensión.' },
      { name: 'Aductores en máquina', group: 'piernas', top: [10, 12], backoff: [12, 15], rest: 90, lp: true, sample: 60, notes: 'Apertura amplia controlada en 3 s y pausa de 1 s en el estiramiento.' },
      { name: 'Elevación de talones sentado (sóleo)', group: 'piernas', top: [10, 12], backoff: [12, 15], rest: 90, sample: 50, notes: 'Rodillas a 90°. Pausa estricta de 2 s en el fondo antes de cada elevación.' },
    ],
  },
]

export interface BuiltRoutine {
  routine: Routine
  exercises: Exercise[]
  /** Peso de referencia por id de ejercicio (para la demo). */
  samples: Map<string, number>
}

/**
 * Crea los ejercicios y la rutina predeterminada. Reutiliza ejercicios existentes con el mismo nombre;
 * los nuevos quedan sin calibrar hasta su primera sesión.
 */
export function buildDefaultRoutine(existing: Exercise[] = [], startWeek = 0): BuiltRoutine {
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))
  const exercises: Exercise[] = []
  const samples = new Map<string, number>()
  const days = DEFAULT_ROUTINE.map((d) => ({
    id: uid(),
    name: d.name,
    focus: d.focus,
    items: d.items.map((t): RoutineItem => {
      let ex = byName.get(t.name.toLowerCase())
      if (!ex) {
        ex = {
          id: uid(),
          name: t.name,
          muscleGroup: t.group,
          bodyweight: false,
          unilateral: t.unilateral,
          baseline: { weight: 0, reps: t.top[0], rpe: PROTOCOL.topRpe },
          weeklyIncrement: 0,
          startWeek,
          createdAt: new Date().toISOString(),
          calibrated: false,
        }
        exercises.push(ex)
        byName.set(t.name.toLowerCase(), ex)
      }
      samples.set(ex.id, t.sample)
      return { id: uid(), exerciseId: ex.id, top: t.top, backoff: t.backoff, restSeconds: t.rest, partials: !!t.lp, notes: t.notes }
    }),
  }))
  return { routine: { name: DEFAULT_ROUTINE_NAME, days }, exercises, samples }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Prescripción del protocolo
 * ──────────────────────────────────────────────────────────────────────────── */

export function isCalibrated(ex: Exercise): boolean {
  return ex.calibrated !== false
}

export { isWorkSet } from './program'

export interface ProtocolPlan {
  week: number
  deload: boolean
  calibrate: boolean
  targetE1RM: number
  warmups: { weight: number; reps: number }[]
  top: { weight: number; reps: [number, number]; target: number; rpe: number }
  backoff: { weight: number; reps: [number, number]; target: number; rpe: number } | null
  partials: number
  restSeconds: number
}

/** Series de aproximación: 2 si la carga es ligera, 3 si es pesada. */
export function warmupSets(topWeight: number, rounding: number): { weight: number; reps: number }[] {
  if (topWeight <= 0) return [
    { weight: 0, reps: 10 },
    { weight: 0, reps: 6 },
  ]
  const scheme = topWeight >= 40 ? [[0.5, 8], [0.7, 5], [0.85, 3]] : [[0.6, 8], [0.8, 4]]
  return scheme.map(([p, r]) => ({ weight: Math.max(0, roundToPlate(topWeight * p, rounding)), reps: r }))
}

/** Prescripción pura del protocolo para un 1RM objetivo. El Top Set apunta al centro del rango a RIR ~0,5. */
export function protocolFor(targetE1RM: number, item: RoutineItem, settings: Settings, deload: boolean, week = 0, calibrate = false): ProtocolPlan {
  const topTarget = deload ? item.top[0] : Math.round((item.top[0] + item.top[1]) / 2)
  const topRpe = deload ? PROTOCOL.deloadTopRpe : PROTOCOL.topRpe
  const topWeight = calibrate ? 0 : Math.max(0, roundToPlate(weightForReps(targetE1RM, topTarget, topRpe, settings.formula), settings.rounding))
  const boWeight = calibrate ? 0 : Math.max(0, roundToPlate(topWeight * (1 - PROTOCOL.backoffDrop), settings.rounding))
  const boTarget = Math.round((item.backoff[0] + item.backoff[1]) / 2)
  return {
    week,
    deload,
    calibrate,
    targetE1RM,
    warmups: warmupSets(topWeight, settings.rounding),
    top: { weight: topWeight, reps: item.top, target: topTarget, rpe: topRpe },
    backoff: deload ? null : { weight: boWeight, reps: item.backoff, target: boTarget, rpe: PROTOCOL.backoffRpe },
    partials: item.partials && !deload ? PROTOCOL.partials : 0,
    restSeconds: item.restSeconds,
  }
}

/** Prescripción del protocolo para entrenar en una fecha (estable dentro de la semana). */
export function protocolForDate(ex: Exercise, item: RoutineItem, profile: Profile, sessions: Session[], settings: Settings, date = todayISO()): ProtocolPlan {
  const W = totalWeeksFor(ex, profile)
  const week = clamp(programWeekOf(profile.startDate, date), 1, W)
  if (!isCalibrated(ex)) return protocolFor(0, item, settings, false, week, true)
  const a = analyzeExercise(ex, profile, sessions, settings, { untilWeek: week - 1, today: date })
  return protocolFor(a.plan[week].targetE1RM, item, settings, a.plan[week].deload, week)
}

/** Series precargadas en el logger para un ejercicio de la rutina. */
export function setsFromProtocol(p: ProtocolPlan): Omit<SetLog, 'id'>[] {
  const sets: Omit<SetLog, 'id'>[] = p.warmups.map((w) => ({ weight: w.weight, reps: w.reps, done: false, kind: 'warmup' as const }))
  sets.push({ weight: p.top.weight, reps: p.top.target, rpe: p.top.rpe, done: false, kind: 'top' })
  if (p.backoff) sets.push({ weight: p.backoff.weight, reps: p.backoff.target, rpe: p.backoff.rpe, done: false, kind: 'backoff', partials: p.partials || undefined })
  return sets
}

export function findRoutineItem(routine: Routine | null | undefined, exerciseId: string): RoutineItem | undefined {
  for (const d of routine?.days ?? []) {
    const it = d.items.find((i) => i.exerciseId === exerciseId)
    if (it) return it
  }
  return undefined
}

/** Siguiente día de la rotación: el posterior al último día entrenado. */
export function nextDayIndex(routine: Routine, sessions: Session[]): number {
  const last = [...sessions].filter((s) => s.dayId).sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date))).pop()
  if (!last) return 0
  const idx = routine.days.findIndex((d) => d.id === last.dayId)
  return idx < 0 ? 0 : (idx + 1) % routine.days.length
}
