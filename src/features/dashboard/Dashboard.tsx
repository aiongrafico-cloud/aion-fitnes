import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck, Play, Trophy, Weight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Cell } from 'recharts'
import { Badge, Button, Card, ProgressRing, SectionTitle, cx } from '../../components/ui'
import type { Tab } from '../../components/layout/Shell'
import { useAthlete } from '../../store/AppStore'
import { computeKpis, summarizeSessions } from '../../lib/analytics'
import { GOALS, todaysPrescription } from '../../lib/program'
import { formatLong, formatShort, todayISO } from '../../lib/date'
import { kg, pct, signedPct, tonnage } from '../../lib/format'
import { ChartLegend, ProgressChart } from '../progress/ProgressChart'
import { nextDayIndex, protocolForDate } from '../../lib/routine'
import { ProtocolRow } from '../logger/Logger'
import { MuscleVolumeCard, ProgressionAlerts } from './Insights'

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
}

export function Dashboard({ go }: { go: (t: Tab, exerciseId?: string) => void }) {
  const { profile, exercises, sessions, settings, draft, routine } = useAthlete()
  const today = todayISO()
  const kpis = useMemo(() => computeKpis(profile, exercises, sessions, settings, today), [profile, exercises, sessions, settings, today])
  const summaries = useMemo(() => summarizeSessions(sessions, exercises, profile, settings), [sessions, exercises, profile, settings])
  const [selIdx, setSelIdx] = useState(0)
  const sel = kpis.analyses[Math.min(selIdx, kpis.analyses.length - 1)]
  const active = exercises.filter((e) => !e.archived && e.calibrated !== false)
  const nextIdx = routine && routine.days.length ? nextDayIndex(routine, sessions) : 0
  const nextDay = routine?.days[nextIdx]
  const isDeload = sel?.deloadWeeks.has(kpis.currentWeek)
  const programDone = sel && today > profile.startDate && kpis.currentWeek >= profile.programWeeks && sessions.some((s) => s.date >= profile.startDate)

  const tonnageDelta = kpis.prevWeekToDate > 0 ? (kpis.weekTonnage / kpis.prevWeekToDate - 1) * 100 : null
  const tonnageBars = kpis.tonnageByWeek.slice(1, profile.programWeeks + 1).map((v, i) => ({ w: i + 1, v }))

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label">{formatLong(today)}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            {greeting()}, <span className="text-gradient">{profile.name.split(' ')[0]}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>
              Semana <span className="tnum font-semibold text-zinc-200">{kpis.currentWeek}</span> de {profile.programWeeks}
            </span>
            <span className="text-zinc-700">·</span>
            <span>{GOALS[profile.goal].label}</span>
            {isDeload && <Badge tone="violet">Semana de descarga</Badge>}
            {programDone && <Badge tone="emerald">Ciclo completado</Badge>}
          </div>
        </div>
        <Button size="lg" onClick={() => go('entrenar')} className="w-full sm:w-auto">
          <Play size={16} fill="currentColor" /> {draft ? 'Continuar sesión' : nextDay ? `Entrenar ${nextDay.name}` : 'Entrenar hoy'}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi delay={0} label="Tonelaje semanal" icon={<Weight size={15} />}>
          <div className="tnum text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">{tonnage(kpis.weekTonnage)}</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            {tonnageDelta == null ? (
              <span className="text-xs text-zinc-500">Semana {kpis.currentWeek}</span>
            ) : (
              <span title="Comparado con la semana anterior hasta el mismo día" className={cx('flex items-center text-xs font-medium', tonnageDelta >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {tonnageDelta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {signedPct(tonnageDelta)}
              </span>
            )}
            <div className="h-7 w-20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tonnageBars} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Bar dataKey="v" radius={[2, 2, 0, 0]} isAnimationActive>
                    {tonnageBars.map((b) => (
                      <Cell key={b.w} fill={b.w === kpis.currentWeek ? '#10b981' : 'rgba(255,255,255,.12)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Kpi>

        <Kpi delay={0.05} label="Cumplimiento sobrecarga" icon={<CalendarCheck size={15} />}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="tnum text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">{kpis.compliancePct == null ? '—' : pct(kpis.compliancePct)}</div>
              <div className="mt-1 text-xs text-zinc-500">
                {kpis.avgPerformanceRatio == null ? 'Registra sesiones para medirlo' : `Rinde al ${pct(kpis.avgPerformanceRatio * 100)} del plan`}
              </div>
            </div>
            <ProgressRing value={(kpis.compliancePct ?? 0) / 100} size={48} stroke={4} />
          </div>
        </Kpi>

        <Kpi delay={0.1} label="1RM proyectado" icon={<Trophy size={15} />} accent>
          {sel ? (
            <>
              <div className="tnum text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">{kg(sel.projectedEnd)}</div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="truncate text-zinc-500">{sel.exercise.name}</span>
                <span className="font-medium text-violet-300">{signedPct((sel.projectedEnd / sel.base - 1) * 100)}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-zinc-500">Sin ejercicios</div>
          )}
        </Kpi>

        <Kpi delay={0.15} label="Sesiones esta semana" icon={<Play size={15} />}>
          <div className="tnum text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
            {kpis.sessionsThisWeek}
            <span className="text-base font-normal text-zinc-500"> / {profile.daysPerWeek}</span>
          </div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: profile.daysPerWeek }, (_, i) => (
              <motion.div
                key={i}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className={cx('h-1.5 flex-1 origin-left rounded-full', i < kpis.sessionsThisWeek ? 'bg-emerald-500' : 'bg-white/[0.07]')}
              />
            ))}
          </div>
        </Kpi>
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        {/* Curva */}
        <Card className="min-w-0 lg:col-span-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <SectionTitle
            title="Curva de sobrecarga"
            subtitle={sel ? <ResponseLine multiplier={sel.fit.multiplier} samples={sel.fit.samples} /> : undefined}
            action={
              sel && (
                <button onClick={() => go('progreso', sel.exercise.id)} className="flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-emerald-300">
                  Detalle <ArrowRight size={13} />
                </button>
              )
            }
          />
          <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 scrollbar-none">
            {kpis.analyses.map((a, i) => (
              <button
                key={a.exercise.id}
                onClick={() => setSelIdx(i)}
                className={cx('whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium transition', i === selIdx ? 'border-white/10 bg-white/[0.08] text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-300')}
              >
                {a.exercise.name}
              </button>
            ))}
          </div>
          {sel ? (
            <ProgressChart analysis={sel} height={260} compact />
          ) : (
            <p className="py-16 text-center text-sm text-zinc-500">Registra tu primera sesión: cada ejercicio se calibra con su mejor serie y aquí aparecerá su curva.</p>
          )}
          <div className="mt-3">
            <ChartLegend />
          </div>
        </Card>

        {/* Próximo entrenamiento */}
        <Card className="min-w-0 lg:col-span-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          {nextDay ? (
            <>
              <SectionTitle
                title={`Próximo: Día ${nextIdx + 1} · ${nextDay.name}`}
                subtitle={nextDay.focus}
                action={
                  <button onClick={() => go('rutina')} className="flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-emerald-300">
                    Rutina <ArrowRight size={13} />
                  </button>
                }
              />
              <div className="space-y-2">
                {nextDay.items.map((it) => {
                  const ex = exercises.find((e) => e.id === it.exerciseId)
                  if (!ex) return null
                  return <ProtocolRow key={it.id} ex={ex} item={it} plan={protocolForDate(ex, it, profile, sessions, settings, today)} />
                })}
              </div>
            </>
          ) : (
            <>
              <SectionTitle title="Prescripción de esta semana" subtitle="Ajustada a tu rendimiento real" />
              <div className="space-y-2">
                {active.map((ex) => {
                  const p = todaysPrescription(ex, profile, sessions, settings, today)
                  return (
                    <div key={ex.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-zinc-100">{ex.name}</div>
                        <div className="tnum mt-0.5 text-xs text-zinc-500">
                          {p.sets} × {p.reps} · RPE {p.rpe}
                        </div>
                      </div>
                      {p.deload && <Badge tone="violet">Descarga</Badge>}
                      <div className="tnum text-right text-[15px] font-semibold text-zinc-50">{ex.bodyweight ? (p.weight > 0 ? `+${kg(p.weight)}` : 'PC') : kg(p.weight)}</div>
                    </div>
                  )
                })}
                {active.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Añade ejercicios en el catálogo.</p>}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {routine && <ProgressionAlerts go={go} />}
        <MuscleVolumeCard week={kpis.currentWeek} go={go} />
      </div>

      {/* Sesiones recientes */}
      <Card initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <SectionTitle
          title="Sesiones recientes"
          action={
            summaries.length > 0 && (
              <button onClick={() => go('historial')} className="flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-emerald-300">
                Ver historial <ArrowRight size={13} />
              </button>
            )
          }
        />
        {summaries.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Aún no hay sesiones. Tu primera sesión trazará el primer punto real de la curva.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {[...summaries]
              .reverse()
              .slice(0, 3)
              .map((s) => (
                <div key={s.session.id} className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-200">{formatShort(s.session.date)}</span>
                    {s.prs.length > 0 && (
                      <Badge tone="amber">
                        <Trophy size={11} /> {s.prs.length} PR
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 truncate text-xs text-zinc-500">{s.session.entries.map((e) => exercises.find((x) => x.id === e.exerciseId)?.name ?? '—').join(' · ')}</div>
                  <div className="tnum mt-3 flex gap-4 text-xs text-zinc-400">
                    <span>
                      <span className="font-semibold text-zinc-200">{tonnage(s.tonnage)}</span> movidos
                    </span>
                    <span>
                      <span className="font-semibold text-zinc-200">{s.sets}</span> series
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function Kpi({ label, icon, children, delay, accent }: { label: string; icon: React.ReactNode; children: React.ReactNode; delay: number; accent?: boolean }) {
  return (
    <Card
      className={cx('relative overflow-hidden !p-4 sm:!p-5', accent && '!border-violet-500/20')}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {accent && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />}
      <div className="relative mb-3 flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="label !tracking-[0.1em]">{label}</span>
      </div>
      <div className="relative">{children}</div>
    </Card>
  )
}

export function ResponseLine({ multiplier, samples }: { multiplier: number; samples: number }) {
  if (samples === 0) return <span>Sin datos reales todavía: mostrando el plan original</span>
  const diff = (multiplier - 1) * 100
  const tone = diff > 3 ? 'text-emerald-400' : diff < -3 ? 'text-amber-400' : 'text-zinc-300'
  const text = diff > 3 ? 'por encima del plan' : diff < -3 ? 'por debajo del plan' : 'en línea con el plan'
  return (
    <span>
      Respuesta <span className={cx('tnum font-semibold', tone)}>{multiplier.toFixed(2)}×</span> · {text} ({samples} sem.)
    </span>
  )
}
