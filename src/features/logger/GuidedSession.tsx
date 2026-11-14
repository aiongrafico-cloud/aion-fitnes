import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Check, ChevronDown, Flag, Minus, Plus, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, cx } from '../../components/ui'
import { TechniquePanel } from '../../components/motion/TechniquePanel'
import { useAthlete } from '../../store/AppStore'
import { roundToPlate } from '../../lib/oneRepMax'
import { findRoutineItem, PROTOCOL, progressionStep, rirLabel } from '../../lib/routine'
import { motionFor } from '../../lib/motion'
import { kg } from '../../lib/format'
import { beep, keepScreenOn, kgSpoken, say, secondsSpoken, setVoiceEnabled, stopSpeaking, vibrate, voiceEnabled } from '../../lib/voice'
import type { Exercise, ExerciseLog, RoutineItem, SetLog } from '../../lib/types'

interface Step {
  ex: Exercise
  entry: ExerciseLog
  set: SetLog
  item?: RoutineItem
}

const RIR_CHOICES = [0, 1, 2, 3, 4]

function rirSpoken(r: [number, number]): string {
  if (r[0] === r[1]) return r[0] === 0 ? 'al fallo' : `dejando ${r[0]} en reserva`
  return `dejando ${r[0]} o ${r[1]} en reserva`
}

function setTitle(step: Step): string {
  const { entry, set } = step
  if (set.kind === 'warmup') {
    const w = entry.sets.filter((s) => s.kind === 'warmup')
    return `Calentamiento ${w.indexOf(set) + 1} de ${w.length}`
  }
  if (set.kind === 'top') return 'Top Set'
  if (set.kind === 'backoff') return 'Back-off'
  const work = entry.sets.filter((s) => s.kind !== 'warmup')
  return `Serie ${work.indexOf(set) + 1} de ${work.length}`
}

function targetText(step: Step): string {
  const { set, item } = step
  if (set.kind === 'warmup') return `${set.reps} reps suaves`
  if (!item) return `${set.reps} reps`
  if (set.kind === 'backoff') return `${item.backoff[0]}–${item.backoff[1]} reps · al fallo`
  if (set.kind === 'top') return `${item.top[0]}–${item.top[1]} reps · RIR 1–0`
  return `${item.top[0]}–${item.top[1]} reps · RIR ${rirLabel(item.rir ?? [1, 2])}`
}

function announce(step: Step, firstOfExercise: boolean): string {
  const { ex, set, item } = step
  const load = kgSpoken(set.weight, ex.bodyweight)
  let txt = `${ex.name}. ${setTitle(step)}. `
  if (set.kind === 'warmup') txt += `${load}, ${set.reps} repeticiones suaves.`
  else if (!item) txt += `${load}, ${set.reps} repeticiones.`
  else if (set.kind === 'top') txt += `${load}, de ${item.top[0]} a ${item.top[1]} repeticiones, a una del fallo.`
  else if (set.kind === 'backoff') txt += `${load}, de ${item.backoff[0]} a ${item.backoff[1]} repeticiones, al fallo.`
  else txt += `${load}, de ${item.top[0]} a ${item.top[1]} repeticiones, ${rirSpoken(item.rir ?? [1, 2])}.`
  const cue = motionFor(ex.name)?.cues[0]
  if (firstOfExercise && cue) txt += ` Clave: ${cue}.`
  return txt
}

