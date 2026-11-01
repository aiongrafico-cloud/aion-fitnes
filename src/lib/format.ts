const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

export function kg(n: number, digits: 0 | 1 = 1): string {
  return `${(digits === 0 ? nf0 : nf1).format(n)} kg`
}

export function num(n: number, digits: 0 | 1 = 1): string {
  return (digits === 0 ? nf0 : nf1).format(n)
}

/** Tonelaje compacto: 12.450 kg → "12,5 t". */
export function tonnage(n: number): string {
  if (n >= 1000) return `${nf1.format(n / 1000)} t`
  return `${nf0.format(n)} kg`
}

export function pct(n: number, digits: 0 | 1 = 0): string {
  return `${(digits === 0 ? nf0 : nf1).format(n)}%`
}

export function signedPct(n: number): string {
  const s = nf1.format(Math.abs(n))
  return `${n >= 0 ? '+' : '−'}${s}%`
}

/** 90 → "1:30 min", 180 → "3 min" */
export function restLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const r = seconds % 60
  if (m === 0) return `${r} s`
  return r ? `${m}:${String(r).padStart(2, '0')} min` : `${m} min`
}
