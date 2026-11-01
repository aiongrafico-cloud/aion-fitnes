import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Check, ChevronDown, Clock, Dumbbell, Flag, Info, Plus, Timer, Trash2, Trophy, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Modal, Stepper, cx } from '../../components/ui'
import { useConfirm } from '../../components/ui/confirm'
import type { Tab } from '../../components/layout/Shell'
import { useAthlete } from '../../store/AppStore'
import { estimate1RM, roundToPlate } from '../../lib/oneRepMax'
import { analyzeExercise, effectiveLoad, isWorkSet, todaysPrescription, type WeekPlan } from '../../lib/program'
import { findRoutineItem, isCalibrated, nextDayIndex, protocolForDate, PROTOCOL, setsFromProtocol, warmupSets, type ProtocolPlan } from '../../lib/routine'
import { setTonnage, summarizeSessions } from '../../lib/analytics'
import { formatLong, programWeekOf, todayISO } from '../../lib/date'
import { muscleLabel } from '../../lib/catalog'
import { kg, restLabel, tonnage } from '../../lib/format'
import type { Exercise, ExerciseLog, Formula, RoutineItem, SetLog } from '../../lib/types'

const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

function fireConfetti(big = false) {
  const colors = ['#10b981', '#34d399', '#8b5cf6', '#a78bfa', '#ffffff']
  if (big) {
    const end = Date.now() + 900
    const frame = () => {
      confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors })
      confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  } else {
    confetti({ particleCount: 60, spread: 70, startVelocity: 30, origin: { y: 0.75 }, colors, scalar: 0.8 })
  }
}