export function GuidedSession({ onClose, onFinish }: { onClose: () => void; onFinish: () => void }) {
  const { draft, exercises, routine, settings, dispatch } = useAthlete()
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [restTotal, setRestTotal] = useState(0)
  const [feedback, setFeedback] = useState<{ up: boolean; text: string } | null>(null)
  const [voice, setVoice] = useState(voiceEnabled())
  const [showTech, setShowTech] = useState(true)
  const [now, setNow] = useState(Date.now())

  const steps = useMemo<Step[]>(() => {
    if (!draft) return []
    const out: Step[] = []
    for (const entry of draft.entries) {
      const ex = exercises.find((e) => e.id === entry.exerciseId)
      if (!ex) continue
      const item = findRoutineItem(routine, ex.id)
      for (const set of entry.sets) out.push({ ex, entry, set, item })
    }
    return out
  }, [draft, exercises, routine])

  const pending = steps.filter((s) => !s.set.done && !skipped.has(s.ex.id))
  const current = pending[0] ?? null
  const next = pending[1] ?? null
  const doneCount = steps.filter((s) => s.set.done).length
  const resting = restEnd != null
  const left = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0

  // Pantalla encendida mientras dure el modo guiado.
  useEffect(() => {
    void keepScreenOn(true)
    return () => {
      void keepScreenOn(false)
      stopSpeaking()
    }
  }, [])

  // Anuncia cada serie nueva (cuando no se está descansando).
  const lastAnnounced = useRef<string | null>(null)
  useEffect(() => {
    if (!current || resting) return
    if (lastAnnounced.current === current.set.id) return
    lastAnnounced.current = current.set.id
    void say(announce(current, current.entry.sets.every((s) => !s.done)))
  }, [current, resting])

  // Cuenta atrás del descanso con avisos de voz y pitidos.
  const spoken = useRef<Set<number>>(new Set())
  useEffect(() => {
    if (!restEnd) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [restEnd])
  useEffect(() => {
    if (!restEnd) return
    const mark = (n: number) => {
      if (spoken.current.has(n)) return false
      spoken.current.add(n)
      return true
    }
    if (left === 10 && restTotal > 20 && mark(10)) void say('10 segundos. Prepárate.')
    if (left > 0 && left <= 3 && mark(left)) beep(660, 120)
    if (left === 0 && mark(0)) {
      beep(990, 350)
      vibrate([150, 80, 150])
      setRestEnd(null)
      setFeedback(null)
    }
  }, [left, restEnd, restTotal])

  if (!draft) return null

  const update = (step: Step, patch: Partial<SetLog>) => dispatch({ type: 'updateDraftSet', exerciseId: step.ex.id, setId: step.set.id, patch })

  const changeWeight = (step: Step, w: number) => {
    update(step, { weight: w })
    const { entry, set } = step
    if (set.kind === 'work') {
      const idx = entry.sets.indexOf(set)
      entry.sets
        .slice(idx + 1)
        .filter((x) => x.kind === 'work' && !x.done)
        .forEach((x) => dispatch({ type: 'updateDraftSet', exerciseId: step.ex.id, setId: x.id, patch: { weight: w } }))
    } else if (set.kind === 'top') {
      const bo = entry.sets.find((x) => x.kind === 'backoff' && !x.done)
      if (bo) dispatch({ type: 'updateDraftSet', exerciseId: step.ex.id, setId: bo.id, patch: { weight: Math.max(0, roundToPlate(w * (1 - PROTOCOL.backoffDrop), settings.rounding)) } })
    }
  }

  /** Mensaje del entrenador al terminar la última serie de trabajo de un ejercicio. */
  const progressFeedback = (step: Step): { up: boolean; text: string; speech: string } | null => {
    const { item, entry, set, ex } = step
    if (!item || set.kind === 'warmup') return null
    const work = entry.sets.filter((s) => s.kind !== 'warmup')
    if (work[work.length - 1]?.id !== set.id) return null
    if (item.scheme === 'straight') {
      const atW = work.filter((s) => s.weight >= work[0].weight)
      if (atW.length >= (item.sets ?? 3) && atW.every((s) => s.reps >= item.top[1])) {
        const to = work[0].weight + progressionStep(work[0].weight, settings.rounding)
        return { up: true, text: `Todas las series en el tope. Próxima sesión: ${kg(to)}.`, speech: `Muy bien. Todas las series en el tope del rango. La próxima vez subimos a ${kgSpoken(to)}.` }
      }
      if (work[0].reps < item.top[0]) return { up: false, text: 'Te quedaste corto. La próxima sesión ajusto la carga.', speech: 'Te quedaste por debajo del rango. La próxima vez ajusto la carga.' }
      return null
    }
    const top = work.find((s) => s.kind === 'top')
    if (top && top.reps >= item.top[1]) {
      const to = top.weight + progressionStep(top.weight, settings.rounding)
      return { up: true, text: `Top Set en el tope. Próxima sesión: ${kg(to)}.`, speech: `${ex.name} completado. Tocaste el tope, la próxima vez subimos a ${kgSpoken(to)}.` }
    }
    return null
  }

  const complete = (step: Step) => {
    update(step, { done: true })
    const fb = progressFeedback(step)
    setFeedback(fb ? { up: fb.up, text: fb.text } : null)
    const after = pending.filter((s) => s.set.id !== step.set.id)[0]
    if (!after) {
      void say(fb ? `${fb.speech} Entrenamiento completado. ¡Gran trabajo!` : 'Entrenamiento completado. ¡Gran trabajo!')
      return
    }
    const secs = step.set.kind === 'warmup' ? PROTOCOL.warmupRestSeconds : step.item?.restSeconds ?? settings.restSeconds
    spoken.current = new Set()
    setRestTotal(secs)
    setRestEnd(Date.now() + secs * 1000)
    setNow(Date.now())
    const nextTxt = after.ex.id !== step.ex.id ? `Siguiente ejercicio: ${after.ex.name}.` : `Siguiente: ${setTitle(after).toLowerCase()}, ${kgSpoken(after.set.weight, after.ex.bodyweight)}.`
    void say(`${fb ? fb.speech + ' ' : ''}Descansa ${secondsSpoken(secs)}. ${nextTxt}`)
  }

  const skipExercise = (step: Step) => {
    setSkipped((s) => new Set(s).add(step.ex.id))
    setRestEnd(null)
  }

  const toggleVoice = () => {
    const v = !voice
    setVoice(v)
    setVoiceEnabled(v)
  }

  const exIndex = current ? draft.entries.findIndex((e) => e.exerciseId === current.ex.id) : -1
  const progress = steps.length ? doneCount / steps.length : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-ink-950"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 pb-8 pt-3">
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Salir del modo guiado" className="grid h-10 w-10 place-items-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
            <X size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="label truncate">Modo guiado{exIndex >= 0 ? ` · Ejercicio ${exIndex + 1} de ${draft.entries.length}` : ''}</div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div className="h-full rounded-full bg-emerald-500" animate={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <button onClick={toggleVoice} aria-label={voice ? 'Silenciar voz' : 'Activar voz'} className={cx('grid h-10 w-10 place-items-center rounded-xl hover:bg-white/5', voice ? 'text-emerald-400' : 'text-zinc-500')}>
            {voice ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!current ? (
            <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
                <Flag size={34} />
              </div>
              <h2 className="mt-6 text-2xl font-semibold text-zinc-50">¡Entrenamiento completado!</h2>
              <p className="mt-2 text-sm text-zinc-400">
                {doneCount} series hechas{skipped.size ? ` · ${skipped.size} ejercicio${skipped.size > 1 ? 's' : ''} saltado${skipped.size > 1 ? 's' : ''}` : ''}.
              </p>
              {feedback && <FeedbackBox fb={feedback} className="mt-5 w-full" />}
              <div className="mt-8 flex w-full gap-3">
                <Button variant="secondary" className="flex-1" onClick={onClose}>
                  Revisar series
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    onClose()
                    onFinish()
                  }}
                >
                  <Flag size={16} /> Finalizar
                </Button>
              </div>
            </motion.div>
          ) : resting ? (
            <motion.div key="rest" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center pt-8">
              <div className="label">Descanso</div>
              <RestRing left={left} total={restTotal} />
              <div className="mt-6 flex gap-2">
                <Button variant="secondary" onClick={() => setRestEnd((e) => (e ?? Date.now()) + 30_000)}>
                  +30 s
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRestEnd(null)
                    setFeedback(null)
                  }}
                >
                  <SkipForward size={15} /> Saltar descanso
                </Button>
              </div>
              {feedback && <FeedbackBox fb={feedback} className="mt-6 w-full" />}
              <div className="mt-6 w-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="label">A continuación</div>
                <div className="mt-1.5 text-base font-semibold text-zinc-100">{current.ex.name}</div>
                <div className="tnum mt-0.5 text-sm text-zinc-400">
                  {setTitle(current)} · {current.ex.bodyweight ? `+${kg(current.set.weight)}` : kg(current.set.weight)} · {targetText(current)}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key={current.set.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="flex flex-1 flex-col pt-5">
              <div className={cx('label', current.set.kind === 'warmup' ? '!text-zinc-400' : '!text-emerald-400/90')}>{setTitle(current)}</div>
              <h2 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-50">{current.ex.name}</h2>
              <div className="tnum mt-1 text-sm text-zinc-400">{targetText(current)}</div>

              <button onClick={() => setShowTech((v) => !v)} className="mt-3 flex items-center gap-1 self-start text-xs font-medium text-zinc-500 hover:text-zinc-200">
                Técnica <ChevronDown size={12} className={cx('transition-transform', showTech && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {showTech && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <TechniquePanel name={current.ex.name} notes={current.item?.notes} />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <BigStepper label={current.ex.bodyweight ? 'Lastre' : 'Peso'} value={current.set.weight} unit="kg" step={settings.rounding} onChange={(v) => changeWeight(current, v)} />
                <BigStepper label="Reps hechas" value={current.set.reps} step={1} onChange={(v) => update(current, { reps: Math.max(0, Math.round(v)) })} />
              </div>
              {current.set.kind !== 'warmup' && (
                <div className="mt-4">
                  <div className="label mb-2">¿Cuántas te quedaban en reserva?</div>
                  <div className="grid grid-cols-5 gap-2">
                    {RIR_CHOICES.map((r) => {
                      const sel = current.set.rpe != null && Math.round(10 - current.set.rpe) === r
                      return (
                        <button
                          key={r}
                          onClick={() => update(current, { rpe: 10 - r })}
                          className={cx('tnum h-11 rounded-xl border text-sm font-semibold transition', sel ? 'border-emerald-400 bg-emerald-500 text-ink-950' : 'border-white/[0.08] bg-white/[0.03] text-zinc-300')}
                        >
                          {r === 4 ? '4+' : r}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="sticky bottom-0 -mx-4 mt-auto bg-ink-950/95 px-4 pb-2 pt-4 backdrop-blur">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => complete(current)}
                  disabled={current.set.reps <= 0}
                  className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-lg font-semibold text-ink-950 shadow-[0_0_40px_-8px_rgba(16,185,129,.7)] disabled:opacity-40"
                >
                  <Check size={22} strokeWidth={3} /> Serie hecha
                </motion.button>
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                  <button onClick={() => void say(announce(current, true))} className="rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-zinc-200">
                    Repetir indicaciones
                  </button>
                  <button onClick={() => skipExercise(current)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-zinc-200">
                    <SkipForward size={13} /> Saltar ejercicio
                  </button>
                </div>
                {next && next.ex.id !== current.ex.id && <div className="mt-2 text-center text-[11px] text-zinc-600">Después: {next.ex.name}</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function FeedbackBox({ fb, className }: { fb: { up: boolean; text: string }; className?: string }) {
  return (
    <div
      className={cx(
        'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm',
        fb.up ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200' : 'border-amber-500/25 bg-amber-500/[0.08] text-amber-200',
        className,
      )}
    >
      {fb.up ? <ArrowUp size={16} className="mt-0.5 shrink-0" /> : <ArrowDown size={16} className="mt-0.5 shrink-0" />}
      {fb.text}
    </div>
  )
}

function RestRing({ left, total }: { left: number; total: number }) {
  const r = 92
  const c = 2 * Math.PI * r
  const frac = total > 0 ? Math.min(1, left / total) : 0
  return (
    <div className="relative mt-4 h-56 w-56">
      <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
        <circle cx="110" cy="110" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="12" />
        <circle
          cx="110"
          cy="110"
          r={r}
          fill="none"
          stroke={left <= 10 ? '#f59e0b' : '#10b981'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset .25s linear' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="tnum text-5xl font-semibold text-zinc-50">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
      </div>
    </div>
  )
}

function BigStepper({ label, value, unit, step, onChange }: { label: string; value: number; unit?: string; step: number; onChange: (v: number) => void }) {
  const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',')
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="label text-center">{label}</div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <button onClick={() => onChange(Math.max(0, Math.round((value - step) * 100) / 100))} aria-label={`Bajar ${label}`} className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.05] text-zinc-300 active:bg-white/10">
          <Minus size={18} />
        </button>
        <div className="tnum text-center text-3xl font-semibold text-zinc-50">
          {fmt(value)}
          {unit && <span className="ml-0.5 text-sm font-normal text-zinc-500">{unit}</span>}
        </div>
        <button onClick={() => onChange(Math.round((value + step) * 100) / 100)} aria-label={`Subir ${label}`} className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.05] text-zinc-300 active:bg-white/10">
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}
