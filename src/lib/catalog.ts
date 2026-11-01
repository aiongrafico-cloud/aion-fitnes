import type { MuscleGroup } from './types'

export interface ExerciseTemplate {
  name: string
  muscleGroup: MuscleGroup
  bodyweight: boolean
  key?: boolean
  /** Valores típicos de referencia para precargar el formulario (intermedio, ~75 kg). */
  sample: { weight: number; reps: number }
}

export const KEY_LIFTS: ExerciseTemplate[] = [
  { name: 'Press de banca', muscleGroup: 'pecho', bodyweight: false, key: true, sample: { weight: 70, reps: 5 } },
  { name: 'Sentadilla', muscleGroup: 'piernas', bodyweight: false, key: true, sample: { weight: 90, reps: 5 } },
  { name: 'Peso muerto', muscleGroup: 'espalda', bodyweight: false, key: true, sample: { weight: 110, reps: 5 } },
  { name: 'Dominadas', muscleGroup: 'espalda', bodyweight: true, key: true, sample: { weight: 0, reps: 8 } },
]

export const TEMPLATES: ExerciseTemplate[] = [
  ...KEY_LIFTS,
  { name: 'Press militar', muscleGroup: 'hombros', bodyweight: false, sample: { weight: 40, reps: 6 } },
  { name: 'Remo con barra', muscleGroup: 'espalda', bodyweight: false, sample: { weight: 60, reps: 8 } },
  { name: 'Hip thrust', muscleGroup: 'gluteos', bodyweight: false, sample: { weight: 100, reps: 8 } },
  { name: 'Press inclinado con mancuernas', muscleGroup: 'pecho', bodyweight: false, sample: { weight: 24, reps: 10 } },
  { name: 'Fondos en paralelas', muscleGroup: 'triceps', bodyweight: true, sample: { weight: 0, reps: 10 } },
  { name: 'Curl de bíceps con barra', muscleGroup: 'biceps', bodyweight: false, sample: { weight: 30, reps: 10 } },
  { name: 'Prensa de piernas', muscleGroup: 'piernas', bodyweight: false, sample: { weight: 160, reps: 10 } },
  { name: 'Peso muerto rumano', muscleGroup: 'piernas', bodyweight: false, sample: { weight: 80, reps: 8 } },
  { name: 'Elevaciones laterales', muscleGroup: 'hombros', bodyweight: false, sample: { weight: 10, reps: 12 } },
  { name: 'Rueda abdominal', muscleGroup: 'core', bodyweight: true, sample: { weight: 0, reps: 10 } },
]

export const MUSCLE_GROUPS: { id: MuscleGroup; label: string }[] = [
  { id: 'pecho', label: 'Pecho' },
  { id: 'espalda', label: 'Espalda' },
  { id: 'piernas', label: 'Piernas' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'hombros', label: 'Hombros' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'core', label: 'Core' },
  { id: 'cuerpo completo', label: 'Cuerpo completo' },
]

export function muscleLabel(id: MuscleGroup): string {
  return MUSCLE_GROUPS.find((m) => m.id === id)?.label ?? id
}
