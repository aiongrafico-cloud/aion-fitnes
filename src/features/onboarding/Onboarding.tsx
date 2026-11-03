import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Flame, Gauge, Plus, Sparkles, Target, Trash2, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Badge, Button, Field, Segmented, Stepper, cx } from '../../components/ui'
import { Logo } from '../../components/layout/Shell'
import { useStore } from '../../store/AppStore'
import { MUSCLE_GROUPS } from '../../lib/catalog'
import { buildDefaultRoutine, findRoutineItem, isStraight, itemLabel, protocolFor, PROTOCOL, rpeForRir, rirLabel } from '../../lib/routine'
import { estimate1RM } from '../../lib/oneRepMax'
import { EXPERIENCE, GOALS, analyzeExercise, baselineE1RM, suggestedIncrement } from '../../lib/program'
import { buildDemoState } from '../../lib/demo'
import { todayISO } from '../../lib/date'
import { uid } from '../../lib/storage'
import { kg, num, signedPct } from '../../lib/format'
import type { Exercise, Experience, Formula, Goal, MuscleGroup, Profile, Routine, Sex } from '../../lib/types'

interface LiftDraft {
  key: string
  name: string
  muscleGroup: MuscleGroup
  bodyweight: boolean
  include: boolean
  weight: number
  reps: number
  rpe: number
  increment?: number
}

const STEPS = ['Bienvenida', 'Perfil', 'Experiencia', 'Frecuencia', 'Fuerza base', 'Objetivo', 'Tu plan'] as const

