export type Experience = 'principiante' | 'intermedio' | 'avanzado'
export type Goal = 'hipertrofia' | 'fuerza' | 'resistencia'
export type Sex = 'masculino' | 'femenino' | 'otro'
export type Formula = 'epley' | 'brzycki' | 'promedio'

export type MuscleGroup =
  | 'pecho'
  | 'espalda'
  | 'piernas'
  | 'gluteos'
  | 'hombros'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'cuerpo completo'
  | 'cuadriceps'
  | 'isquios'
  | 'gemelos'
  | 'aductores'

export interface Profile {
  name: string
  age: number
  sex: Sex
  bodyweight: number // kg
  height?: number // cm
  experience: Experience
  daysPerWeek: number // 2–6
  goal: Goal
  programWeeks: number // 8–12
  startDate: string // YYYY-MM-DD, inicio del ciclo actual
}

/** Medición de referencia: una serie exigente con peso, reps y RPE. */
export interface Baseline {
  weight: number // kg (en ejercicios con peso corporal: lastre añadido)
  reps: number
  rpe: number
}

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  /** Si true, la carga efectiva es peso corporal + lastre. */
  bodyweight: boolean
  baseline: Baseline
  /** Incremento deseado de carga de trabajo por semana (kg). */
  weeklyIncrement: number
  /** Semana del programa en la que el ejercicio entra al plan (0 = desde el inicio). */
  startWeek: number
  createdAt: string
  archived?: boolean
  /** false = sin línea base: se calibra con la primera sesión registrada. */
  calibrated?: boolean
  /** Ejercicio por lado (unilateral): el tonelaje cuenta ambos lados. */
  unilateral?: boolean
}

/** warmup = aproximación · top = Top Set · backoff = Back-off Set · work = serie recta · normal = serie libre */
export type SetKind = 'warmup' | 'top' | 'backoff' | 'work' | 'normal'

export interface SetLog {
  id: string
  weight: number
  reps: number
  rpe?: number
  done: boolean
  kind?: SetKind
  /** Repeticiones parciales en estiramiento [+LP] tras el fallo. */
  partials?: number
}

export interface ExerciseLog {
  exerciseId: string
  sets: SetLog[]
}

export interface Session {
  id: string
  date: string // YYYY-MM-DD
  entries: ExerciseLog[]
  notes?: string
  createdAt: string
  /** Día de rutina entrenado (si la sesión sigue la rutina). */
  dayId?: string
}

export interface RoutineItem {
  id: string
  exerciseId: string
  top: [number, number]
  backoff: [number, number]
  restSeconds: number
  /** Rematar el Back-off con parciales en estiramiento [+LP]. */
  partials: boolean
  notes: string
  /** topBackoff (por defecto) = Top Set + Back-off · straight = series rectas (sets × top a RIR rir). */
  scheme?: 'topBackoff' | 'straight'
  sets?: number
  rir?: [number, number]
}

export interface RoutineDay {
  id: string
  name: string
  focus: string
  /** Hay un día de descanso después de este. */
  restAfter?: boolean
  items: RoutineItem[]
}

export interface Routine {
  name: string
  days: RoutineDay[]
}

export interface Settings {
  formula: Formula
  rounding: number // incremento mínimo de discos (kg)
  restSeconds: number
}

/** Registro corporal: peso y medidas opcionales (cm, %). */
export interface BodyEntry {
  id: string
  date: string // YYYY-MM-DD (uno por día)
  weight?: number
  bodyFat?: number
  waist?: number
  chest?: number
  arm?: number
  thigh?: number
  hips?: number
}

export interface AppState {
  version: 1
  profile: Profile | null
  exercises: Exercise[]
  sessions: Session[]
  draft: Session | null
  settings: Settings
  routine?: Routine | null
  body?: BodyEntry[]
}
