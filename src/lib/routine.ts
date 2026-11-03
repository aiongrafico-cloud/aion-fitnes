import { clamp, estimate1RM, roundToPlate, weightForReps } from './oneRepMax'
import { programWeekOf, todayISO } from './date'
import { analyzeExercise, effectiveLoad, totalWeeksFor } from './program'
import { uid } from './storage'
import { kg } from './format'
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
 * Rutina predeterminada: Push / Pull / Pierna A / Torso / Pierna B (5 días)
 * Series rectas con doble progresión: N series × rango de reps a un RIR objetivo.
 * ──────────────────────────────────────────────────────────────────────────── */

interface TemplateItem {
  name: string
  group: MuscleGroup
  unilateral?: boolean
  /** Rango de reps (en Top Set + Back-off: el del Top Set). */
  top: [number, number]
  /** Solo Top Set + Back-off. */
  backoff?: [number, number]
  /** Series rectas: número de series de trabajo y RIR objetivo. */
  sets?: number
  rir?: [number, number]
  rest: number
  lp?: boolean
  notes: string
  /** Nombres anteriores del mismo ejercicio: se reutiliza su historial y su calibración. */
  aliases?: string[]
  /** Peso de referencia para la demo (kg). */
  sample: number
}

interface TemplateDay {
  name: string
  focus: string
  /** Día de descanso a continuación (solo informativo). */
  restAfter?: boolean
  items: TemplateItem[]
}

export const LEGACY_ROUTINE_NAME = 'Torso / Pierna · Top Set + Back-off'
export const DEFAULT_ROUTINE_NAME = 'Push / Pull / Pierna · 5 días'

