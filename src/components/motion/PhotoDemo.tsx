import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cx } from '../ui'

const DEFAULT_TEMPO: [number, number, number, number] = [1, 0.8, 2, 0.8]
const DEFAULT_PHASES: [string, string, string, string] = ['Movimiento', 'Posición final', 'Vuelve controlado', 'Posición inicial']

/**
 * Demostración con fotos reales: alterna la posición inicial y la final siguiendo el tempo del ejercicio
 * (fundido durante el movimiento, imagen fija en las pausas).
 */
export function PhotoDemo({ frames, label, tempo = DEFAULT_TEMPO, phases = DEFAULT_PHASES, className }: { frames: [string, string]; label: string; tempo?: [number, number, number, number]; phases?: [string, string, string, string]; className?: string }) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      if (!document.hidden) setTime((t) => t + dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const total = tempo.reduce((a, b) => a + b, 0)
  let t = time % total
  let phase = 0
  while (phase < 3 && t >= tempo[phase]) {
    t -= tempo[phase]
    phase++
  }
  const progress = tempo[phase] ? Math.min(1, t / tempo[phase]) : 1
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
  // Opacidad de la foto final: sube en la ida, se mantiene, baja en la vuelta.
  const end = phase === 0 ? ease(progress) : phase === 1 ? 1 : phase === 2 ? 1 - ease(progress) : 0

  return (
    <div className={cx('overflow-hidden rounded-xl border border-white/[0.06] bg-black/40', className)}>
      <div className="relative aspect-[3/2] w-full">
        <img src={frames[0]} alt={`${label}: posición inicial`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <img src={frames[1]} alt={`${label}: posición final`} className="absolute inset-0 h-full w-full object-cover" style={{ opacity: end }} draggable={false} />
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-200 backdrop-blur">
          {end > 0.5 ? 'Final' : 'Inicio'}
        </span>
      </div>
      <div className="flex items-center gap-2 border-t border-white/[0.05] px-3 py-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className={cx('truncate text-[11px] font-medium', phase === 0 || phase === 2 ? 'text-emerald-300' : 'text-zinc-400')}>{phases[phase]}</div>
          <div className="mt-1 flex h-1 gap-0.5 overflow-hidden rounded-full">
            {tempo.map((d, i) => (
              <div key={i} className="relative h-full overflow-hidden rounded-full bg-white/[0.06]" style={{ flex: d || 0.0001 }}>
                <div className={cx('absolute inset-y-0 left-0', i % 2 === 0 ? 'bg-emerald-500' : 'bg-violet-400')} style={{ width: `${(i < phase ? 1 : i === phase ? progress : 0) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
