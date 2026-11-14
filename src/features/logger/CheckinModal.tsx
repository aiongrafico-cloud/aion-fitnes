import { useState } from 'react'
import { Button, Modal, cx } from '../../components/ui'
import { readinessFor } from '../../lib/readiness'
import type { Checkin } from '../../lib/types'

type Level = 1 | 2 | 3

const QUESTIONS: { key: 'sleep' | 'energy' | 'soreness'; label: string; options: [string, string, string] }[] = [
  { key: 'sleep', label: '¿Cómo dormiste?', options: ['Mal', 'Regular', 'Bien'] },
  { key: 'energy', label: '¿Cómo está tu energía?', options: ['Baja', 'Normal', 'Alta'] },
  { key: 'soreness', label: '¿Agujetas de la última sesión?', options: ['Muchas', 'Algunas', 'Nada'] },
]

const TONE: Record<string, string> = {
  alta: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
  normal: 'border-white/[0.08] bg-white/[0.03] text-zinc-200',
  baja: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200',
  muyBaja: 'border-rose-500/25 bg-rose-500/[0.07] text-rose-200',
}

/** Check-in previo: el entrenador ajusta la carga del día según cómo llegas. */
export function CheckinModal({ open, dayName, onClose, onStart }: { open: boolean; dayName: string; onClose: () => void; onStart: (c: Checkin | undefined, guided: boolean) => void }) {
  const [c, setC] = useState<Checkin>({ sleep: 3, energy: 2, soreness: 3, pain: false })
  const r = readinessFor(c)
  return (
    <Modal open={open} onClose={onClose} title={`Antes de ${dayName}`}>
      <div className="space-y-4">
        {QUESTIONS.map((q) => (
          <div key={q.key}>
            <div className="mb-2 text-sm font-medium text-zinc-200">{q.label}</div>
            <div className="grid grid-cols-3 gap-2">
              {q.options.map((o, i) => {
                const v = (i + 1) as Level
                const sel = c[q.key] === v
                return (
                  <button
                    key={o}
                    onClick={() => setC((x) => ({ ...x, [q.key]: v }))}
                    className={cx('h-11 rounded-xl border text-sm font-medium transition', sel ? 'border-emerald-400 bg-emerald-500 text-ink-950' : 'border-white/[0.08] bg-white/[0.03] text-zinc-300')}
                  >
                    {o}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-zinc-200">
          <span>¿Dolor articular o molestia (no agujeta)?</span>
          <input type="checkbox" checked={c.pain} onChange={(e) => setC((x) => ({ ...x, pain: e.target.checked }))} className="h-5 w-5 accent-emerald-500" />
        </label>
        <div className={cx('rounded-xl border px-4 py-3 text-sm', TONE[r.level])}>
          <div className="font-semibold">{r.title}</div>
          <p className="mt-0.5 opacity-90">{r.message}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        <Button size="lg" onClick={() => onStart(c, true)}>
          Empezar con el entrenador (voz)
        </Button>
        <Button variant="secondary" onClick={() => onStart(c, false)}>
          Empezar sin modo guiado
        </Button>
        <button onClick={() => onStart(undefined, false)} className="py-1.5 text-xs text-zinc-500 hover:text-zinc-200">
          Saltar el check-in
        </button>
      </div>
    </Modal>
  )
}