export const DEFAULT_ROUTINE: TemplateDay[] = [
  {
    name: 'Push',
    focus: 'Pecho, hombro anterior/lateral y tríceps',
    items: [
      { name: 'Press inclinado en Multipower o mancuernas', group: 'pecho', sets: 3, top: [6, 8], rir: [1, 2], rest: 165, sample: 70, aliases: ['Press inclinado en Multipower', 'Press inclinado con mancuernas'], notes: 'Banco a 30°. Descenso controlado hasta la parte alta del esternón, sin rebotar. Con mancuernas, anota el peso de cada mancuerna.' },
      { name: 'Press banca plano con mancuernas o máquina convergente', group: 'pecho', sets: 3, top: [8, 10], rir: [1, 2], rest: 135, sample: 30, notes: 'Escápulas retraídas y pies firmes. Recorrido completo buscando el estiramiento del pectoral abajo.' },
      { name: 'Cruces en polea media / baja', group: 'pecho', sets: 3, top: [10, 12], rir: [0, 1], rest: 90, sample: 12.5, aliases: ['Cruces de abajo hacia arriba en polea'], notes: 'Poleas alineadas con el pectoral. Aducción completa y estiramiento controlado en la vuelta.' },
      { name: 'Elevaciones laterales en polea', group: 'hombros', sets: 3, top: [10, 12], rir: [0, 1], rest: 90, sample: 7.5, notes: 'Polea a la altura de la cadera. Tensión constante; sube hasta la línea del hombro sin encoger el trapecio.' },
      { name: 'Extensión de tríceps sobre la cabeza en polea', group: 'triceps', sets: 3, top: [10, 12], rir: [0, 1], rest: 90, sample: 25, notes: 'Con cuerda o barra. Codos fijos apuntando al frente; baja hasta el máximo estiramiento de la cabeza larga.' },
      { name: 'Pushdown de tríceps con barra recta', group: 'triceps', sets: 2, top: [10, 12], rir: [0, 0], rest: 90, sample: 30, aliases: ['Extensión de tríceps en polea alta'], notes: 'Codos pegados a los costados. Extensión completa y subida controlada en 2 s. Última serie al fallo.' },
    ],
  },
  {
    name: 'Pull',
    focus: 'Espalda, deltoides posterior y bíceps',
    items: [
      { name: 'Jalón al pecho con agarre neutro o cerrado', group: 'espalda', sets: 3, top: [8, 10], rir: [1, 2], rest: 150, sample: 60, notes: 'Enfoque dorsal ancho: lleva los codos hacia las costillas y estira por completo arriba.' },
      { name: 'Remo con pecho apoyado', group: 'espalda', sets: 3, top: [8, 10], rir: [1, 1], rest: 120, sample: 60, aliases: ['Remo con apoyo en el pecho'], notes: 'En máquina o banco a 45°. Pecho firme contra el apoyo para no tirar con la zona lumbar; estira las escápulas al frente.' },
      { name: 'Remo unilateral en polea baja', group: 'espalda', unilateral: true, sets: 3, top: [10, 12], rir: [1, 1], rest: 90, sample: 30, notes: 'Por lado; 90 s entre lados. Codo pegado al torso, tirando hacia la cadera.' },
      { name: 'Pájaros en máquina o Face Pulls', group: 'hombros', sets: 3, top: [12, 15], rir: [0, 1], rest: 90, sample: 30, aliases: ['Pájaros en polea (deltoides posterior)'], notes: 'Reverse Pec Deck o face pulls. Tracciona hacia afuera y atrás con el deltoides posterior, sin balanceo.' },
      { name: 'Curl predicador en máquina o banco Scott', group: 'biceps', sets: 3, top: [8, 10], rir: [0, 1], rest: 120, sample: 25, notes: 'Brazo apoyado por completo. Baja hasta casi la extensión total, sin rebotar abajo.' },
      { name: 'Curl martillo con mancuernas o polea con cuerda', group: 'biceps', sets: 2, top: [10, 12], rir: [0, 1], rest: 90, sample: 14, notes: 'Agarre neutro. Codos quietos; trabaja braquial y braquiorradial.' },
    ],
  },
  {
    name: 'Pierna A',
    focus: 'Enfoque cuádriceps',
    restAfter: true,
    items: [
      { name: 'Curl femoral sentado', group: 'isquios', sets: 3, top: [10, 12], rir: [0, 1], rest: 120, sample: 50, notes: 'Pre-activación con los isquios elongados. Almohadilla firme sobre los muslos para fijar la pelvis.' },
      { name: 'Sentadilla Hack o Prensa inclinada', group: 'cuadriceps', sets: 3, top: [6, 8], rir: [1, 2], rest: 180, sample: 100, aliases: ['Hack Squat o Sentadilla en Multipower'], notes: 'Profundidad máxima sin levantar talones ni despegar la pelvis. Bajada controlada.' },
      { name: 'Extensiones de cuádriceps en máquina', group: 'cuadriceps', sets: 3, top: [10, 12], rir: [0, 1], rest: 90, sample: 55, notes: 'Pausa de 1 s arriba y bajada controlada.' },
      { name: 'Sentadilla búlgara con mancuernas', group: 'cuadriceps', unilateral: true, sets: 2, top: [8, 10], rir: [1, 2], rest: 90, sample: 16, notes: 'Por pierna; 90 s entre piernas. Torso erguido para cargar el cuádriceps. Anota el peso de cada mancuerna.' },
      { name: 'Elevación de talones de pie en máquina', group: 'gemelos', sets: 4, top: [10, 12], rir: [0, 0], rest: 90, sample: 80, notes: 'Pausa de 2 s en el fondo (máximo estiramiento) antes de cada subida.' },
    ],
  },
  {
    name: 'Torso',
    focus: 'Pecho, espalda, hombros y brazos',
    items: [
      { name: 'Press plano con mancuernas o en máquina', group: 'pecho', sets: 3, top: [6, 8], rir: [1, 2], rest: 150, sample: 32, notes: 'Escápulas retraídas. Recorrido completo y bajada controlada.' },
      { name: 'Remo con barra apoyado en banco o Remo en T', group: 'espalda', sets: 3, top: [6, 8], rir: [1, 2], rest: 150, sample: 60, notes: 'Pecho apoyado para aislar la espalda. Tira hacia el abdomen y estira por completo abajo.' },
      { name: 'Press militar sentado con mancuernas o máquina', group: 'hombros', sets: 3, top: [8, 10], rir: [1, 2], rest: 120, sample: 20, notes: 'Respaldo ligeramente inclinado. Baja hasta la altura de las orejas o el mentón.' },
      { name: 'Jalón al pecho con agarre prono abierto', group: 'espalda', sets: 3, top: [8, 10], rir: [1, 1], rest: 120, sample: 55, notes: 'Agarre algo más ancho que los hombros. Pecho alto y codos hacia abajo y atrás.' },
      { name: 'Elevaciones laterales con mancuernas o polea', group: 'hombros', sets: 3, top: [12, 15], rir: [0, 0], rest: 90, sample: 9, notes: 'Sin impulso. Sube hasta la línea del hombro; la última serie al fallo.' },
      { name: 'Curl inclinado con mancuernas', group: 'biceps', sets: 3, top: [10, 12], rir: [0, 1], rest: 90, sample: 10, notes: 'Banco a 45–60°, brazos colgando por detrás del torso para estirar el bíceps.' },
      { name: 'Fondos en paralelas o Press cerrado en máquina', group: 'triceps', sets: 3, top: [8, 10], rir: [1, 1], rest: 120, sample: 40, notes: 'En fondos, registra como peso solo el lastre. Torso erguido para cargar el tríceps.' },
    ],
  },
  {
    name: 'Pierna B',
    focus: 'Cadena posterior: isquiotibiales y glúteo',
    restAfter: true,
    items: [
      { name: 'Peso muerto rumano', group: 'isquios', sets: 3, top: [6, 8], rir: [1, 2], rest: 180, sample: 90, notes: 'Con barra o mancuernas. Rodillas semiflexionadas fijas; cadera atrás hasta máxima tensión de isquios, espalda neutra.' },
      { name: 'Prensa pies altos o Hip Thrust', group: 'gluteos', sets: 3, top: [8, 10], rir: [1, 1], rest: 150, sample: 120, notes: 'Prensa con pies altos y abiertos, o hip thrust con pausa arriba. Enfoque glúteo.' },
      { name: 'Curl femoral tumbado o sentado', group: 'isquios', sets: 3, top: [10, 12], rir: [0, 1], rest: 90, sample: 40, aliases: ['Curl femoral acostado'], notes: 'Cadera fija. Bajada controlada hasta la extensión completa.' },
      { name: 'Zancadas hacia atrás con mancuernas', group: 'gluteos', unilateral: true, sets: 2, top: [10, 12], rir: [1, 1], rest: 90, sample: 14, notes: 'Por pierna; 90 s entre piernas. Paso largo y torso algo inclinado para el glúteo. Anota el peso de cada mancuerna.' },
      { name: 'Elevación de talones sentado (sóleo)', group: 'gemelos', sets: 3, top: [12, 15], rir: [0, 0], rest: 90, sample: 50, notes: 'Rodillas a 90°. Pausa de 2 s en el fondo antes de cada elevación.' },
    ],
  },
]

