import { useConfirm } from '../../components/ui/confirm'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, History as HistoryIcon, Trash2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge, Card, EmptyState, cx } from '../../components/ui'
import { useAthlete } from '../../store/AppStore'
import { summarizeSessions, type SessionSummary } from '../../lib/analytics'
import { formatLong } from '../../lib/date'
import { estimate1RM } from '../../lib/oneRepMax'
import { effectiveLoad } from '../../lib/program'
import { kg, tonnage } from '../../lib/format'

export function HistoryView() {
  const { profile, exercises, sessions, settings, routine, dispatch } = useAthlete()
  const summaries = useMemo(() => summarizeSessions(sessions, exercises, profile, settings).reverse(), [sessions, exercises, profile, settings])
  const ask = useConfirm()
  const [open, setOpen] = useState<string | null>(summaries[0]?.session.id ?? null)

  const groups = useMemo(() => {
    const m = new Map<string, SessionSummary[]>()
    for (const s of summaries) {
      const key = s.session.date < profile.startDate ? 'Ciclos anteriores' : `Semana ${s.week}`
      m.set(key, [...(m.get(key) ?? []), s])
    }
    return [...m.entries()]
  }, [summaries, profile.startDate])

  const totalTonnage = summaries.reduce((a, s) => a + s.tonnage, 0)
  const totalPrs = summaries.reduce((a, s) => a + s.prs.length, 0)

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Registro</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Historial</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Sesiones', String(summaries.length)],
          ['Tonelaje total', tonnage(totalTonnage)],
          ['Récords', String(totalPrs)],
        ].map(([l, v]) => (
          <Card key={l} className="!p-4">
            <div className="label">{l}</div>
            <div className="tnum mt-2 text-xl font-semibold text-zinc-50 sm:text-2xl">{v}</div>
          </Card>
        ))}
      </div>

      {summaries.length === 0 ? (
        <Card>
          <EmptyState icon={<HistoryIcon size={22} />} title="Sin sesiones todavía" description="Las sesiones que finalices aparecerán aquí con su tonelaje, series y récords." />
        </Card>
      ) : (
        groups.map(([label, items]) => (
          <div key={label}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="label">{label}</span>
              <span className="tnum text-xs text-zinc-500">{tonnage(items.reduce((a, s) => a + s.tonnage, 0))}</span>
            </div>
            <div className="space-y-2">
              {items.map((s) => {
                const isOpen = open === s.session.id
                return (
                  <motion.div key={s.session.id} layout className="glass overflow-hidden">
                    <button onClick={() => setOpen(isOpen ? null : s.session.id)} className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-white/[0.02]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-100">{formatLong(s.session.date)}</span>
                          {s.session.dayId && routine?.days.find((d) => d.id === s.session.dayId) && <Badge tone="emerald">{routine.days.find((d) => d.id === s.session.dayId)!.name}</Badge>}
                          {s.prs.length > 0 && (
                            <Badge tone="amber">
                              <Trophy size={11} /> {s.prs.length}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-500">{s.session.entries.map((e) => exercises.find((x) => x.id === e.exerciseId)?.name ?? 'Eliminado').join(' · ')}</div>
                      </div>
                      <div className="tnum hidden text-right text-xs text-zinc-400 sm:block">
                        <div className="font-semibold text-zinc-200">{tonnage(s.tonnage)}</div>
                        <div>
                          {s.sets} series · {s.reps} reps
                        </div>
                      </div>
                      <ChevronDown size={18} className={cx('shrink-0 text-zinc-500 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                          <div className="space-y-4 border-t border-white/[0.04] px-4 pb-4 pt-4">
                            {s.session.entries.map((e) => {
                              const ex = exercises.find((x) => x.id === e.exerciseId)
                              const pr = s.prs.find((p) => p.exerciseId === e.exerciseId)
                              return (
                                <div key={e.exerciseId}>
                                  <div className="mb-2 flex items-center justify-between">
                                    <span className="text-sm font-medium text-zinc-200">{ex?.name ?? 'Ejercicio eliminado'}</span>
                                    <span className="tnum text-xs text-zinc-500">
                                      1RM est. <span className={cx('font-semibold', pr ? 'text-amber-300' : 'text-zinc-300')}>{kg(s.bestByExercise.get(e.exerciseId) ?? 0)}</span>
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {e.sets.map((set, i) => {
                                      const v = ex ? estimate1RM(effectiveLoad(ex, set.weight, profile.bodyweight), set.reps, set.rpe, settings.formula) : 0
                                      return (
                                        <span
                                          key={set.id}
                                          title={set.kind === 'warmup' ? 'Aproximación' : `1RM est. ${kg(v)}`}
                                          className={cx(
                                            'tnum rounded-lg border px-2.5 py-1 text-xs',
                                            set.kind === 'warmup' ? 'border-white/[0.03] text-zinc-500' : set.kind === 'top' ? 'border-emerald-500/20 bg-emerald-500/[0.05] text-zinc-200' : set.kind === 'backoff' ? 'border-violet-500/20 bg-violet-500/[0.05] text-zinc-200' : 'border-white/[0.05] bg-white/[0.03] text-zinc-300',
                                          )}
                                        >
                                          <span className={cx('font-semibold', set.kind === 'top' ? 'text-emerald-400' : set.kind === 'backoff' ? 'text-violet-300' : 'text-zinc-600')}>
                                            {set.kind === 'top' ? 'TS' : set.kind === 'backoff' ? 'BS' : set.kind === 'warmup' ? 'C' : `${i + 1}.`}
                                          </span>{' '}
                                          {ex?.bodyweight ? `PC+${set.weight}` : set.weight} kg × {set.reps}
                                          {set.rpe != null && set.kind !== 'warmup' && <span className="text-zinc-500"> @{set.rpe}</span>}
                                          {set.partials ? <span className="text-emerald-400/80"> +{set.partials}LP</span> : null}
                                        </span>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                            <div className="flex justify-end">
                              <button
                                onClick={async () => (await ask({ title: 'Eliminar sesión', message: 'La sesión se borrará y la curva se recalculará sin ella.', confirmLabel: 'Eliminar', danger: true })) && dispatch({ type: 'deleteSession', id: s.session.id })}
                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                              >
                                <Trash2 size={13} /> Eliminar sesión
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
