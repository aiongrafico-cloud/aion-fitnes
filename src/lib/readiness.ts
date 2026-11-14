import { roundToPlate } from './oneRepMax'
import type { Checkin, SetLog } from './types'

export type ReadinessLevel = 'alta' | 'normal' | 'baja' | 'muyBaja'

export interface Readiness {
  /** 3 (todo mal) – 9 (todo bien). */
  score: number
  level: ReadinessLevel
  /** Multiplicador de la carga del día. */
  factor: number
  /** Quitar la última serie de trabajo de cada ejercicio. */
  dropSet: boolean
  title: string
  message: string
}

/** Traduce el check-in en un ajuste de carga (autorregulación). */
export function readinessFor(c: Checkin): Readiness {
  const score = c.sleep + c.energy + c.soreness
  let r: Readiness
  if (score >= 8) {
    r = { score, level: 'alta', factor: 1, dropSet: false, title: 'Listo para apretar', message: 'Llegas fuerte: entrena como está prescrito y busca el tope del rango.' }
  } else if (score >= 6) {
    r = { score, level: 'normal', factor: 1, dropSet: false, title: 'Día normal', message: 'Sesión tal cual. Respeta el RIR y no vayas al fallo antes de tiempo.' }
  } else if (score >= 5) {
    r = { score, level: 'baja', factor: 0.95, dropSet: false, title: 'Bajamos un poco', message: 'Hoy la carga baja un 5 %. Prioriza la técnica y sal con energía.' }
  } else {
    r = { score, level: 'muyBaja', factor: 0.9, dropSet: true, title: 'Sesión de mantenimiento', message: 'Carga −10 % y una serie menos por ejercicio. Hoy toca sumar sin cavar más hondo.' }
  }
  if (c.pain) {
    r = {
      ...r,
      factor: Math.min(r.factor, 0.9),
      dropSet: r.dropSet,
      message: `${r.message} Con dolor articular: si un ejercicio molesta, reduce el rango o cámbialo; el dolor no se entrena.`,
    }
    if (r.level === 'alta' || r.level === 'normal') r.level = 'baja'
  }
  return r
}

/** ¿Este check-in rebajó la sesión? (no cuenta para decidir subidas o bajadas de peso). */
export function isReducedSession(c: Checkin | undefined): boolean {
  return !!c && readinessFor(c).factor < 1
}

/** Aplica el ajuste a las series precargadas de un ejercicio. */
export function applyReadiness(sets: Omit<SetLog, 'id'>[], r: Readiness, rounding: number): Omit<SetLog, 'id'>[] {
  if (r.factor >= 1 && !r.dropSet) return sets
  let out = sets.map((s) => (s.weight > 0 && r.factor < 1 ? { ...s, weight: Math.max(0, roundToPlate(s.weight * r.factor, rounding)) } : s))
  if (r.dropSet) {
    const backoff = out.findIndex((s) => s.kind === 'backoff')
    if (backoff >= 0) out = out.filter((_, i) => i !== backoff)
    else {
      const works = out.map((s, i) => (s.kind === 'work' || s.kind === 'normal' ? i : -1)).filter((i) => i >= 0)
      if (works.length > 1) out = out.filter((_, i) => i !== works[works.length - 1])
    }
  }
  return out
}