export function Onboarding() {
  const { state, dispatch } = useStore()
  const settings = state.settings
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)

  const [name, setName] = useState('')
  const [age, setAge] = useState(28)
  const [sex, setSex] = useState<Sex>('masculino')
  const [bodyweight, setBodyweight] = useState(75)
  const [height, setHeight] = useState(175)
  const [experience, setExperience] = useState<Experience>('intermedio')
  const [daysPerWeek, setDays] = useState(5)
  const [programWeeks, setWeeks] = useState(12)
  const [goal, setGoal] = useState<Goal>('hipertrofia')
  const [lifts, setLifts] = useState<LiftDraft[]>([])
  // Rutina predeterminada Push / Pull / Pierna: sus ejercicios se calibran aquí (opcional) o en la primera sesión.
  const [built] = useState(() => buildDefaultRoutine([]))
  const [calib, setCalib] = useState<Record<string, { on: boolean; weight: number; reps: number; rpe: number }>>(() => {
    const out: Record<string, { on: boolean; weight: number; reps: number; rpe: number }> = {}
    for (const d of built.routine.days)
      for (const it of d.items) out[it.exerciseId] = { on: false, weight: built.samples.get(it.exerciseId) ?? 20, reps: it.top[1], rpe: isStraight(it) ? rpeForRir(it.rir ?? [1, 2]) : PROTOCOL.topRpe }
    return out
  })
  const [increments, setIncrements] = useState<Record<string, number>>({})

  const profile: Profile = useMemo(
    () => ({ name: name.trim() || 'Atleta', age, sex, bodyweight, height, experience, daysPerWeek, goal, programWeeks, startDate: todayISO() }),
    [name, age, sex, bodyweight, height, experience, daysPerWeek, goal, programWeeks],
  )

  const exercises: Exercise[] = useMemo(
    () =>
      lifts
        .filter((l) => l.include && l.name.trim() && l.reps > 0)
        .map((l) => {
          const ex: Exercise = {
            id: l.key,
            name: l.name.trim(),
            muscleGroup: l.muscleGroup,
            bodyweight: l.bodyweight,
            baseline: { weight: l.weight, reps: l.reps, rpe: l.rpe },
            weeklyIncrement: 0,
            startWeek: 0,
            createdAt: new Date().toISOString(),
          }
          ex.weeklyIncrement = increments[ex.id] ?? suggestedIncrement(baselineE1RM(ex, profile, settings), profile, settings)
          return ex
        }),
    [lifts, profile, settings, increments],
  )

  const routineExercises: Exercise[] = useMemo(
    () =>
      built.exercises.map((ex) => {
        const c = calib[ex.id]
        if (!c?.on || c.reps < 1) return ex
        const cal: Exercise = { ...ex, calibrated: true, baseline: { weight: c.weight, reps: c.reps, rpe: c.rpe } }
        cal.weeklyIncrement = increments[ex.id] ?? suggestedIncrement(baselineE1RM(cal, profile, settings), profile, settings)
        return cal
      }),
    [built, calib, increments, profile, settings],
  )
  const allExercises = useMemo(() => [...routineExercises, ...exercises], [routineExercises, exercises])

  const canNext = true
  const next = () => {
    setDir(1)
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  const back = () => {
    setDir(-1)
    setStep((s) => Math.max(0, s - 1))
  }
  const finish = () => dispatch({ type: 'completeOnboarding', profile, exercises: allExercises, routine: built.routine })
  const update = (key: string, patch: Partial<LiftDraft>) => setLifts((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        {step > 0 && (
          <div className="flex items-center gap-3">
            <span className="tnum text-xs text-zinc-500">
              {step} / {STEPS.length - 1}
            </span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.06] sm:w-40">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-500" animate={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 30 }} />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36 sm:px-6">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && <Welcome onStart={next} onDemo={() => dispatch({ type: 'replace', state: buildDemoState() })} />}

            {step === 1 && (
              <StepFrame eyebrow="Punto de inicio" title="Cuéntanos sobre ti" subtitle="Usamos tu peso corporal para ejercicios como dominadas o fondos.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Nombre" className="sm:col-span-2">
                    <input className="field" placeholder="¿Cómo te llamamos?" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  </Field>
                  <Field label="Edad">
                    <Stepper value={age} onChange={setAge} min={14} max={90} suffix="años" />
                  </Field>
                  <Field label="Sexo">
                    <Segmented
                      layoutId="sex"
                      value={sex}
                      onChange={setSex}
                      className="h-12 items-stretch"
                      options={[
                        { value: 'masculino', label: 'Hombre' },
                        { value: 'femenino', label: 'Mujer' },
                        { value: 'otro', label: 'Otro' },
                      ]}
                    />
                  </Field>
                  <Field label="Peso corporal">
                    <Stepper value={bodyweight} onChange={setBodyweight} step={0.5} min={30} max={250} suffix="kg" />
                  </Field>
                  <Field label="Altura">
                    <Stepper value={height} onChange={setHeight} min={120} max={230} suffix="cm" />
                  </Field>
                </div>
              </StepFrame>
            )}

            {step === 2 && (
              <StepFrame eyebrow="Nivel" title="¿Cuál es tu experiencia?" subtitle="Define tu ritmo de progresión esperado y cada cuánto programamos descargas.">
                <div className="grid gap-3">
                  {(Object.keys(EXPERIENCE) as Experience[]).map((k, i) => {
                    const c = EXPERIENCE[k]
                    return (
                      <ChoiceCard key={k} selected={experience === k} onClick={() => setExperience(k)} icon={[<Sparkles key="a" size={20} />, <Gauge key="b" size={20} />, <Flame key="c" size={20} />][i]} title={c.label} description={c.description}>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge tone="emerald">≈ +{num(c.baseRate * 100)}% 1RM / semana al inicio</Badge>
                          <Badge>Descarga cada {c.deloadEvery} semanas</Badge>
                        </div>
                      </ChoiceCard>
                    )
                  })}
                </div>
              </StepFrame>
            )}

            {step === 3 && (
              <StepFrame eyebrow="Disponibilidad" title="¿Cuántos días puedes entrenar?" subtitle="Más frecuencia = más estímulo semanal (hasta cierto punto).">
                <div className="label mb-3">Días por semana</div>
                <div className="grid grid-cols-5 gap-2">
                  {[2, 3, 4, 5, 6].map((d) => (
                    <motion.button
                      key={d}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setDays(d)}
                      className={cx(
                        'glass flex aspect-square flex-col items-center justify-center !rounded-2xl transition-all sm:aspect-auto sm:py-6',
                        daysPerWeek === d ? '!border-emerald-500/50 !bg-emerald-500/10 shadow-glow' : 'hover:!border-white/15',
                      )}
                    >
                      <span className={cx('tnum text-2xl font-semibold sm:text-3xl', daysPerWeek === d ? 'text-emerald-300' : 'text-zinc-200')}>{d}</span>
                      <span className="text-[11px] text-zinc-500">días</span>
                    </motion.button>
                  ))}
                </div>
                <div className="mt-8">
                  <div className="label mb-3">Duración del ciclo</div>
                  <Segmented
                    layoutId="weeks"
                    value={programWeeks}
                    onChange={setWeeks}
                    options={[8, 10, 12].map((w) => ({ value: w, label: `${w} semanas` }))}
                  />
                  <p className="mt-3 text-sm text-zinc-500">La última semana se reserva para expresar tu nueva fuerza; las descargas se intercalan automáticamente.</p>
                </div>
              </StepFrame>
            )}

            {step === 4 && (
              <StepFrame
                eyebrow="Medición de fuerza"
                title="Tu línea base"
                subtitle="Tu rutina Push / Pull / Pierna ya está cargada. Si conoces una serie reciente de algún ejercicio, actívalo e introduce peso, reps y RPE. El resto se calibra solo en tu primera sesión."
              >
                <div className="space-y-6">
                  {built.routine.days.map((d, di) => (
                    <div key={d.id}>
                      <div className="mb-2 flex items-baseline gap-2">
                        <span className="label !text-emerald-400/80">Día {di + 1}</span>
                        <span className="text-sm font-semibold text-zinc-100">{d.name}</span>
                        <span className="truncate text-xs text-zinc-500">{d.focus}</span>
                      </div>
                      <div className="space-y-2">
                        {d.items.map((it) => {
                          const ex = built.exercises.find((e) => e.id === it.exerciseId)!
                          const c = calib[ex.id]
                          const e1rm = c.on ? estimate1RM(c.weight, c.reps, c.rpe, settings.formula) : 0
                          const set = (patch: Partial<typeof c>) => setCalib((m) => ({ ...m, [ex.id]: { ...m[ex.id], ...patch } }))
                          return (
                            <div key={it.id} className={cx('glass !rounded-xl p-3.5 transition', c.on && '!border-emerald-500/25')}>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => set({ on: !c.on })}
                                  aria-label={c.on ? 'Calibrar en la primera sesión' : 'Introducir referencia'}
                                  className={cx('relative h-6 w-10 shrink-0 rounded-full border transition', c.on ? 'border-emerald-400 bg-emerald-500' : 'border-white/15 bg-white/[0.04]')}
                                >
                                  <motion.span layout className={cx('absolute top-0.5 h-4 w-4 rounded-full', c.on ? 'right-0.5 bg-ink-950' : 'left-0.5 bg-zinc-500')} />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-zinc-100">{ex.name}</div>
                                  <div className="text-xs text-zinc-500">
                                    {itemLabel(it)}
                                    {!c.on && ' · se calibra en la 1.ª sesión'}
                                  </div>
                                </div>
                                {c.on && <div className="tnum text-right text-sm font-semibold text-emerald-300">{kg(e1rm)}</div>}
                              </div>
                              {c.on && (
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  <Field label="Peso">
                                    <Stepper compact value={c.weight} onChange={(v) => set({ weight: v })} step={settings.rounding} suffix="kg" />
                                  </Field>
                                  <Field label="Reps">
                                    <Stepper compact value={c.reps} onChange={(v) => set({ reps: Math.round(v) })} min={1} max={30} />
                                  </Field>
                                  <Field label="RPE">
                                    <Stepper compact value={c.rpe} onChange={(v) => set({ rpe: v })} step={0.5} min={5} max={10} />
                                  </Field>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {lifts.map((l) => (
                        <LiftRow key={l.key} lift={l} bodyweight={bodyweight} formula={settings.formula} onChange={(p) => update(l.key, p)} onRemove={() => setLifts((ls) => ls.filter((x) => x.key !== l.key))} />
                      ))}
                    </AnimatePresence>
                    <Button
                      variant="secondary"
                      className="w-full border-dashed"
                      onClick={() => setLifts((ls) => [...ls, { key: uid(), name: '', muscleGroup: 'pecho', bodyweight: false, include: true, weight: 20, reps: 8, rpe: 8 }])}
                    >
                      <Plus size={16} /> Añadir otro ejercicio al catálogo
                    </Button>
                  </div>
                </div>
              </StepFrame>
            )}

            {step === 5 && (
              <StepFrame eyebrow="Objetivo" title="¿Qué quieres conseguir?" subtitle="Determina rangos de repeticiones, series y cómo progresa la sobrecarga.">
                <div className="grid gap-3">
                  {(Object.keys(GOALS) as Goal[]).map((k, i) => {
                    const g = GOALS[k]
                    const mode = { carga: 'Progresión de carga', volumen: 'Progresión de volumen (series)', repeticiones: 'Progresión de repeticiones' }[g.progression]
                    return (
                      <ChoiceCard key={k} selected={goal === k} onClick={() => setGoal(k)} icon={[<Target key="a" size={20} />, <Zap key="b" size={20} />, <Flame key="c" size={20} />][i]} title={g.label} description={g.description} accent={k === 'fuerza' ? 'violet' : 'emerald'}>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge tone={k === 'fuerza' ? 'violet' : 'emerald'}>
                            {g.sets} × {g.repRange[0]}–{g.repRange[1]} reps
                          </Badge>
                          <Badge>RPE {g.rpe}</Badge>
                          <Badge>{mode}</Badge>
                        </div>
                      </ChoiceCard>
                    )
                  })}
                </div>
              </StepFrame>
            )}

            {step === 6 && <Summary profile={profile} exercises={allExercises.filter((e) => e.calibrated !== false)} routine={built.routine} onIncrement={(id, v) => setIncrements((m) => ({ ...m, [id]: v }))} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {step > 0 && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.05] bg-ink-950/80 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <Button variant="ghost" onClick={back}>
              <ArrowLeft size={16} /> Atrás
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={!canNext} size="lg">
                Continuar <ArrowRight size={16} />
              </Button>
            ) : (
              <Button onClick={finish} size="lg" disabled={allExercises.length === 0}>
                Comenzar programa <Check size={16} />
              </Button>
            )}
          </div>
        </footer>
      )}
    </div>
  )
}

function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col justify-center py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Badge tone="emerald" className="mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sobrecarga progresiva adaptativa
        </Badge>
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl font-semibold leading-[1.05] tracking-tight text-zinc-50 sm:text-6xl">
        Entrena con <span className="text-gradient">precisión</span>.<br />
        Progresa con datos.
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mt-5 max-w-xl text-[17px] leading-relaxed text-zinc-400">
        Medimos tu fuerza actual, proyectamos tu curva de mejora a 8–12 semanas y la recalculamos con cada serie que registras.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={onStart}>
          Iniciar evaluación <ArrowRight size={16} />
        </Button>
        <Button size="lg" variant="secondary" onClick={onDemo}>
          Explorar con datos de ejemplo
        </Button>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-14 grid grid-cols-3 gap-3 sm:max-w-lg">
        {[
          ['1RM', 'Epley · Brzycki'],
          ['8–12', 'semanas proyectadas'],
          ['100%', 'datos en tu dispositivo'],
        ].map(([a, b]) => (
          <div key={a} className="glass !rounded-xl p-3">
            <div className="tnum text-lg font-semibold text-zinc-100">{a}</div>
            <div className="text-[11px] leading-tight text-zinc-500">{b}</div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

function StepFrame({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="pt-4 sm:pt-8">
      <div className="label mb-3 !text-emerald-400/80">{eyebrow}</div>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-xl text-[15px] text-zinc-400">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  )
}

function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  description,
  children,
  accent = 'emerald',
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
  children?: React.ReactNode
  accent?: 'emerald' | 'violet'
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={cx(
        'glass relative w-full p-5 text-left transition-all',
        selected
          ? accent === 'violet'
            ? '!border-violet-500/50 !bg-violet-500/[0.07] shadow-glow-violet'
            : '!border-emerald-500/50 !bg-emerald-500/[0.07] shadow-glow'
          : 'hover:!border-white/[0.14]',
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl border', selected ? (accent === 'violet' ? 'border-violet-500/30 bg-violet-500/15 text-violet-300' : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300') : 'border-white/[0.06] bg-white/[0.03] text-zinc-400')}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold text-zinc-50">{title}</div>
          <div className="mt-0.5 text-sm text-zinc-400">{description}</div>
          {children}
        </div>
        <div className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full border transition', selected ? (accent === 'violet' ? 'border-violet-400 bg-violet-500 text-white' : 'border-emerald-400 bg-emerald-500 text-ink-950') : 'border-white/15')}>
          {selected && <Check size={14} strokeWidth={3} />}
        </div>
      </div>
    </motion.button>
  )
}

function LiftRow({
  lift,
  bodyweight,
  formula,
  onChange,
  onRemove,
}: {
  lift: LiftDraft
  bodyweight: number
  formula: Formula
  onChange: (p: Partial<LiftDraft>) => void
  onRemove: () => void
}) {
  const load = lift.bodyweight ? lift.weight + bodyweight : lift.weight
  const e1rm = estimate1RM(load, lift.reps, lift.rpe, formula)
  const isKey = false
  return (
    <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className={cx('glass overflow-hidden p-4 transition-opacity', !lift.include && 'opacity-50')}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange({ include: !lift.include })}
          aria-label={lift.include ? 'Excluir' : 'Incluir'}
          className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md border transition', lift.include ? 'border-emerald-400 bg-emerald-500 text-ink-950' : 'border-white/20')}
        >
          {lift.include && <Check size={14} strokeWidth={3} />}
        </button>
        {isKey ? (
          <div className="flex-1 text-[15px] font-semibold text-zinc-100">{lift.name}</div>
        ) : (
          <input className="field !py-2 flex-1" placeholder="Nombre del ejercicio" value={lift.name} onChange={(e) => onChange({ name: e.target.value })} />
        )}
        <div className="text-right">
          <div className="label !text-[10px]">1RM estimado</div>
          <motion.div key={Math.round(e1rm * 2)} initial={{ scale: 1.15, color: '#6ee7b7' }} animate={{ scale: 1, color: '#f4f4f5' }} className="tnum text-lg font-semibold">
            {e1rm > 0 ? kg(e1rm) : '—'}
          </motion.div>
        </div>
        {!isKey && (
          <button onClick={onRemove} aria-label="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-rose-300">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {lift.include && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <Field label={lift.bodyweight ? 'Lastre' : 'Peso'}>
            <Stepper compact value={lift.weight} onChange={(v) => onChange({ weight: v })} step={2.5} suffix="kg" />
          </Field>
          <Field label="Reps">
            <Stepper compact value={lift.reps} onChange={(v) => onChange({ reps: Math.round(v) })} min={1} max={30} />
          </Field>
          <Field label="RPE">
            <Stepper compact value={lift.rpe} onChange={(v) => onChange({ rpe: v })} step={0.5} min={5} max={10} />
          </Field>
          {!isKey && (
            <div className="col-span-3 flex flex-wrap items-center gap-2">
              <select className="field !w-auto !py-2 text-sm" value={lift.muscleGroup} onChange={(e) => onChange({ muscleGroup: e.target.value as MuscleGroup })}>
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-ink-900">
                    {m.label}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
                <input type="checkbox" className="accent-emerald-500" checked={lift.bodyweight} onChange={(e) => onChange({ bodyweight: e.target.checked })} /> Usa peso corporal
              </label>
            </div>
          )}
          {lift.bodyweight && <p className="col-span-3 text-xs text-zinc-500">Carga efectiva = {kg(bodyweight)} corporal + lastre = {kg(load)}</p>}
        </div>
      )}
    </motion.div>
  )
}

function Summary({ profile, exercises, routine, onIncrement }: { profile: Profile; exercises: Exercise[]; routine: Routine; onIncrement: (id: string, v: number) => void }) {
  const { state } = useStore()
  const analyses = exercises.map((ex) => analyzeExercise(ex, profile, [], state.settings, { today: profile.startDate }))
  const [sel, setSel] = useState(0)
  const a = analyses[Math.min(sel, analyses.length - 1)]
  const data = a ? a.original.map((v, w) => ({ w, v: Math.round(v * 10) / 10 })) : []
  return (
    <StepFrame eyebrow="Tu plan" title={`Listo, ${profile.name}.`} subtitle={`${routine.days.length} días · ${profile.programWeeks} semanas · ${EXPERIENCE[profile.experience].label} · ${routine.days.some((d) => d.items.some(isStraight)) ? 'Series rectas + doble progresión' : 'Top Set + Back-off'}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        {routine.days.map((d, i) => (
          <div key={d.id} className="glass !rounded-xl p-4">
            <div className="label !text-emerald-400/80">Día {i + 1}</div>
            <div className="mt-1 text-[15px] font-semibold text-zinc-50">{d.name}</div>
            <div className="text-xs text-zinc-500">{d.focus}</div>
            <div className="mt-2 text-xs text-zinc-400">
              {d.items.length} ejercicios · {d.items.reduce((a, x) => a + (isStraight(x) ? x.sets ?? 3 : 2), 0)} series{d.restAfter ? ' · después, descanso' : ''}
            </div>
          </div>
        ))}
      </div>
      {a && (
        <div className="glass mt-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label">1RM proyectado · {a.exercise.name}</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="tnum text-4xl font-semibold tracking-tight text-zinc-50">{kg(a.originalEnd)}</span>
                <Badge tone="emerald">{signedPct((a.originalEnd / a.base - 1) * 100)}</Badge>
              </div>
              <div className="mt-1 text-sm text-zinc-500">desde {kg(a.base)} hoy</div>
            </div>
            <div className="flex max-w-full gap-1.5 overflow-x-auto scrollbar-none">
              {analyses.map((x, i) => (
                <button key={x.exercise.id} onClick={() => setSel(i)} className={cx('whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition', i === sel ? 'bg-white/10 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300')}>
                  {x.exercise.name}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="onbGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="w" tickFormatter={(w) => `S${w}`} stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
                <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={2.5} fill="url(#onbGrad)" isAnimationActive animationDuration={1200} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {analyses.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="label mb-2">Incremento semanal de carga (ajustable)</div>
          {analyses.map((x) => {
            const item = findRoutineItem(routine, x.exercise.id)
            const p1 = x.plan[1]
            const proto = item ? protocolFor(p1.targetE1RM, item, state.settings, p1.deload, 1) : null
            return (
              <div key={x.exercise.id} className="glass flex flex-wrap items-center gap-4 !rounded-xl p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-100">{x.exercise.name}</div>
                  <div className="text-xs text-zinc-500">
                    {proto
                      ? proto.straight
                        ? `Semana 1: ${proto.workSets} × ${proto.top.reps[0]}–${proto.top.reps[1]} con ${kg(proto.top.weight)} · RIR ${rirLabel(proto.rir ?? [1, 2])}`
                        : `Semana 1: TS ${kg(proto.top.weight)} × ${proto.top.reps[0]}–${proto.top.reps[1]} · BS ${kg(proto.backoff?.weight ?? 0)}`
                      : `Semana 1: ${p1.sets} × ${p1.reps} @ ${kg(p1.weight)} · RPE ${p1.rpe}`}
                  </div>
                </div>
                <Stepper compact className="w-36" value={x.exercise.weeklyIncrement} step={0.25} min={0} max={20} suffix="kg/sem" onChange={(v) => onIncrement(x.exercise.id, v)} />
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">En tu primera sesión de cada día registrarás tus series de trabajo; la mejor de cada ejercicio será su referencia. Con él calculamos tu 1RM y la curva de progresión a {profile.programWeeks} semanas.</p>
      )}
    </StepFrame>
  )
}