/** Semana tipo: los días de descanso van tras Pierna A y Pierna B. */
export const WEEK_LAYOUT = 'Push · Pull · Pierna A · Descanso · Torso · Pierna B · Descanso'

/** Rutina anterior (Torso / Pierna con Top Set + Back-off): se usa para migrar datos guardados. */
export const LEGACY_ROUTINE: TemplateDay[] = [
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
      { name: 'Hack Squat o Sentadilla en Multipower', group: 'cuadriceps', top: [6, 8], backoff: [8, 10], rest: 180, sample: 100, notes: 'Pies adelantados para permitir máxima flexión de rodilla sin levantar talones. Rompe la paralela con 3 s de bajada.' },
      { name: 'Curl femoral sentado', group: 'isquios', top: [6, 8], backoff: [9, 12], rest: 120, lp: true, sample: 50, notes: 'Almohadilla superior muy firme contra los muslos para inmovilizar la pelvis. En la BS, 4 parciales en la zona de extensión (estiramiento de isquios).' },
      { name: 'Extensiones de cuádriceps en máquina', group: 'cuadriceps', top: [8, 10], backoff: [10, 12], rest: 90, lp: true, sample: 55, notes: 'Pausa de 1 s arriba. Al fallar la BS, 5 parciales saliendo desde abajo hasta la mitad del recorrido.' },
      { name: 'Peso muerto rumano', group: 'isquios', top: [6, 8], backoff: [8, 10], rest: 150, sample: 90, notes: 'Con mancuernas o barra. Flexión fija de rodillas; lleva la cadera atrás hasta máxima tensión de isquios sin perder la neutralidad lumbar.' },
      { name: 'Elevación de talones de pie en máquina', group: 'gemelos', top: [8, 10], backoff: [10, 12], rest: 90, sample: 80, notes: 'Pausa obligatoria de 2–3 s abajo en máximo estiramiento para disipar la elasticidad del tendón de Aquiles antes de subir.' },
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
      { name: 'Prensa de piernas', group: 'cuadriceps', top: [8, 10], backoff: [10, 12], rest: 180, sample: 180, notes: 'Plataforma media/alta. Recorrido amplio y fluido sin que la pelvis se despegue del respaldo abajo.' },
      { name: 'Sentadilla búlgara en Multipower', group: 'gluteos', unilateral: true, top: [6, 8], backoff: [8, 10], rest: 120, sample: 40, notes: 'Por pierna; 2 min entre piernas. Torso ligeramente inclinado adelante para dirigir la tensión al glúteo mayor y vasto lateral.' },
      { name: 'Curl femoral acostado', group: 'isquios', top: [8, 10], backoff: [10, 12], rest: 120, lp: true, sample: 40, notes: 'Cadera clavada al banco. Al fallar la segunda serie, 4 parciales en la posición de máxima extensión.' },
      { name: 'Aductores en máquina', group: 'aductores', top: [10, 12], backoff: [12, 15], rest: 90, lp: true, sample: 60, notes: 'Apertura amplia controlada en 3 s y pausa de 1 s en el estiramiento.' },
      { name: 'Elevación de talones sentado (sóleo)', group: 'gemelos', top: [10, 12], backoff: [12, 15], rest: 90, sample: 50, notes: 'Rodillas a 90°. Pausa estricta de 2 s en el fondo antes de cada elevación.' },
    ],
  },
]

