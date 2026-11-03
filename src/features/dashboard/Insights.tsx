import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, PauseCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, SectionTitle, cx } from '../../components/ui'
import type { Tab } from '../../components/layout/Shell'
import { useAthlete } from '../../store/AppStore'
import { VOLUME_TARGET, weeklyMuscleVolume } from '../../lib/analytics'
import { muscleLabel } from '../../lib/catalog'
import { progressionAlert, type ProgressionAlert } from '../../lib/routine'
import { formatShort } from '../../lib/date'
import { num, tonnage } from '../../lib/format'

const ORDER: Record<ProgressionAlert['kind'], number> = { subir: 0, bajar: 1, estancado: 2, enRango: 3 }

/** Alertas de doble progresión del Top Set para cada ejercicio de la rutina. */
export function ProgressionAlerts({ go }: { go: (t: Tab, exerciseId?: string) => void }) {
  const { profile, exercises, sessions, settings, routine } = useAthlete()
  const alerts = useMemo(() => {
    const out: (ProgressionAlert & { name: string })[] = []
    const seen = new Set<string>()
    for (const d of routine?.days ?? []) {
      for (const it of d.items) {
        const ex = exercises.find((e) => e.id === it.exerciseId)
        if (!ex || seen.has(ex.id)) continue
        seen.add(ex.id)
        const a = progressionAlert(ex, it, sessions, profile, settings)
        if (a) out.push({ ...a, name: ex.name })
      }
    }
    return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
  }, [routine, exercises, sessions, profile, settings])

  const [expanded, setExpanded] = useState(false)
  const actionable = alerts.filter((a) => a.kind !== 'enRango')
  const LIMIT = 4
  const visible = expanded ? actionable : actionable.slice(0, LIMIT)
  const inRange = alerts.length - actionable.length

  return (
    <Card className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
      <SectionTitle title="Alertas de progresión" subtitle="Doble progresión: cuando llegas al tope del rango en todas las series, sube la carga" />
      {alerts.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Registra tus series y aquí verás cuándo subir peso en cada ejercicio.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <button
              key={a.exerciseId}
              onClick={() => go('progreso', a.exerciseId)}
              className={cx(
                'flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition hover:bg-white/[0.03]',
                a.kind === 'subir' ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : a.kind === 'bajar' ? 'border-amber-500/20 bg-amber-500/[0.05]' : 'border-violet-500/20 bg-violet-500/[0.05]',
              )}
            >
              <span
                className={cx(
                  'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                  a.kind === 'subir' ? 'bg-emerald-500/15 text-emerald-300' : a.kind === 'bajar' ? 'bg-amber-500/15 text-amber-300' : 'bg-violet-500/15 text-violet-300',
                )}
              >
                {a.kind === 'subir' ? <ArrowUp size={15} /> : a.kind === 'bajar' ? <ArrowDown size={15} /> : <PauseCircle size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">{a.name}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">{formatShort(a.last.date)}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">{a.message}</span>
              </span>
            </button>
          ))}
          {actionable.length > LIMIT && (
            <button onClick={() => setExpanded((v) => !v)} className="w-full rounded-xl py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.03] hover:text-emerald-300">
              {expanded ? 'Ver menos' : `Ver ${actionable.length - LIMIT} alertas más`}
            </button>
          )}
          {inRange > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3.5 py-3 text-xs text-zinc-400">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
              {actionable.length === 0 ? `Los ${inRange} ejercicios registrados están dentro de su rango: mantén el peso y suma reps.` : `${inRange} ejercicios más dentro de su rango: mantén el peso y suma reps.`}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/** Series efectivas por grupo muscular en la semana actual frente al plan y al rango orientativo. */
export function MuscleVolumeCard({ week, go }: { week: number; go: (t: Tab) => void }) {
  const { profile, exercises, sessions, routine } = useAthlete()
  const rows = useMemo(() => weeklyMuscleVolume(exercises, sessions, profile, routine, week), [exercises, sessions, profile, routine, week])
  const [lo, hi] = VOLUME_TARGET[profile.goal]
  const scale = Math.max(hi * 1.2, ...rows.map((r) => Math.max(r.sets, r.planned, r.prevSets)))
  const totalSets = rows.reduce((a, r) => a + r.sets, 0)
  const totalPlanned = rows.reduce((a, r) => a + r.planned, 0)

  return (
    <Card className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
      <SectionTitle
        title={`Volumen por músculo · semana ${week}`}
        subtitle={`Series efectivas (sin aproximaciones): ${num(totalSets, 0)} de ${num(totalPlanned, 0)} planificadas`}
        action={
          <button onClick={() => go('historial')} className="flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-emerald-300">
            Historial <ArrowRight size={13} />
          </button>
        }
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Sin ejercicios en la rutina todavía.</p>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((r) => {
              const status = r.sets === 0 ? 'none' : r.sets < lo ? 'low' : r.sets > hi ? 'high' : 'ok'
              return (
                <div key={r.group}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-zinc-200">{muscleLabel(r.group)}</span>
                    <span className="tnum text-zinc-500">
                      <span className={cx('font-semibold', status === 'ok' ? 'text-emerald-300' : status === 'high' ? 'text-violet-300' : 'text-zinc-200')}>{num(r.sets, 0)}</span>
                      {r.planned > 0 && <> / {num(r.planned)}</>} series
                      {r.prevSets > 0 && <span className="text-zinc-600"> · ant. {num(r.prevSets, 0)}</span>}
                      {r.tonnage > 0 && <span className="hidden text-zinc-600 sm:inline"> · {tonnage(r.tonnage)}</span>}
                    </span>
                  </div>
                  <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="absolute inset-y-0 bg-emerald-500/[0.10]" style={{ left: `${(lo / scale) * 100}%`, width: `${((hi - lo) / scale) * 100}%` }} />
                    {r.prevSets > 0 && <div className="absolute inset-y-0 left-0 rounded-full bg-white/[0.08]" style={{ width: `${(r.prevSets / scale) * 100}%` }} />}
                    <div
                      className={cx('absolute inset-y-0 left-0 rounded-full transition-all duration-500', status === 'high' ? 'bg-violet-400' : 'bg-emerald-500')}
                      style={{ width: `${(r.sets / scale) * 100}%` }}
                    />
                    {r.planned > 0 && <div className="absolute inset-y-0 w-0.5 bg-zinc-100/70" style={{ left: `calc(${(r.planned / scale) * 100}% - 1px)` }} />}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-emerald-500" /> Esta semana
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-white/20" /> Semana anterior
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-zinc-100/70" /> Plan de la rutina
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-emerald-500/25" /> Rango orientativo {lo}–{hi}
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
