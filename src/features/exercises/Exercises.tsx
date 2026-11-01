import { useConfirm } from '../../components/ui/confirm'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, ArchiveRestore, Dumbbell, LineChart, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Line, LineChart as RLineChart, ResponsiveContainer, YAxis } from 'recharts'
import { Badge, Button, Card, EmptyState, Field, Modal, Segmented, Stepper, cx } from '../../components/ui'
import type { Tab } from '../../components/layout/Shell'
import { useAthlete } from '../../store/AppStore'
import { MUSCLE_GROUPS, TEMPLATES, muscleLabel } from '../../lib/catalog'
import { estimate1RM } from '../../lib/oneRepMax'
import { GOALS, analyzeExercise, effectiveLoad, suggestedIncrement } from '../../lib/program'
import { programWeekOf, todayISO } from '../../lib/date'
import { uid } from '../../lib/storage'
import { kg, signedPct } from '../../lib/format'
import type { Exercise, MuscleGroup } from '../../lib/types'

export function Exercises({ go }: { go: (t: Tab, exerciseId?: string) => void }) {
  const { profile, exercises, sessions, settings, dispatch } = useAthlete()
  const [filter, setFilter] = useState<MuscleGroup | 'todos'>('todos')
  const [view, setView] = useState<'activos' | 'archivados'>('activos')
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const ask = useConfirm()

  const list = exercises.filter((e) => (view === 'activos' ? !e.archived : e.archived)).filter((e) => filter === 'todos' || e.muscleGroup === filter)
  const groups = MUSCLE_GROUPS.filter((g) => exercises.some((e) => e.muscleGroup === g.id))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label">Catálogo</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Ejercicios</h1>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={16} /> Nuevo ejercicio
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          {[{ id: 'todos' as const, label: 'Todos' }, ...groups].map((g) => (
            <button
              key={g.id}
              onClick={() => setFilter(g.id)}
              className={cx('whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition', filter === g.id ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/[0.06] text-zinc-400 hover:text-zinc-100')}
            >
              {g.label}
            </button>
          ))}
        </div>
        <Segmented layoutId="exview" className="sm:w-64" value={view} onChange={setView} options={[{ value: 'activos', label: 'Activos' }, { value: 'archivados', label: 'Archivados' }]} />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Dumbbell size={22} />} title={view === 'activos' ? 'Sin ejercicios aquí' : 'Nada archivado'} description="Crea ejercicios personalizados con su peso inicial e incremento semanal." />
        </Card>
      ) : (
        <motion.div layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {list.map((ex, i) => {
              if (ex.calibrated === false) {
                return (
                  <Card key={ex.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: i * 0.03 }} className="group flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-zinc-50">{ex.name}</h3>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge>{muscleLabel(ex.muscleGroup)}</Badge>
                          <Badge tone="amber">Sin calibrar</Badge>
                          {ex.unilateral && <Badge>Por lado</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <IconBtn label="Editar" onClick={() => setEditing(ex)}>
                          <Pencil size={15} />
                        </IconBtn>
                      </div>
                    </div>
                    <p className="mt-4 text-[13px] leading-relaxed text-zinc-500">Se calibra con el Top Set de tu primera sesión, o introduce ya una referencia con el lápiz.</p>
                  </Card>
                )
              }
              const a = analyzeExercise(ex, profile, sessions, settings)
              const spark = a.original.map((v, w) => ({ w, o: v, r: a.best.get(w) ?? null }))
              const gain = (a.currentBest / a.base - 1) * 100
              return (
                <Card key={ex.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: i * 0.03 }} className="group flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold text-zinc-50">{ex.name}</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge>{muscleLabel(ex.muscleGroup)}</Badge>
                        {ex.bodyweight && <Badge tone="violet">Peso corporal</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                      <IconBtn label="Editar" onClick={() => setEditing(ex)}>
                        <Pencil size={15} />
                      </IconBtn>
                      <IconBtn label={ex.archived ? 'Restaurar' : 'Archivar'} onClick={() => dispatch({ type: 'updateExercise', id: ex.id, patch: { archived: !ex.archived } })}>
                        {ex.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                      </IconBtn>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-zinc-500">1RM actual</div>
                      <div className="tnum mt-0.5 text-[15px] font-semibold text-zinc-100">{kg(a.currentBest)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Progreso</div>
                      <div className={cx('tnum mt-0.5 text-[15px] font-semibold', gain > 0 ? 'text-emerald-400' : 'text-zinc-300')}>{signedPct(gain)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Incremento</div>
                      <div className="tnum mt-0.5 text-[15px] font-semibold text-zinc-100">+{kg(ex.weeklyIncrement)}/s</div>
                    </div>
                  </div>
                  <div className="mt-3 h-14">
                    <ResponsiveContainer width="100%" height="100%">
                      <RLineChart data={spark} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
                        <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                        <Line dataKey="o" stroke="#8b5cf6" strokeDasharray="3 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Line dataKey="r" stroke="#10b981" strokeWidth={2} dot={{ r: 2, fill: '#10b981' }} connectNulls isAnimationActive={false} />
                      </RLineChart>
                    </ResponsiveContainer>
                  </div>
                  <button onClick={() => go('progreso', ex.id)} className="mt-3 flex items-center gap-1.5 self-start text-xs font-medium text-zinc-500 transition hover:text-emerald-300">
                    <LineChart size={13} /> Ver curva completa
                  </button>
                </Card>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <ExerciseForm
        key={editing === 'new' ? 'new' : editing?.id ?? 'none'}
        open={editing != null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSave={(ex) => {
          if (editing === 'new') dispatch({ type: 'addExercise', exercise: ex })
          else if (editing) dispatch({ type: 'updateExercise', id: editing.id, patch: ex })
          setEditing(null)
        }}
        onDelete={
          editing && editing !== 'new'
            ? async () => {
                if (await ask({ title: 'Eliminar ejercicio', message: `Se eliminará "${editing.name}" y todas sus series registradas. Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar', danger: true })) {
                  dispatch({ type: 'deleteExercise', id: editing.id })
                  setEditing(null)
                }
              }
            : undefined
        }
      />
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100">
      {children}
    </button>
  )
}

function ExerciseForm({ open, initial, onClose, onSave, onDelete }: { open: boolean; initial: Exercise | null; onClose: () => void; onSave: (ex: Exercise) => void; onDelete?: () => void }) {
  const { profile, settings, exercises } = useAthlete()
  const goal = GOALS[profile.goal]
  const [name, setName] = useState(initial?.name ?? '')
  const [group, setGroup] = useState<MuscleGroup>(initial?.muscleGroup ?? 'pecho')
  const [bw, setBw] = useState(initial?.bodyweight ?? false)
  const [weight, setWeight] = useState(initial?.baseline.weight ?? 20)
  const [reps, setReps] = useState(initial?.baseline.reps ?? goal.reps)
  const [rpe, setRpe] = useState(initial?.baseline.rpe ?? goal.rpe)
  const [inc, setInc] = useState<number | null>(initial?.weeklyIncrement ?? null)

  const load = effectiveLoad({ bodyweight: bw }, weight, profile.bodyweight)
  const e1rm = estimate1RM(load, reps, rpe, settings.formula)
  const suggested = useMemo(() => suggestedIncrement(e1rm, profile, settings), [e1rm, profile, settings])
  const increment = inc ?? suggested
  const templates = TEMPLATES.filter((t) => !exercises.some((e) => e.name.toLowerCase() === t.name.toLowerCase()))

  const save = () => {
    if (!name.trim()) return
    const currentWeek = Math.max(1, Math.min(programWeekOf(profile.startDate, todayISO()), profile.programWeeks))
    onSave({
      id: initial?.id ?? uid(),
      name: name.trim(),
      muscleGroup: group,
      bodyweight: bw,
      baseline: { weight, reps, rpe },
      weeklyIncrement: increment,
      startWeek: initial?.startWeek ?? currentWeek - 1,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      archived: initial?.archived,
      unilateral: initial?.unilateral,
      calibrated: initial?.calibrated === false ? weight > 0 : true,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar ejercicio' : 'Nuevo ejercicio'} wide>
      {!initial && templates.length > 0 && (
        <div className="mb-5">
          <div className="label mb-2 flex items-center gap-1.5">
            <Sparkles size={12} /> Plantillas rápidas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {templates.slice(0, 10).map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  setName(t.name)
                  setGroup(t.muscleGroup)
                  setBw(t.bodyweight)
                  setWeight(t.sample.weight)
                  setReps(goal.reps)
                  setInc(null)
                }}
                className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-xs text-zinc-300 transition hover:border-emerald-500/40 hover:text-emerald-200"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Press inclinado" />
        </Field>
        <Field label="Grupo muscular">
          <select className="field" value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup)}>
            {MUSCLE_GROUPS.map((m) => (
              <option key={m.id} value={m.id} className="bg-ink-900">
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de carga">
          <Segmented layoutId="bwseg" className="h-[46px] items-stretch" value={bw ? 'bw' : 'ext'} onChange={(v) => setBw(v === 'bw')} options={[{ value: 'ext', label: 'Externa' }, { value: 'bw', label: 'Peso corporal' }]} />
        </Field>
        <Field label={bw ? 'Lastre inicial' : 'Peso inicial'} hint={initial ? 'Línea base del ciclo' : 'Una serie exigente reciente'}>
          <Stepper value={weight} onChange={setWeight} step={settings.rounding} suffix="kg" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reps">
            <Stepper value={reps} onChange={(v) => setReps(Math.round(v))} min={1} max={30} />
          </Field>
          <Field label="RPE">
            <Stepper value={rpe} onChange={setRpe} step={0.5} min={5} max={10} />
          </Field>
        </div>
        <Field
          label="Incremento deseado por semana"
          className="sm:col-span-2"
          hint={
            <span>
              Sugerido para tu perfil: <button type="button" className="font-medium text-emerald-400 hover:underline" onClick={() => setInc(null)}>{kg(suggested)}</button>. Se aplica con rendimientos decrecientes y descargas.
            </span>
          }
        >
          <Stepper value={increment} onChange={setInc} step={0.25} min={0} max={20} suffix="kg/sem" />
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-4 py-3">
        <span className="text-sm text-zinc-400">1RM estimado</span>
        <span className="tnum text-xl font-semibold text-emerald-300">{e1rm > 0 ? kg(e1rm) : '—'}</span>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {onDelete ? (
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={15} /> Eliminar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1 sm:flex-none" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={save} disabled={!name.trim() || reps < 1}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