export interface BuiltRoutine {
  routine: Routine
  exercises: Exercise[]
  /** Peso de referencia por id de ejercicio (para la demo). */
  samples: Map<string, number>
  /** Ejercicios existentes reutilizados con otro nombre (id → nombre nuevo). */
  renames: Map<string, string>
}

/** RPE equivalente al RIR objetivo medio (RIR 1–2 → RPE 8,5). */
export function rpeForRir(rir: [number, number]): number {
  return Math.round((10 - (rir[0] + rir[1]) / 2) * 2) / 2
}

export function isStraight(item: RoutineItem): boolean {
  return item.scheme === 'straight'
}

export function rirLabel(r: [number, number]): string {
  return r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`
}

/** Resumen corto de la prescripción de un ejercicio: "3 × 6–8 · RIR 1–2" o "TS 6–8 · BS 8–10 · +LP". */
export function itemLabel(item: RoutineItem): string {
  if (isStraight(item)) return `${item.sets ?? 3} × ${item.top[0]}–${item.top[1]} · RIR ${rirLabel(item.rir ?? [1, 2])}`
  return `TS ${item.top[0]}–${item.top[1]} · BS ${item.backoff[0]}–${item.backoff[1]}${item.partials ? ' · +LP' : ''}`
}

/**
 * Crea los ejercicios y la rutina predeterminada. Reutiliza ejercicios existentes con el mismo nombre
 * (o un nombre anterior); los nuevos quedan sin calibrar hasta su primera sesión.
 */
export function buildDefaultRoutine(existing: Exercise[] = [], startWeek = 0, template: TemplateDay[] = DEFAULT_ROUTINE): BuiltRoutine {
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))
  const exercises: Exercise[] = []
  const samples = new Map<string, number>()
  const renames = new Map<string, string>()
  const used = new Set<string>()
  const days = template.map((d) => ({
    id: uid(),
    name: d.name,
    focus: d.focus,
    restAfter: d.restAfter,
    items: d.items.map((t): RoutineItem => {
      let ex = byName.get(t.name.toLowerCase())
      if (!ex) {
        const alias = (t.aliases ?? []).map((a) => byName.get(a.toLowerCase())).find((e) => e && !used.has(e.id))
        if (alias) {
          ex = alias
          renames.set(alias.id, t.name)
        }
      }
      const straight = t.sets != null
      if (!ex) {
        ex = {
          id: uid(),
          name: t.name,
          muscleGroup: t.group,
          bodyweight: false,
          unilateral: t.unilateral,
          baseline: { weight: 0, reps: t.top[0], rpe: straight ? rpeForRir(t.rir ?? [1, 2]) : PROTOCOL.topRpe },
          weeklyIncrement: 0,
          startWeek,
          createdAt: new Date().toISOString(),
          calibrated: false,
        }
        exercises.push(ex)
        byName.set(t.name.toLowerCase(), ex)
      }
      used.add(ex.id)
      samples.set(ex.id, t.sample)
      return straight
        ? { id: uid(), exerciseId: ex.id, scheme: 'straight', sets: t.sets, rir: t.rir ?? [1, 2], top: t.top, backoff: t.top, restSeconds: t.rest, partials: false, notes: t.notes }
        : { id: uid(), exerciseId: ex.id, top: t.top, backoff: t.backoff ?? t.top, restSeconds: t.rest, partials: !!t.lp, notes: t.notes }
    }),
  }))
  const name = template === DEFAULT_ROUTINE ? DEFAULT_ROUTINE_NAME : LEGACY_ROUTINE_NAME
  return { routine: { name, days }, exercises, samples, renames }
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
  /** Ajuste por doble progresión respecto a lo que pedía la curva. */
  adjust?: ProgressionAlert
  /** Series rectas: `top` es el peso de todas las series de trabajo. */
  straight: boolean
  /** Número de series de trabajo (Top Set + Back-off cuenta 2). */
  workSets: number
  /** RIR objetivo (series rectas). */
  rir?: [number, number]
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

/** Aproximaciones para series rectas: completas en rangos bajos, 1–2 en ejercicios de más repeticiones. */
function straightWarmups(weight: number, hi: number, rounding: number): { weight: number; reps: number }[] {
  if (hi <= 8) return warmupSets(weight, rounding)
  const scheme = hi <= 10 ? [[0.6, 8], [0.8, 4]] : [[0.6, 8]]
  return scheme.map(([p, r]) => ({ weight: Math.max(0, roundToPlate(weight * p, rounding)), reps: r }))
}

/** Series rectas: todas las series con el mismo peso, apuntando al centro del rango con el RIR objetivo. */
function straightFor(targetE1RM: number, item: RoutineItem, settings: Settings, deload: boolean, week: number, calibrate: boolean, override?: number): ProtocolPlan {
  const rir = item.rir ?? [1, 2]
  const target = deload ? item.top[0] : Math.floor((item.top[0] + item.top[1]) / 2)
  const rpe = deload ? PROTOCOL.deloadTopRpe : rpeForRir(rir)
  const weight = calibrate ? 0 : override ?? Math.max(0, roundToPlate(weightForReps(targetE1RM, target, rpe, settings.formula), settings.rounding))
  const sets = item.sets ?? 3
  return {
    week,
    deload,
    calibrate,
    targetE1RM,
    warmups: straightWarmups(weight, item.top[1], settings.rounding),
    top: { weight, reps: item.top, target, rpe },
    backoff: null,
    partials: 0,
    restSeconds: item.restSeconds,
    straight: true,
    workSets: deload ? Math.max(1, sets - 1) : sets,
    rir: deload ? [3, 3] : rir,
  }
}

/** Prescripción pura del protocolo para un 1RM objetivo. El Top Set apunta al centro del rango a RIR ~0,5. */
export function protocolFor(targetE1RM: number, item: RoutineItem, settings: Settings, deload: boolean, week = 0, calibrate = false, topOverride?: number): ProtocolPlan {
  if (isStraight(item)) return straightFor(targetE1RM, item, settings, deload, week, calibrate, topOverride)
  const topTarget = deload ? item.top[0] : Math.round((item.top[0] + item.top[1]) / 2)
  const topRpe = deload ? PROTOCOL.deloadTopRpe : PROTOCOL.topRpe
  const topWeight = calibrate ? 0 : topOverride ?? Math.max(0, roundToPlate(weightForReps(targetE1RM, topTarget, topRpe, settings.formula), settings.rounding))
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
    straight: false,
    workSets: deload ? 1 : 2,
  }
}

/** Prescripción del protocolo para entrenar en una fecha (estable dentro de la semana). */
export function protocolForDate(ex: Exercise, item: RoutineItem, profile: Profile, sessions: Session[], settings: Settings, date = todayISO()): ProtocolPlan {
  const W = totalWeeksFor(ex, profile)
  const week = clamp(programWeekOf(profile.startDate, date), 1, W)
  if (!isCalibrated(ex)) return protocolFor(0, item, settings, false, week, true)
  const a = analyzeExercise(ex, profile, sessions, settings, { untilWeek: week - 1, today: date })
  const { targetE1RM, deload } = a.plan[week]
  const plan = protocolFor(targetE1RM, item, settings, deload, week)
  if (deload) return plan
  // Doble progresión: si el último Top Set superó el rango se sube como mínimo un escalón;
  // si se quedó corto, no se pide más peso que el que corresponde a su 1RM real.
  const alert = progressionAlert(ex, item, sessions, profile, settings, date)
  if (alert?.kind === 'subir' && alert.to != null && plan.top.weight < alert.to) return { ...protocolFor(targetE1RM, item, settings, false, week, false, alert.to), adjust: alert }
  if (alert?.kind === 'bajar' && alert.to != null && plan.top.weight > alert.to) return { ...protocolFor(targetE1RM, item, settings, false, week, false, alert.to), adjust: alert }
  return plan
}

/* ────────────────────────────────────────────────────────────────────────────
 * Alertas de progresión del Top Set (doble progresión)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TopSetRecord {
  date: string
  weight: number
  reps: number
  rpe?: number
  e1rm: number
  /** Top Set de descarga (RPE ≤ 7,5): no cuenta para decidir subidas. */
  deload: boolean
  /** Reps de cada serie de trabajo (series rectas; en Top Set + Back-off, solo el Top Set). */
  allReps: number[]
}

export type ProgressionKind = 'subir' | 'bajar' | 'estancado' | 'enRango'

export interface ProgressionAlert {
  kind: ProgressionKind
  exerciseId: string
  title: string
  message: string
  last: TopSetRecord
  /** Peso sugerido para el próximo Top Set. */
  to?: number
}

/**
 * Historial de la serie clave de un ejercicio hasta una fecha (incluida), en orden cronológico:
 * el Top Set, o en series rectas la primera serie de trabajo (con las reps de todas).
 */
export function topSetHistory(ex: Exercise, sessions: Session[], profile: Profile, settings: Settings, until = '9999-12-31', straight = false): TopSetRecord[] {
  const out: TopSetRecord[] = []
  const sorted = [...sessions].filter((s) => s.date <= until).sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))
  const kind = straight ? 'work' : 'top'
  for (const s of sorted) {
    const entry = s.entries.find((e) => e.exerciseId === ex.id)
    const work = entry?.sets.filter((st) => st.kind === kind && st.done && st.reps > 0) ?? []
    const top = work[0]
    if (!top) continue
    const e1rm = Math.max(...work.map((w) => estimate1RM(effectiveLoad(ex, w.weight, profile.bodyweight), w.reps, w.rpe, settings.formula)))
    // En series rectas solo cuentan las series hechas con el peso de la primera.
    const allReps = straight ? work.filter((w) => w.weight >= top.weight).map((w) => w.reps) : [top.reps]
    out.push({ date: s.date, weight: top.weight, reps: top.reps, rpe: top.rpe, e1rm, deload: top.rpe != null && top.rpe <= 7.5, allReps })
  }
  return out
}

/** Escalón de subida: 2,5 % de la carga, como mínimo el incremento de discos. */
export function progressionStep(weight: number, rounding: number): number {
  return Math.max(rounding, roundToPlate(weight * 0.025, rounding))
}

/**
 * Evalúa el último Top Set frente al rango de la rutina:
 * - tope del rango alcanzado → subir un escalón
 * - por debajo del rango → bajar al peso que su 1RM permite en el centro del rango
 * - 3 sesiones seguidas sin mejorar el 1RM → estancamiento
 */
export function progressionAlert(ex: Exercise, item: RoutineItem, sessions: Session[], profile: Profile, settings: Settings, until = '9999-12-31'): ProgressionAlert | null {
  if (!isCalibrated(ex)) return null
  const straight = isStraight(item)
  const hist = topSetHistory(ex, sessions, profile, settings, until, straight).filter((h) => !h.deload)
  const last = hist[hist.length - 1]
  if (!last) return null
  const [lo, hi] = item.top
  if (straight) return straightAlert(ex, item, hist, profile, settings)
  if (last.reps >= hi) {
    const to = last.weight + progressionStep(last.weight, settings.rounding)
    return {
      kind: 'subir',
      exerciseId: ex.id,
      last,
      to,
      title: 'Sube el Top Set',
      message: `${last.reps} reps con ${kg(last.weight)}: tocaste el tope del rango (${lo}–${hi}). Próximo Top Set con ${kg(to)}.`,
    }
  }
  if (last.reps < lo) {
    const mid = Math.round((lo + hi) / 2)
    const fit = roundToPlate(weightForReps(last.e1rm, mid, PROTOCOL.topRpe, settings.formula) - (ex.bodyweight ? profile.bodyweight : 0), settings.rounding)
    const to = Math.max(0, Math.min(fit, last.weight - settings.rounding))
    return {
      kind: 'bajar',
      exerciseId: ex.id,
      last,
      to,
      title: 'Ajusta la carga',
      message: `${last.reps} reps con ${kg(last.weight)}: por debajo del rango (${lo}–${hi}). Próximo Top Set con ${kg(to)} para volver al rango.`,
    }
  }
  if (hist.length >= 4) {
    const recent = hist.slice(-3)
    const before = Math.max(...hist.slice(0, -3).map((h) => h.e1rm))
    if (Math.max(...recent.map((h) => h.e1rm)) <= before * 1.005) {
      return {
        kind: 'estancado',
        exerciseId: ex.id,
        last,
        title: 'Estancado',
        message: `3 sesiones sin superar tu mejor 1RM (${kg(before)}). Revisa descanso y técnica, o adelanta una descarga.`,
      }
    }
  }
  return {
    kind: 'enRango',
    exerciseId: ex.id,
    last,
    title: 'En rango',
    message: `${last.reps} reps con ${kg(last.weight)}. Sigue con ese peso hasta llegar a ${hi} reps.`,
  }
}

function stallAlert(ex: Exercise, hist: TopSetRecord[]): ProgressionAlert | null {
  if (hist.length < 4) return null
  const recent = hist.slice(-3)
  const before = Math.max(...hist.slice(0, -3).map((h) => h.e1rm))
  if (Math.max(...recent.map((h) => h.e1rm)) > before * 1.005) return null
  return {
    kind: 'estancado',
    exerciseId: ex.id,
    last: hist[hist.length - 1],
    title: 'Estancado',
    message: `3 sesiones sin superar tu mejor 1RM (${kg(before)}). Revisa descanso y técnica, o adelanta una descarga.`,
  }
}

/** Doble progresión en series rectas: se sube cuando TODAS las series llegan al tope del rango. */
function straightAlert(ex: Exercise, item: RoutineItem, hist: TopSetRecord[], profile: Profile, settings: Settings): ProgressionAlert {
  const last = hist[hist.length - 1]
  const [lo, hi] = item.top
  const planned = item.sets ?? 3
  const reps = last.allReps
  const repsTxt = reps.join('/')
  if (reps.length >= planned && reps.every((r) => r >= hi)) {
    const to = last.weight + progressionStep(last.weight, settings.rounding)
    return {
      kind: 'subir',
      exerciseId: ex.id,
      last,
      to,
      title: 'Sube el peso',
      message: `${repsTxt} reps con ${kg(last.weight)}: todas las series en el tope del rango (${lo}–${hi}). Próxima sesión con ${kg(to)}.`,
    }
  }
  if (reps[0] < lo) {
    const mid = Math.floor((lo + hi) / 2)
    const fit = roundToPlate(weightForReps(last.e1rm, mid, rpeForRir(item.rir ?? [1, 2]), settings.formula) - (ex.bodyweight ? profile.bodyweight : 0), settings.rounding)
    const to = Math.max(0, Math.min(fit, last.weight - settings.rounding))
    return {
      kind: 'bajar',
      exerciseId: ex.id,
      last,
      to,
      title: 'Ajusta la carga',
      message: `${repsTxt} reps con ${kg(last.weight)}: la primera serie quedó por debajo del rango (${lo}–${hi}). Próxima sesión con ${kg(to)}.`,
    }
  }
  return (
    stallAlert(ex, hist) ?? {
      kind: 'enRango',
      exerciseId: ex.id,
      last,
      title: 'En rango',
      message: `${repsTxt} reps con ${kg(last.weight)}. Mantén el peso hasta hacer ${hi} reps en las ${planned} series.`,
    }
  )
}

/** Series precargadas en el logger para un ejercicio de la rutina. */
export function setsFromProtocol(p: ProtocolPlan): Omit<SetLog, 'id'>[] {
  const sets: Omit<SetLog, 'id'>[] = p.warmups.map((w) => ({ weight: w.weight, reps: w.reps, done: false, kind: 'warmup' as const }))
  if (p.straight) {
    for (let i = 0; i < p.workSets; i++) sets.push({ weight: p.top.weight, reps: p.top.target, rpe: p.top.rpe, done: false, kind: 'work' })
    return sets
  }
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
