import { daysBetween } from './date'
import type { BodyEntry } from './types'

export type BodyMetric = 'weight' | 'bodyFat' | 'waist' | 'chest' | 'arm' | 'thigh' | 'hips'

export const BODY_METRICS: { key: BodyMetric; label: string; unit: string; step: number; min: number; max: number; hint?: string }[] = [
  { key: 'weight', label: 'Peso', unit: 'kg', step: 0.1, min: 30, max: 250 },
  { key: 'bodyFat', label: 'Grasa corporal', unit: '%', step: 0.5, min: 3, max: 60 },
  { key: 'waist', label: 'Cintura', unit: 'cm', step: 0.5, min: 40, max: 200, hint: 'A la altura del ombligo' },
  { key: 'chest', label: 'Pecho', unit: 'cm', step: 0.5, min: 50, max: 200 },
  { key: 'arm', label: 'Brazo', unit: 'cm', step: 0.5, min: 15, max: 70, hint: 'Bíceps contraído' },
  { key: 'thigh', label: 'Muslo', unit: 'cm', step: 0.5, min: 30, max: 100 },
  { key: 'hips', label: 'Cadera', unit: 'cm', step: 0.5, min: 50, max: 200 },
]

export function sortBody(entries: BodyEntry[]): BodyEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date))
}

/** Serie temporal de una métrica (solo los días en que se midió). */
export function metricSeries(entries: BodyEntry[], key: BodyMetric): { date: string; value: number }[] {
  return sortBody(entries)
    .filter((e) => e[key] != null)
    .map((e) => ({ date: e.date, value: e[key] as number }))
}

/** Media móvil por tiempo (ventana en días, incluida la medición actual): suaviza la retención de líquidos. */
export function trailingAverage(series: { date: string; value: number }[], windowDays = 7): number[] {
  return series.map((p, i) => {
    let sum = 0
    let n = 0
    for (let j = i; j >= 0 && daysBetween(series[j].date, p.date) < windowDays; j--) {
      sum += series[j].value
      n++
    }
    return sum / n
  })
}

export interface MetricChange {
  latest: { date: string; value: number }
  first: { date: string; value: number }
  /** Cambio frente a la medición más cercana a hace ~30 días (o la primera si no hay tanto historial). */
  vs30: number | null
  total: number
  /** Ritmo semanal (regresión lineal de los últimos 28 días). */
  weeklyRate: number | null
}

export function metricChange(entries: BodyEntry[], key: BodyMetric): MetricChange | null {
  const s = metricSeries(entries, key)
  if (!s.length) return null
  const latest = s[s.length - 1]
  const first = s[0]
  let ref: { date: string; value: number } | null = null
  for (const p of s) if (daysBetween(p.date, latest.date) >= 28) ref = p
  if (!ref && s.length > 1) ref = first
  const recent = s.filter((p) => daysBetween(p.date, latest.date) <= 28)
  let weeklyRate: number | null = null
  if (recent.length >= 3) {
    const xs = recent.map((p) => daysBetween(recent[0].date, p.date))
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = recent.reduce((a, p) => a + p.value, 0) / recent.length
    let num = 0
    let den = 0
    xs.forEach((x, i) => {
      num += (x - mx) * (recent[i].value - my)
      den += (x - mx) ** 2
    })
    if (den > 0) weeklyRate = (num / den) * 7
  }
  return { latest, first, vs30: ref ? latest.value - ref.value : null, total: latest.value - first.value, weeklyRate }
}
