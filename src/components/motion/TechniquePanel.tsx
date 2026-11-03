import { Check } from 'lucide-react'
import { useMemo } from 'react'
import { motionFor } from '../../lib/motion'
import { ExerciseAnimation } from './ExerciseAnimation'

/** Animación de técnica + claves de ejecución de un ejercicio. */
export function TechniquePanel({ name, notes }: { name: string; notes?: string }) {
  const m = useMemo(() => motionFor(name), [name])
  if (!m && !notes) return null
  return (
    <div className="grid gap-3 pt-2 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-start">
      {m && <ExerciseAnimation motion={m} className="mx-auto w-full max-w-[17rem] sm:max-w-none" />}
      <div className="space-y-2">
        {m && (
          <ul className="space-y-1.5">
            {m.cues.map((c) => (
              <li key={c} className="flex gap-2 text-[13px] leading-snug text-zinc-300">
                <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                {c}
              </li>
            ))}
          </ul>
        )}
        {notes && <p className="text-[13px] leading-relaxed text-zinc-400">{notes}</p>}
        {m && <p className="text-[11px] text-zinc-600">Tempo: la barra inferior marca cada fase (verde = movimiento, violeta = pausa).</p>}
      </div>
    </div>
  )
}

export function hasTechnique(name: string, notes?: string): boolean {
  return !!notes || !!motionFor(name)
}
