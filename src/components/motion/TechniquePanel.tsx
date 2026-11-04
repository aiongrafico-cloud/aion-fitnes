import { Check, PlayCircle } from 'lucide-react'
import { useMemo } from 'react'
import { motionFor } from '../../lib/motion'
import { photosFor, videoUrlFor } from '../../lib/photos'
import { ExerciseAnimation } from './ExerciseAnimation'
import { PhotoDemo } from './PhotoDemo'

/** Demostración (fotos reales o, si no hay, figura animada) + claves de ejecución + vídeo. */
export function TechniquePanel({ name, notes }: { name: string; notes?: string }) {
  const m = useMemo(() => motionFor(name), [name])
  const photos = useMemo(() => photosFor(name), [name])
  return (
    <div className="grid gap-3 pt-2 sm:grid-cols-[minmax(0,17rem)_1fr] sm:items-start">
      {photos ? (
        <PhotoDemo frames={photos} label={name} tempo={m?.tempo} phases={m?.phases} className="mx-auto w-full max-w-[22rem] sm:max-w-none" />
      ) : (
        m && <ExerciseAnimation motion={m} className="mx-auto w-full max-w-[17rem] sm:max-w-none" />
      )}
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
        <a
          href={videoUrlFor(name)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-rose-400/30 hover:text-rose-200"
        >
          <PlayCircle size={14} className="text-rose-400" /> Ver vídeo de la técnica
        </a>
        {photos && <p className="text-[10px] text-zinc-600">Fotos: Free Exercise DB (dominio público). La barra marca el tempo de cada fase.</p>}
      </div>
    </div>
  )
}

/** Todos los ejercicios tienen al menos el enlace al vídeo. */
export function hasTechnique(): boolean {
  return true
}
