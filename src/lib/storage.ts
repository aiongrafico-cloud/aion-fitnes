import { z } from 'zod'
import type { AppState } from './types'

export const STORAGE_KEY = 'aion-fitness:v1'

const baselineSchema = z.object({ weight: z.number().min(0), reps: z.number().int().min(1), rpe: z.number().min(5).max(10) })

const exerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  muscleGroup: z.enum(['pecho', 'espalda', 'piernas', 'gluteos', 'hombros', 'biceps', 'triceps', 'core', 'cuerpo completo', 'cuadriceps', 'isquios', 'gemelos', 'aductores']),
  bodyweight: z.boolean(),
  baseline: baselineSchema,
  weeklyIncrement: z.number().min(0),
  startWeek: z.number().int().min(0),
  createdAt: z.string(),
  archived: z.boolean().optional(),
  calibrated: z.boolean().optional(),
  unilateral: z.boolean().optional(),
})

const setSchema = z.object({
  id: z.string(),
  weight: z.number().min(0),
  reps: z.number().int().min(0),
  rpe: z.number().min(5).max(10).optional(),
  done: z.boolean(),
  kind: z.enum(['warmup', 'top', 'backoff', 'work', 'normal']).optional(),
  partials: z.number().int().min(0).max(20).optional(),
})

const sessionSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(z.object({ exerciseId: z.string(), sets: z.array(setSchema) })),
  notes: z.string().optional(),
  createdAt: z.string(),
  dayId: z.string().optional(),
})

const range = z.tuple([z.number().int().min(1), z.number().int().min(1)])

const routineSchema = z.object({
  name: z.string(),
  days: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      focus: z.string(),
      restAfter: z.boolean().optional(),
      items: z.array(
        z.object({
          id: z.string(),
          exerciseId: z.string(),
          top: range,
          backoff: range,
          restSeconds: z.number().int().min(15).max(900),
          partials: z.boolean(),
          notes: z.string(),
          scheme: z.enum(['topBackoff', 'straight']).optional(),
          sets: z.number().int().min(1).max(10).optional(),
          rir: z.tuple([z.number().min(0).max(5), z.number().min(0).max(5)]).optional(),
        }),
      ),
    }),
  ),
})

const profileSchema = z.object({
  name: z.string(),
  age: z.number().int().min(10).max(100),
  sex: z.enum(['masculino', 'femenino', 'otro']),
  bodyweight: z.number().min(25).max(300),
  height: z.number().min(100).max(250).optional(),
  experience: z.enum(['principiante', 'intermedio', 'avanzado']),
  daysPerWeek: z.number().int().min(2).max(6),
  goal: z.enum(['hipertrofia', 'fuerza', 'resistencia']),
  programWeeks: z.number().int().min(8).max(12),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const measure = z.number().min(0).max(400).optional()

const bodySchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weight: z.number().min(25).max(300).optional(),
  bodyFat: z.number().min(2).max(70).optional(),
  waist: measure,
  chest: measure,
  arm: measure,
  thigh: measure,
  hips: measure,
})

export const appStateSchema = z.object({
  version: z.literal(1),
  profile: profileSchema.nullable(),
  exercises: z.array(exerciseSchema),
  sessions: z.array(sessionSchema),
  draft: sessionSchema.nullable(),
  settings: z.object({
    formula: z.enum(['epley', 'brzycki', 'promedio']),
    rounding: z.number().positive(),
    restSeconds: z.number().int().min(15).max(600),
  }),
  routine: routineSchema.nullable().optional(),
  body: z.array(bodySchema).optional(),
})

export const defaultState: AppState = {
  version: 1,
  profile: null,
  exercises: [],
  sessions: [],
  draft: null,
  settings: { formula: 'promedio', rounding: 2.5, restSeconds: 120 },
  routine: null,
  body: [],
}

export function parseState(raw: unknown): AppState | null {
  const r = appStateSchema.safeParse(raw)
  return r.success ? (r.data as AppState) : null
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = parseState(JSON.parse(raw))
    return parsed ?? defaultState
  } catch {
    return defaultState
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* almacenamiento no disponible (modo privado): la app sigue funcionando en memoria */
  }
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
