const DAY_MS = 86_400_000

export function todayISO(): string {
  const d = new Date()
  return toISODate(d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseUTC(toISO) - parseUTC(fromISO)) / DAY_MS)
}

export function addDays(iso: string, days: number): string {
  const t = parseUTC(iso) + days * DAY_MS
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Semana del programa a la que pertenece una fecha.
 * Semana 0 = evaluación inicial (día de inicio). Los días 0–6 desde el inicio son la semana 1, 7–13 la 2, etc.
 * Las sesiones del mismo día de inicio cuentan como semana 1 (ya son entrenamiento).
 */
export function programWeekOf(startISO: string, dateISO: string): number {
  const d = daysBetween(startISO, dateISO)
  if (d < 0) return 0
  return Math.floor(d / 7) + 1
}

/** Posición continua (en semanas) para graficar sesión a sesión: el último día de la semana w cae en x = w. */
export function weekPosition(startISO: string, dateISO: string): number {
  const d = daysBetween(startISO, dateISO)
  return Math.max(0, (d + 1) / 7)
}

const fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
const fmtShort = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })

export function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const s = fmtLong.format(new Date(y, m - 1, d))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return fmtShort.format(new Date(y, m - 1, d))
}
