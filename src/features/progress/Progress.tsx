import { motion } from 'framer-motion'
import { Info, LineChart as LineIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Badge, Card, EmptyState, SectionTitle, cx } from '../../components/ui'
import { useAthlete } from '../../store/AppStore'
import { analyzeExercise } from '../../lib/program'
import { findRoutineItem, protocolFor } from '../../lib/routine'
import { todayISO } from '../../lib/date'
import { kg, signedPct } from '../../lib/format'
import { ResponseLine } from '../dashboard/Dashboard'
import { ChartLegend, ProgressChart } from './ProgressChart'

export function Progress({ focusId, onFocus }: { focusId: string | null; onFocus: (id: string) => void }) {
  const { profile, exercises, sessions, settings, routine } = useAthlete()
  const active = exercises.filter((e) => !e.archived && e.calibrated !== false)
  const pending = exercises.filter((e) => !e.archived && e.calibrated === false).length
  const current = active.find((e) => e.id === focusId) ?? active[0]
  const today = todayISO()
  const a = useMemo(() => (current ? analyzeExercise(current, profile, sessions, settings, { today }) : null), [current, profile, sessions, settings, today])

  if (!a) {
    return (
      <EmptyState
        icon={<LineIcon size={22} />}
        title="Aún no hay curvas"
        description={pending ? `Tienes ${pending} ejercicios pendientes de calibrar. Registra tu primera sesión y cada uno tendrá su curva de progresión.` : 'Añade ejercicios para ver su curva de progresión.'}
      />
    )
  }

  const item = findRoutineItem(routine, current.id)
  const stats = [
    { label: '1RM inicial', value: kg(a.base), sub: 'Evaluación' },
    { label: 'Mejor 1RM actual', value: kg(a.currentBest), sub: signedPct((a.currentBest / a.base - 1) * 100) + ' vs inicio', tone: a.currentBest > a.base ? 'emerald' : undefined },
    { label: 'Meta original', value: kg(a.originalEnd), sub: `Semana ${a.totalWeeks}` },
    {
      label: 'Proyección ajustada',
      value: kg(a.projectedEnd),
      sub: signedPct((a.projectedEnd / a.originalEnd - 1) * 100) + ' vs plan',
      tone: a.projectedEnd >= a.originalEnd ? 'emerald' : 'amber',
    },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Motor de progresión</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Progreso</h1>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
        {active.map((ex) => (
          <button
            key={ex.id}
            onClick={() => onFocus(ex.id)}
            className={cx(
              'relative whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition',
              ex.id === current.id ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-zinc-100',
            )}
          >
            {ex.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.label} className="!p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div className="label">{s.label}</div>
            <div className="tnum mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{s.value}</div>
            <div className={cx('mt-0.5 text-xs', 'tone' in s && s.tone === 'emerald' ? 'text-emerald-400' : 'tone' in s && s.tone === 'amber' ? 'text-amber-400' : 'text-zinc-500')}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <Card key={current.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <SectionTitle title={`Curva de 1RM · ${current.name}`} subtitle={<ResponseLine multiplier={a.fit.multiplier} samples={a.fit.samples} />} />
        <ProgressChart analysis={a} height={360} />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ChartLegend />
        </div>
        <div className="mt-5 flex gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 text-[13px] leading-relaxed text-zinc-400">
          <Info size={16} className="mt-0.5 shrink-0 text-zinc-500" />
          <p>
            La curva original parte de tu evaluación con una ganancia semanal decreciente y descargas programadas. Cada sesión ajusta un <span className="text-zinc-200">multiplicador de respuesta</span> por mínimos cuadrados
            (regularizado hacia 1 para no sobrerreaccionar) y la proyección ajustada continúa desde tu último rendimiento real. Las prescripciones futuras usan la curva ajustada.
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Plan semanal" subtitle="Semanas completadas con el objetivo original · próximas semanas recalculadas" />
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left">
                {(item ? ['Semana', 'Top Set', 'Back-off', '1RM meta', '1RM real', 'Estado'] : ['Semana', 'Prescripción', 'Carga', '1RM meta', '1RM real', 'Estado']).map((h) => (
                  <th key={h} className="label border-b border-white/[0.05] pb-3 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.plan.slice(Math.max(1, current.startWeek + 1)).map((p, i) => {
                const real = a.best.get(p.week)
                const isCurrent = p.week === a.currentWeek
                const past = p.week < a.currentWeek
                const ratio = real ? real / p.targetE1RM : null
                const proto = item ? protocolFor(p.targetE1RM, item, settings, p.deload, p.week) : null
                return (
                  <motion.tr
                    key={p.week}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    className={cx('border-b border-white/[0.03] last:border-0', isCurrent && 'bg-emerald-500/[0.05]')}
                  >
                    <td className="tnum py-3 pr-3 font-medium text-zinc-200">
                      <div className="flex items-center gap-2">
                        S{p.week}
                        {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                      </div>
                    </td>
                    {proto ? (
                      <>
                        <td className="tnum py-3 pr-3 text-zinc-300">
                          <span className="font-semibold text-zinc-100">{kg(proto.top.weight)}</span> × {proto.top.reps[0]}–{proto.top.reps[1]}
                          <span className="text-zinc-600"> @ RIR {p.deload ? 3 : '1–0'}</span>
                        </td>
                        <td className="tnum py-3 pr-3 text-zinc-300">
                          {proto.backoff ? (
                            <>
                              <span className="font-semibold text-zinc-100">{kg(proto.backoff.weight)}</span> × {proto.backoff.reps[0]}–{proto.backoff.reps[1]}
                              {proto.partials > 0 && <span className="text-emerald-400/80"> +LP</span>}
                            </>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="tnum py-3 pr-3 text-zinc-300">
                          {p.sets} × {p.reps} <span className="text-zinc-600">@ RPE {p.rpe}</span>
                        </td>
                        <td className="tnum py-3 pr-3 font-semibold text-zinc-100">{current.bodyweight ? `+${kg(p.weight)}` : kg(p.weight)}</td>
                      </>
                    )}
                    <td className="tnum py-3 pr-3 text-zinc-400">{kg(p.targetE1RM)}</td>
                    <td className="tnum py-3 pr-3 text-zinc-200">{real ? kg(real) : '—'}</td>
                    <td className="py-3">
                      {p.deload ? (
                        <Badge tone="violet">Descarga</Badge>
                      ) : ratio != null ? (
                        ratio >= 0.98 ? (
                          <Badge tone="emerald">Cumplido</Badge>
                        ) : (
                          <Badge tone="amber">{signedPct((ratio - 1) * 100)}</Badge>
                        )
                      ) : past ? (
                        <Badge tone="rose">Sin registro</Badge>
                      ) : isCurrent ? (
                        <Badge tone="emerald">En curso</Badge>
                      ) : (
                        <Badge>Pendiente</Badge>
                      )}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
