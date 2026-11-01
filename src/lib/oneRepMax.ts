import type { Formula } from './types'

/**
 * Estimación de 1RM.
 *
 * - Epley (1985):   1RM = w · (1 + r / 30)
 * - Brzycki (1993): 1RM = w · 36 / (37 − r)
 *
 * El RPE se incorpora mediante repeticiones en reserva (RIR = 10 − RPE):
 * una serie de 5 reps a RPE 8 equivale a un fallo técnico a 7 reps.
 * Brzycki pierde precisión por encima de ~10 reps, por lo que el modo
 * "promedio" usa la media de ambas hasta 10 reps y Epley a partir de ahí.
 */

const MAX_EFFECTIVE_REPS = 30

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Repeticiones en reserva a partir del RPE (escala RIR de Helms/Zourdos). */
export function repsInReserve(rpe?: number): number {
  if (rpe == null || Number.isNaN(rpe)) return 0
  return clamp(10 - rpe, 0, 6)
}

export function effectiveReps(reps: number, rpe?: number): number {
  return clamp(reps + repsInReserve(rpe), 1, MAX_EFFECTIVE_REPS)
}

export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps <= 1) return weight
  return weight * (1 + reps / 30)
}

export function brzycki(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps <= 1) return weight
  const r = Math.min(reps, 36)
  return (weight * 36) / (37 - r)
}

/** 1RM estimado para una serie (peso, reps, RPE opcional). */
export function estimate1RM(weight: number, reps: number, rpe?: number, formula: Formula = 'promedio'): number {
  if (weight <= 0 || reps <= 0) return 0
  const n = effectiveReps(reps, rpe)
  switch (formula) {
    case 'epley':
      return epley(weight, n)
    case 'brzycki':
      return brzycki(weight, n)
    case 'promedio':
      return n <= 10 ? (epley(weight, n) + brzycki(weight, n)) / 2 : epley(weight, n)
  }
}

function epleyInverse(oneRm: number, n: number): number {
  return n <= 1 ? oneRm : oneRm / (1 + n / 30)
}

function brzyckiInverse(oneRm: number, n: number): number {
  return n <= 1 ? oneRm : (oneRm * (37 - Math.min(n, 36))) / 36
}

/** Peso que corresponde a `reps` repeticiones al RPE indicado, dado un 1RM. Inversa exacta de estimate1RM. */
export function weightForReps(oneRm: number, reps: number, rpe?: number, formula: Formula = 'promedio'): number {
  if (oneRm <= 0 || reps <= 0) return 0
  const n = effectiveReps(reps, rpe)
  switch (formula) {
    case 'epley':
      return epleyInverse(oneRm, n)
    case 'brzycki':
      return brzyckiInverse(oneRm, n)
    case 'promedio': {
      if (n > 10) return epleyInverse(oneRm, n)
      // La media de Epley y Brzycki es lineal en w: 1RM = w · k  →  w = 1RM / k
      const k = ((1 + n / 30) + 36 / (37 - n)) / 2
      return oneRm / k
    }
  }
}

/** Porcentaje del 1RM que representa una carga. */
export function percentOf1RM(weight: number, oneRm: number): number {
  return oneRm > 0 ? (weight / oneRm) * 100 : 0
}

/** Redondea al incremento de discos disponible (p. ej. 2.5 kg). */
export function roundToPlate(weight: number, step: number): number {
  if (step <= 0) return weight
  return Math.round(weight / step) * step
}