export function Logger({ go, initialDayId, onConsumeDay }: { go: (t: Tab) => void; initialDayId?: string | null; onConsumeDay?: () => void }) {
  const { profile, exercises, sessions, settings, draft, routine, dispatch } = useAthlete()
  const [picker, setPicker] = useState(false)
  const ask = useConfirm()
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [result, setResult] = useState<null | { tonnage: number; sets: number; prs: { name: string; e1rm: number; previous: number }[]; calibrated: string[] }>(null)
  const active = exercises.filter((e) => !e.archived)
  const today = todayISO()
  const suggested = routine && routine.days.length ? nextDayIndex(routine, sessions) : 0
  const [dayIdx, setDayIdx] = useState(() => {
    const i = routine?.days.findIndex((d) => d.id === initialDayId) ?? -1
    return i >= 0 ? i : suggested
  })
  // Llegada desde "Entrenar <día>" en la vista Rutina: arranca la sesión de ese día directamente.
  useEffect(() => {
    if (!initialDayId) return
    const i = routine?.days.findIndex((d) => d.id === initialDayId) ?? -1
    if (i >= 0 && !draft) startDay(i)
    onConsumeDay?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDayId])

  // Mejor 1RM previo por ejercicio (para detectar PRs en directo). Sin calibrar = 0 (sin PR posible).
  const bestPrev = useMemo(() => {
    const m = new Map<string, number>()
    for (const ex of exercises) m.set(ex.id, isCalibrated(ex) ? analyzeExercise(ex, profile, sessions, settings).currentBest : 0)
    return m
  }, [exercises, profile, sessions, settings])

  const startDay = (i: number) => {
    const day = routine?.days[i]
    if (!day) return
    const entries = day.items
      .map((it) => {
        const ex = exercises.find((e) => e.id === it.exerciseId)
        if (!ex) return null
        return { exerciseId: ex.id, sets: setsFromProtocol(protocolForDate(ex, it, profile, sessions, settings, today)) }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
    dispatch({ type: 'startDraft', dayId: day.id, entries })
  }

  const addExercise = (ex: Exercise) => {
    const date = draft?.date ?? today
    const item = findRoutineItem(routine, ex.id)
    if (item) {
      dispatch({ type: 'addDraftExercise', exerciseId: ex.id, sets: setsFromProtocol(protocolForDate(ex, item, profile, sessions, settings, date)) })
      return
    }
    const p = todaysPrescription(ex, profile, sessions, settings, date)
    dispatch({
      type: 'addDraftExercise',
      exerciseId: ex.id,
      sets: Array.from({ length: p.sets }, () => ({ weight: p.weight, reps: p.reps, rpe: p.rpe, done: false, kind: 'normal' as const })),
    })
  }

  const finish = () => {
    if (!draft) return
    const doneSets = draft.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
    if (doneSets === 0) {
      dispatch({ type: 'discardDraft' })
      return
    }
    const sessionsAfter = [...sessions, { ...draft, entries: draft.entries.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && s.reps > 0) })) }]
    const summary = summarizeSessions(sessionsAfter, exercises, profile, settings).find((s) => s.session.id === draft.id)
    const calibrated = draft.entries
      .filter((e) => {
        const ex = exercises.find((x) => x.id === e.exerciseId)
        return ex && !isCalibrated(ex) && e.sets.some((s) => s.done && isWorkSet(s))
      })
      .map((e) => exercises.find((x) => x.id === e.exerciseId)!.name)
    dispatch({ type: 'finishDraft' })
    setRestEnd(null)
    if (summary) {
      const prs = summary.prs.map((p) => ({ name: exercises.find((e) => e.id === p.exerciseId)?.name ?? '', e1rm: p.e1rm, previous: p.previous }))
      setResult({ tonnage: summary.tonnage, sets: summary.sets, prs, calibrated })
      fireConfetti(prs.length > 0)
    }
  }

  const week = Math.max(1, Math.min(programWeekOf(profile.startDate, today), profile.programWeeks))

  if (!draft) {
    const day = routine?.days[dayIdx]
    return (
      <div className="space-y-6">
        <PageHeader title="Entrenar" subtitle={formatLong(today)} />
        {routine && day ? (
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="relative">
              <div className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 scrollbar-none">
                {routine.days.map((d, i) => (
                  <button
                    key={d.id}
                    onClick={() => setDayIdx(i)}
                    className={cx(
                      'relative whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-medium transition',
                      i === dayIdx ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/[0.06] text-zinc-400 hover:text-zinc-100',
                    )}
                  >
                    Día {i + 1} · {d.name}
                    {i === suggested && <span className="ml-1.5 text-[10px] text-emerald-400">siguiente</span>}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="label !text-emerald-400/80">
                    Semana {week} · Día {dayIdx + 1}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{day.name}</h2>
                  <p className="mt-0.5 text-sm text-zinc-400">{day.focus}</p>
                </div>
                <Button size="lg" onClick={() => startDay(dayIdx)} disabled={day.items.length === 0}>
                  <Plus size={16} /> Empezar {day.name}
                </Button>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {day.items.map((it) => {
                  const ex = exercises.find((e) => e.id === it.exerciseId)
                  if (!ex) return null
                  const p = protocolForDate(ex, it, profile, sessions, settings, today)
                  return <ProtocolRow key={it.id} ex={ex} item={it} plan={p} />
                })}
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState icon={<Dumbbell size={22} />} title="Sin rutina" description="Restaura la rutina predeterminada en la pestaña Rutina o registra una sesión libre." />
          </Card>
        )}
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => dispatch({ type: 'startDraft' })} disabled={active.length === 0}>
            <Plus size={15} /> Sesión libre (sin rutina)
          </Button>
        </div>
        <AnimatePresence>{result && <ResultModal result={result} onClose={() => setResult(null)} onPanel={() => { setResult(null); go('panel') }} />}</AnimatePresence>
      </div>
    )
  }

  const draftTonnage = draft.entries.reduce((t, e) => {
    const ex = exercises.find((x) => x.id === e.exerciseId)
    return t + e.sets.filter((s) => s.done && isWorkSet(s)).reduce((a, s) => a + setTonnage(ex, s.weight, s.reps, profile.bodyweight), 0)
  }, 0)
  const remaining = active.filter((e) => !draft.entries.some((en) => en.exerciseId === e.id))
  const draftDay = routine?.days.find((d) => d.id === draft.dayId)
  const totalWork = draft.entries.reduce((n, e) => n + e.sets.filter((s) => isWorkSet(s)).length, 0)
  const doneWork = draft.entries.reduce((n, e) => n + e.sets.filter((s) => isWorkSet(s) && s.done).length, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {draftDay ? `${draftDay.name} · ${draftDay.focus}` : 'Sesión libre'}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="date"
              value={draft.date}
              max={today}
              onChange={(e) => e.target.value && dispatch({ type: 'setDraftDate', date: e.target.value })}
              className="field !w-auto !py-1.5 text-sm"
              aria-label="Fecha de la sesión"
            />
            <Elapsed since={draft.createdAt} />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="label">Series efectivas</div>
            <div className="tnum text-xl font-semibold text-zinc-50">
              {doneWork}
              <span className="text-sm font-normal text-zinc-500"> / {totalWork}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="label">Tonelaje</div>
            <motion.div key={Math.round(draftTonnage)} initial={{ y: -4, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="tnum text-xl font-semibold text-zinc-50">
              {tonnage(draftTonnage)}
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {draft.entries.map((entry) => {
          const ex = exercises.find((e) => e.id === entry.exerciseId)
          if (!ex) return null
          const item = findRoutineItem(routine, ex.id)
          const proto = item ? protocolForDate(ex, item, profile, sessions, settings, draft.date) : null
          const plan = proto ? null : todaysPrescription(ex, profile, sessions, settings, draft.date)
          return (
            <EntryCard
              key={entry.exerciseId}
              ex={ex}
              entry={entry}
              item={item}
              proto={proto}
              plan={plan}
              bodyweight={profile.bodyweight}
              formula={settings.formula}
              rounding={settings.rounding}
              bestPrev={bestPrev.get(ex.id) ?? 0}
              onSetDone={(set, isPr) => {
                const secs = set.kind === 'warmup' ? PROTOCOL.warmupRestSeconds : item?.restSeconds ?? settings.restSeconds
                setRestEnd(Date.now() + secs * 1000)
                if (isPr) fireConfetti(false)
              }}
            />
          )
        })}
      </AnimatePresence>

      {draft.entries.length === 0 && (
        <Card>
          <EmptyState icon={<Dumbbell size={22} />} title="Añade tu primer ejercicio" description="Se cargará con las series, reps y peso que te toca hoy." />
        </Card>
      )}

      <Button variant="secondary" className="w-full border-dashed" size="lg" onClick={() => setPicker(true)} disabled={remaining.length === 0}>
        <Plus size={16} /> Añadir ejercicio
      </Button>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button
          variant="ghost"
          onClick={async () => {
            if (await ask({ title: 'Descartar sesión', message: 'Se perderán las series registradas en esta sesión.', confirmLabel: 'Descartar', danger: true })) dispatch({ type: 'discardDraft' })
          }}
        >
          <X size={16} /> Descartar
        </Button>
        <Button size="lg" onClick={finish}>
          <Flag size={16} /> Finalizar sesión
        </Button>
      </div>

      <Modal open={picker} onClose={() => setPicker(false)} title="Añadir ejercicio">
        <div className="space-y-2">
          {remaining.map((ex) => {
            const item = findRoutineItem(routine, ex.id)
            const p = item ? protocolForDate(ex, item, profile, sessions, settings, draft.date) : null
            const q = p ? null : todaysPrescription(ex, profile, sessions, settings, draft.date)
            return (
              <motion.button
                key={ex.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  addExercise(ex)
                  setPicker(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">{ex.name}</div>
                  <div className="text-xs text-zinc-500">{muscleLabel(ex.muscleGroup)}</div>
                </div>
                <div className="tnum text-right text-xs text-zinc-400">
                  {p ? (p.calibrate ? 'Calibrar' : `TS ${kg(p.top.weight)}`) : q ? `${q.sets} × ${q.reps} @ ${ex.bodyweight ? `+${kg(q.weight)}` : kg(q.weight)}` : ''}
                </div>
              </motion.button>
            )
          })}
        </div>
      </Modal>

      <RestTimer end={restEnd} onDone={() => setRestEnd(null)} onAdd={(s) => setRestEnd((e) => (e ?? Date.now()) + s * 1000)} />
      <AnimatePresence>{result && <ResultModal result={result} onClose={() => setResult(null)} onPanel={() => go('panel')} />}</AnimatePresence>
    </div>
  )
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="label">{subtitle}</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{title}</h1>
    </div>
  )
}

/** Resumen compacto del protocolo de un ejercicio (TS / BS / descanso / +LP). */
export function ProtocolRow({ ex, item, plan }: { ex: Exercise; item: RoutineItem; plan: ProtocolPlan }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">{ex.name}</span>
        <div className="flex shrink-0 gap-1">
          {plan.deload && <Badge tone="violet">Descarga</Badge>}
          {item.partials && !plan.deload && <Badge tone="emerald">+LP</Badge>}
        </div>
      </div>
      {plan.calibrate ? (
        <div className="mt-1 text-xs text-amber-300/90">
          Calibrar: Top Set de {item.top[0]}–{item.top[1]} reps a RIR 1–0
        </div>
      ) : (
        <div className="tnum mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-400">
          <span>
            <span className="text-zinc-500">TS</span> <span className="font-semibold text-zinc-100">{kg(plan.top.weight)}</span> × {item.top[0]}–{item.top[1]}
          </span>
          {plan.backoff ? (
            <span>
              <span className="text-zinc-500">BS</span> <span className="font-semibold text-zinc-100">{kg(plan.backoff.weight)}</span> × {item.backoff[0]}–{item.backoff[1]}
            </span>
          ) : (
            <span className="text-violet-300">Sin back-off · RIR 3</span>
          )}
          <span className="text-zinc-500">{restLabel(item.restSeconds)}</span>
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<string, string> = { warmup: 'C', top: 'TS', backoff: 'BS', normal: '' }

function EntryCard({
  ex,
  entry,
  item,
  proto,
  plan,
  bodyweight,
  formula,
  rounding,
  bestPrev,
  onSetDone,
}: {
  ex: Exercise
  entry: ExerciseLog
  item?: RoutineItem
  proto: ProtocolPlan | null
  plan: WeekPlan | null
  bodyweight: number
  formula: Formula
  rounding: number
  bestPrev: number
  onSetDone: (set: SetLog, isPr: boolean) => void
}) {
  const { dispatch } = useAthlete()
  const [showNotes, setShowNotes] = useState(false)
  const e1rms = entry.sets.map((s) => (s.done && isWorkSet(s) ? estimate1RM(effectiveLoad(ex, s.weight, bodyweight), s.reps, s.rpe, formula) : 0))
  const sessionBest = Math.max(0, ...e1rms)
  const target = proto ? proto.targetE1RM : plan?.targetE1RM ?? 0
  const vsTarget = sessionBest > 0 && target > 0 ? (sessionBest / target - 1) * 100 : null
  const update = (setId: string, patch: Partial<SetLog>) => dispatch({ type: 'updateDraftSet', exerciseId: ex.id, setId, patch })

  // Al cambiar el peso del Top Set, el Back-off (−12,5 %) y las aproximaciones pendientes se recalculan solos.
  const changeWeight = (s: SetLog, w: number) => {
    update(s.id, { weight: w })
    if (s.kind !== 'top') return
    const bo = entry.sets.find((x) => x.kind === 'backoff' && !x.done)
    if (bo) update(bo.id, { weight: Math.max(0, roundToPlate(w * (1 - PROTOCOL.backoffDrop), rounding)) })
    const pending = entry.sets.filter((x) => x.kind === 'warmup' && !x.done)
    const ws = warmupSets(w, rounding)
    const offset = Math.max(0, ws.length - pending.length)
    pending.forEach((x, i) => {
      const t = ws[Math.min(i + offset, ws.length - 1)]
      if (t) update(x.id, { weight: t.weight })
    })
  }

  const toggle = (s: SetLog, idx: number) => {
    const done = !s.done
    update(s.id, { done })
    if (done) {
      const v = isWorkSet(s) ? estimate1RM(effectiveLoad(ex, s.weight, bodyweight), s.reps, s.rpe, formula) : 0
      const prevInSession = Math.max(0, ...e1rms.filter((_, i) => i !== idx))
      onSetDone(s, bestPrev > 0 && v > bestPrev && v > prevInSession)
    }
  }

  const repsHint = (s: SetLog) => (s.kind === 'top' && item ? `${item.top[0]}–${item.top[1]}` : s.kind === 'backoff' && item ? `${item.backoff[0]}–${item.backoff[1]}` : null)

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="glass p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[16px] font-semibold text-zinc-50">{ex.name}</h3>
            {(proto?.deload || plan?.deload) && <Badge tone="violet">Descarga</Badge>}
            {item?.partials && !proto?.deload && <Badge tone="emerald">+LP</Badge>}
            {ex.unilateral && <Badge>Por lado</Badge>}
          </div>
          <div className="tnum mt-1 text-xs text-zinc-500">
            {proto ? (
              proto.calibrate ? (
                <span className="text-amber-300/90">Primera vez: elige el peso de tu Top Set ({item!.top[0]}–{item!.top[1]} reps, RIR 1–0). Será tu referencia.</span>
              ) : (
                <>
                  TS {kg(proto.top.weight)} × {item!.top[0]}–{item!.top[1]} @ RIR {proto.deload ? 3 : '1–0'}
                  {proto.backoff && ` · BS ${kg(proto.backoff.weight)} × ${item!.backoff[0]}–${item!.backoff[1]} al fallo`}
                  {` · descanso ${restLabel(item!.restSeconds)}`}
                </>
              )
            ) : (
              plan && (
                <>
                  Objetivo: {plan.sets} × {plan.reps} @ {ex.bodyweight ? `+${kg(plan.weight)}` : kg(plan.weight)} · RPE {plan.rpe}
                </>
              )
            )}
          </div>
        </div>
        <button onClick={() => dispatch({ type: 'removeDraftExercise', exerciseId: ex.id })} aria-label="Quitar ejercicio" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-600 transition hover:bg-white/5 hover:text-rose-300">
          <Trash2 size={16} />
        </button>
      </div>

      {item?.notes && (
        <div className="mt-2">
          <button onClick={() => setShowNotes((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-200">
            <Info size={12} /> Ejecución <ChevronDown size={12} className={cx('transition-transform', showNotes && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {showNotes && (
              <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pt-1.5 text-[13px] leading-relaxed text-zinc-400">
                {item.notes}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {sessionBest > 0 && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">1RM de hoy</span>
          <span className="tnum font-semibold text-zinc-100">{kg(sessionBest)}</span>
          {vsTarget != null && (
            <Badge tone={vsTarget >= -2 ? 'emerald' : 'amber'}>
              {vsTarget >= 0 ? '+' : ''}
              {vsTarget.toFixed(1)}% vs meta
            </Badge>
          )}
          {bestPrev > 0 && sessionBest > bestPrev && (
            <Badge tone="amber">
              <Trophy size={11} /> Nuevo récord
            </Badge>
          )}
        </motion.div>
      )}

      <div className="mt-4">
        <div className="mb-2 grid grid-cols-[1.75rem_1fr_1fr_4.25rem_2.75rem] items-center gap-2 px-0.5 sm:grid-cols-[2.25rem_1fr_1fr_5rem_3rem]">
          <span className="label !text-[10px]">Serie</span>
          <span className="label !text-[10px]">{ex.bodyweight ? 'Lastre' : 'Peso'}</span>
          <span className="label !text-[10px]">Reps</span>
          <span className="label !text-[10px]">RPE</span>
          <span />
        </div>
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {entry.sets.map((s, i) => {
              const warm = s.kind === 'warmup'
              const label = KIND_LABEL[s.kind ?? 'normal'] || String(i + 1)
              const hint = repsHint(s)
              return (
                <motion.div key={s.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10, height: 0 }}>
                  <div
                    className={cx(
                      'grid grid-cols-[1.75rem_1fr_1fr_4.25rem_2.75rem] items-center gap-2 rounded-xl transition-colors sm:grid-cols-[2.25rem_1fr_1fr_5rem_3rem]',
                      s.done && !warm && 'bg-emerald-500/[0.06]',
                      warm && 'opacity-70',
                    )}
                  >
                    <button
                      onClick={() => entry.sets.length > 1 && dispatch({ type: 'removeDraftSet', exerciseId: ex.id, setId: s.id })}
                      title={warm ? 'Aproximación (no cuenta para el 1RM) · pulsa para eliminar' : 'Eliminar serie'}
                      className={cx(
                        'tnum grid h-10 place-items-center text-[12px] font-bold transition',
                        s.kind === 'top' ? 'text-emerald-400' : s.kind === 'backoff' ? 'text-violet-300' : s.done ? 'text-emerald-400' : 'text-zinc-500',
                        'hover:text-rose-300',
                      )}
                    >
                      {label}
                    </button>
                    <Stepper compact bareOnMobile value={s.weight} step={rounding} onChange={(v) => changeWeight(s, v)} ariaLabel={`Peso serie ${i + 1}`} />
                    <div className="relative">
                      <Stepper compact bareOnMobile value={s.reps} step={1} max={100} onChange={(v) => update(s.id, { reps: Math.round(v) })} ariaLabel={`Reps serie ${i + 1}`} />
                      {hint && <span className="tnum pointer-events-none absolute -bottom-3.5 left-0 right-0 text-center text-[9px] text-zinc-600">{hint}</span>}
                    </div>
                    {warm ? (
                      <span className="text-center text-[11px] text-zinc-600">aprox.</span>
                    ) : (
                      <select
                        value={s.rpe ?? ''}
                        onChange={(e) => update(s.id, { rpe: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="tnum h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 text-center text-sm text-zinc-100 outline-none focus:border-emerald-500/50"
                        aria-label={`RPE serie ${i + 1}`}
                      >
                        <option value="" className="bg-ink-900">
                          —
                        </option>
                        {RPE_OPTIONS.map((r) => (
                          <option key={r} value={r} className="bg-ink-900">
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => toggle(s, i)}
                      aria-label={s.done ? 'Desmarcar serie' : 'Completar serie'}
                      className={cx(
                        'grid h-10 w-full place-items-center rounded-xl border transition-all duration-200',
                        s.done
                          ? warm
                            ? 'border-zinc-500 bg-zinc-600 text-ink-950'
                            : 'border-emerald-400 bg-emerald-500 text-ink-950 shadow-[0_0_20px_-4px_rgba(16,185,129,.7)]'
                          : 'border-white/[0.1] bg-white/[0.03] text-zinc-500 hover:border-emerald-500/40 hover:text-emerald-300',
                      )}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {s.done ? (
                          <motion.span key="d" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}>
                            <Check size={18} strokeWidth={3} />
                          </motion.span>
                        ) : (
                          <motion.span key="u" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                            <Check size={16} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                  {s.kind === 'backoff' && item?.partials && !proto?.deload && (
                    <div className="mt-4 flex items-center justify-end gap-2 pr-0.5 text-xs text-zinc-400">
                      <span>
                        <span className="font-semibold text-emerald-300">+LP</span> parciales en estiramiento
                      </span>
                      <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                        {[0, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => update(s.id, { partials: n || undefined })}
                            className={cx('tnum h-8 w-8 rounded-lg text-xs font-semibold transition', (s.partials ?? 0) === n ? 'bg-emerald-500 text-ink-950' : 'text-zinc-400 hover:text-zinc-100')}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
        <button onClick={() => dispatch({ type: 'addDraftSet', exerciseId: ex.id })} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium text-zinc-500 transition hover:bg-white/[0.03] hover:text-emerald-300">
          <Plus size={14} /> Añadir serie
        </button>
      </div>
    </motion.div>
  )
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const secs = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  // Si la sesión se abrió hace más de 12 h (p. ej. registro de un día pasado) no tiene sentido mostrar el cronómetro.
  if (h >= 12) return null
  return (
    <span className="tnum flex items-center gap-1.5 text-sm text-zinc-400">
      <Clock size={14} />
      {h > 0 ? `${h}:` : ''}
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

function RestTimer({ end, onDone, onAdd }: { end: number | null; onDone: () => void; onAdd: (s: number) => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!end) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [end])
  const left = end ? Math.max(0, Math.ceil((end - now) / 1000)) : 0
  useEffect(() => {
    if (end && left === 0) {
      try {
        navigator.vibrate?.([120, 80, 120])
      } catch {
        /* sin vibración */
      }
      const t = setTimeout(onDone, 1200)
      return () => clearTimeout(t)
    }
  }, [end, left, onDone])
  return (
    <AnimatePresence>
      {end && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="fixed inset-x-0 bottom-24 z-40 mx-auto w-fit lg:bottom-8"
        >
          <div className={cx('glass-strong flex items-center gap-3 !rounded-full py-2 pl-4 pr-2 shadow-2xl', left === 0 && '!border-emerald-500/50 shadow-glow')}>
            <Timer size={16} className={left === 0 ? 'text-emerald-400' : 'text-zinc-400'} />
            <span className="tnum min-w-[3.5rem] text-lg font-semibold text-zinc-50">
              {left === 0 ? '¡Vamos!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
            </span>
            <button onClick={() => onAdd(30)} className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
              +30s
            </button>
            <button onClick={onDone} aria-label="Cerrar temporizador" className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-white/10 hover:text-zinc-100">
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ResultModal({ result, onClose, onPanel }: { result: { tonnage: number; sets: number; prs: { name: string; e1rm: number; previous: number }[]; calibrated: string[] }; onClose: () => void; onPanel: () => void }) {
  return (
    <Modal open onClose={onClose} title={result.prs.length ? '¡Nuevo récord personal!' : 'Sesión completada'}>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="label">Tonelaje</div>
          <div className="tnum mt-1 text-2xl font-semibold text-zinc-50">{tonnage(result.tonnage)}</div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="label">Series efectivas</div>
          <div className="tnum mt-1 text-2xl font-semibold text-zinc-50">{result.sets}</div>
        </div>
      </div>
      {result.prs.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.prs.map((p, i) => (
            <motion.div key={p.name} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }} className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <Trophy size={18} className="text-amber-300" />
              <div className="flex-1 text-sm font-medium text-zinc-100">{p.name}</div>
              <div className="tnum text-right text-sm">
                <span className="text-zinc-500 line-through">{kg(p.previous)}</span> <span className="font-semibold text-amber-200">{kg(p.e1rm)}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {result.calibrated.length > 0 && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3 text-sm text-zinc-300">
          <span className="font-semibold text-emerald-300">Calibrados:</span> {result.calibrated.join(', ')}. A partir de ahora tienen peso prescrito y curva de progresión propia.
        </div>
      )}
      <p className="mt-4 text-sm text-zinc-400">Tu curva de progresión se ha recalculado con estos datos.</p>
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cerrar
        </Button>
        <Button className="flex-1" onClick={onPanel}>
          Ver panel
        </Button>
      </div>
    </Modal>
  )
}
