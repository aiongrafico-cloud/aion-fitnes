import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Pencil, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Field, Modal, Segmented, Stepper, cx } from '../../components/ui'
import { useConfirm } from '../../components/ui/confirm'
import type { Tab } from '../../components/layout/Shell'
import { useAthlete } from '../../store/AppStore'
import { isStraight, nextDayIndex, PROTOCOL_STEPS, protocolForDate, rirLabel } from '../../lib/routine'
import { muscleLabel } from '../../lib/catalog'
import { uid } from '../../lib/storage'
import { kg, restLabel } from '../../lib/format'
import type { RoutineItem } from '../../lib/types'

export function RoutineView({ go, onTrainDay }: { go: (t: Tab) => void; onTrainDay: (dayId: string) => void }) {
  const { routine, exercises, profile, sessions, settings, draft, dispatch } = useAthlete()
  const ask = useConfirm()
  const suggested = routine && routine.days.length ? nextDayIndex(routine, sessions) : 0
  const [dayIdx, setDayIdx] = useState(suggested)
  const [editing, setEditing] = useState<RoutineItem | null>(null)
  const [adding, setAdding] = useState(false)

  if (!routine || routine.days.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<RotateCcw size={22} />}
          title="Sin rutina"
          description="Carga la rutina predeterminada Push / Pull / Pierna de 5 días."
          action={<Button onClick={() => dispatch({ type: 'resetRoutine' })}>Cargar rutina predeterminada</Button>}
        />
      </Card>
    )
  }

  const day = routine.days[Math.min(dayIdx, routine.days.length - 1)]
  const straightRoutine = routine.days.some((d) => d.items.some(isStraight))
  const steps = straightRoutine ? STRAIGHT_STEPS : PROTOCOL_STEPS
  const available = exercises.filter((e) => !e.archived && !day.items.some((i) => i.exerciseId === e.id))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label">Rutina predeterminada</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{routine.name}</h1>
        </div>
        <Button
          variant="ghost"
          onClick={async () =>
            (await ask({ title: 'Restaurar rutina', message: 'La rutina vuelve a la versión predeterminada. Tus ejercicios, calibraciones y sesiones se conservan.', confirmLabel: 'Restaurar' })) &&
            dispatch({ type: 'resetRoutine' })
          }
        >
          <RotateCcw size={15} /> Restaurar predeterminada
        </Button>
      </div>

      {/* Protocolo */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative">
          <div className="label mb-4">Protocolo de trabajo</div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((p, i) => (
              <li key={p.key} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="tnum grid h-5 w-5 place-items-center rounded-md bg-white/[0.06] text-[11px] font-semibold text-zinc-400">{i + 1}</span>
                  <span className={cx('text-sm font-semibold', p.key === 'Top Set' || p.key === 'Series de trabajo' ? 'text-emerald-300' : p.key === 'Back-off' || p.key === 'Doble progresión' ? 'text-violet-300' : p.key === '+LP' ? 'text-emerald-200' : 'text-zinc-100')}>{p.key}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{p.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-zinc-500">
            {straightRoutine ? (
              <>
                La app calcula el peso de tus series para el centro del rango con el RIR indicado. Cuando completas todas las series en el tope del rango, sube un escalón (≈2,5 %); si la primera serie se queda corta, baja. En las semanas de descarga: una serie menos y RIR 3.
                <span className="mt-2 block text-zinc-400">Semana tipo: {routine.days.map((d) => d.name + (d.restAfter ? ' · Descanso' : '')).join(' · ')}</span>
              </>
            ) : (
              <>
            La app prescribe el Top Set al centro del rango con RIR ≈ 0,5 y el Back-off un 12,5 % más ligero. Si superas el rango, el peso sube; si te quedas corto, la curva se recalcula. En las semanas de descarga: Top Set a RIR 3 y sin Back-off.
              </>
            )}
          </p>
        </div>
      </Card>

      {/* Días */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        {routine.days.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setDayIdx(i)}
            className={cx(
              'shrink-0 rounded-xl border px-4 py-2.5 text-left transition',
              i === dayIdx ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
            )}
          >
            <div className={cx('label !text-[10px]', i === dayIdx && '!text-emerald-400/80')}>
              Día {i + 1}
              {i === suggested && ' · siguiente'}
            </div>
            <div className={cx('mt-0.5 text-sm font-semibold', i === dayIdx ? 'text-emerald-100' : 'text-zinc-200')}>{d.name}</div>
            {d.restAfter && <div className="mt-0.5 text-[10px] text-zinc-500">luego descanso</div>}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">{day.name}</h2>
          <p className="text-sm text-zinc-500">{day.focus}</p>
        </div>
        <Button onClick={() => (draft ? go('entrenar') : onTrainDay(day.id))}>
          <Play size={15} fill="currentColor" /> {draft ? 'Continuar sesión en curso' : `Entrenar ${day.name}`}
        </Button>
      </div>

      <div className="space-y-3">
        {day.items.map((it, i) => {
          const ex = exercises.find((e) => e.id === it.exerciseId)
          if (!ex) return null
          const p = protocolForDate(ex, it, profile, sessions, settings)
          return (
            <motion.div key={it.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass group p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="tnum mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-xs font-semibold text-zinc-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-[15px] font-semibold text-zinc-50">{ex.name}</h3>
                    <Badge>{muscleLabel(ex.muscleGroup)}</Badge>
                    {it.partials && <Badge tone="emerald">+LP</Badge>}
                    {ex.unilateral && <Badge>Por lado</Badge>}
                    {p.calibrate && <Badge tone="amber">Sin calibrar</Badge>}
                    {p.deload && <Badge tone="violet">Descarga</Badge>}
                  </div>
                  {isStraight(it) ? (
                  <div className="tnum mt-2 grid grid-cols-3 gap-2 text-xs sm:max-w-md">
                    <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-2.5 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">Series</div>
                      <div className="mt-0.5 text-zinc-200">
                        {p.workSets} × {it.top[0]}–{it.top[1]}
                      </div>
                      <div className="font-semibold text-zinc-50">{p.calibrate ? 'Calibrar' : kg(p.top.weight)}</div>
                    </div>
                    <div className="rounded-lg border border-violet-500/15 bg-violet-500/[0.05] px-2.5 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/80">RIR</div>
                      <div className="mt-0.5 text-zinc-200">{rirLabel(p.rir ?? [1, 2])}</div>
                      <div className="text-zinc-500">{p.deload ? 'Descarga' : (p.rir ?? [1, 2])[0] === 0 ? 'Cerca del fallo' : 'En reserva'}</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Descanso</div>
                      <div className="mt-0.5 text-zinc-200">{restLabel(it.restSeconds)}</div>
                      <div className="text-zinc-500">{p.warmups.length} aprox.</div>
                    </div>
                  </div>
                  ) : (
                  <div className="tnum mt-2 grid grid-cols-3 gap-2 text-xs sm:max-w-md">
                    <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-2.5 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">Top Set</div>
                      <div className="mt-0.5 text-zinc-200">
                        {it.top[0]}–{it.top[1]} reps
                      </div>
                      <div className="font-semibold text-zinc-50">{p.calibrate ? 'Calibrar' : kg(p.top.weight)}</div>
                    </div>
                    <div className="rounded-lg border border-violet-500/15 bg-violet-500/[0.05] px-2.5 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/80">Back-off</div>
                      <div className="mt-0.5 text-zinc-200">
                        {it.backoff[0]}–{it.backoff[1]} reps
                      </div>
                      <div className="font-semibold text-zinc-50">{p.calibrate ? '−10–15 %' : p.backoff ? kg(p.backoff.weight) : 'Descarga'}</div>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Descanso</div>
                      <div className="mt-0.5 text-zinc-200">{restLabel(it.restSeconds)}</div>
                      <div className="text-zinc-500">{p.warmups.length} aprox.</div>
                    </div>
                  </div>
                  )}
                  {it.notes && <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">{it.notes}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                  <IconBtn label="Editar" onClick={() => setEditing(it)}>
                    <Pencil size={14} />
                  </IconBtn>
                  <IconBtn label="Subir" onClick={() => dispatch({ type: 'moveRoutineItem', dayId: day.id, itemId: it.id, dir: -1 })}>
                    <ArrowUp size={14} />
                  </IconBtn>
                  <IconBtn label="Bajar" onClick={() => dispatch({ type: 'moveRoutineItem', dayId: day.id, itemId: it.id, dir: 1 })}>
                    <ArrowDown size={14} />
                  </IconBtn>
                  <IconBtn
                    label="Quitar del día"
                    onClick={async () =>
                      (await ask({ title: 'Quitar ejercicio', message: `"${ex.name}" se quita de ${day.name}. El ejercicio y su historial siguen en el catálogo.`, confirmLabel: 'Quitar', danger: true })) &&
                      dispatch({ type: 'removeRoutineItem', dayId: day.id, itemId: it.id })
                    }
                  >
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>
            </motion.div>
          )
        })}
        <Button variant="secondary" className="w-full border-dashed" onClick={() => setAdding(true)} disabled={available.length === 0}>
          <Plus size={16} /> Añadir ejercicio del catálogo a {day.name}
        </Button>
      </div>

      <ItemForm
        key={editing?.id ?? 'none'}
        item={editing}
        name={exercises.find((e) => e.id === editing?.exerciseId)?.name ?? ''}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (editing) dispatch({ type: 'updateRoutineItem', dayId: day.id, itemId: editing.id, patch })
          setEditing(null)
        }}
      />

      <Modal open={adding} onClose={() => setAdding(false)} title={`Añadir a ${day.name}`}>
        <div className="space-y-2">
          {available.map((ex) => (
            <button
              key={ex.id}
              onClick={() => {
                dispatch({ type: 'addRoutineItem', dayId: day.id, item: straightRoutine
                    ? { id: uid(), exerciseId: ex.id, scheme: 'straight', sets: 3, rir: [1, 2], top: [8, 10], backoff: [8, 10], restSeconds: 120, partials: false, notes: '' }
                    : { id: uid(), exerciseId: ex.id, top: [8, 10], backoff: [10, 12], restSeconds: 120, partials: false, notes: '' } })
                setAdding(false)
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/[0.05]"
            >
              <span className="truncate text-sm font-medium text-zinc-100">{ex.name}</span>
              <span className="text-xs text-zinc-500">{muscleLabel(ex.muscleGroup)}</span>
            </button>
          ))}
          <p className="pt-2 text-xs text-zinc-500">¿No está? Créalo primero en la pestaña Ejercicios.</p>
        </div>
      </Modal>
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100">
      {children}
    </button>
  )
}

function ItemForm({ item, name, onClose, onSave }: { item: RoutineItem | null; name: string; onClose: () => void; onSave: (patch: Partial<RoutineItem>) => void }) {
  const straight = item ? isStraight(item) : false
  const [top, setTop] = useState<[number, number]>(item?.top ?? [8, 10])
  const [bo, setBo] = useState<[number, number]>(item?.backoff ?? [10, 12])
  const [sets, setSets] = useState(item?.sets ?? 3)
  const [rir, setRir] = useState<[number, number]>(item?.rir ?? [1, 2])
  const [rest, setRest] = useState(item?.restSeconds ?? 120)
  const [lp, setLp] = useState(item?.partials ?? false)
  const [notes, setNotes] = useState(item?.notes ?? '')
  const valid = top[0] <= top[1] && (straight ? rir[0] <= rir[1] : bo[0] <= bo[1])
  return (
    <Modal open={!!item} onClose={onClose} title={name || 'Editar ejercicio'} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        {straight ? (
          <>
            <Field label="Series de trabajo">
              <Stepper value={sets} min={1} max={8} onChange={(v) => setSets(Math.round(v))} />
            </Field>
            <Field label="Reps (mín – máx)">
              <div className="grid grid-cols-2 gap-2">
                <Stepper compact value={top[0]} min={1} max={30} onChange={(v) => setTop([Math.round(v), top[1]])} />
                <Stepper compact value={top[1]} min={1} max={30} onChange={(v) => setTop([top[0], Math.round(v)])} />
              </div>
            </Field>
            <Field label="RIR (mín – máx)" hint="Repeticiones en reserva: 0 = al fallo">
              <div className="grid grid-cols-2 gap-2">
                <Stepper compact value={rir[0]} min={0} max={5} onChange={(v) => setRir([Math.round(v), rir[1]])} />
                <Stepper compact value={rir[1]} min={0} max={5} onChange={(v) => setRir([rir[0], Math.round(v)])} />
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label="Top Set · reps (mín – máx)">
              <div className="grid grid-cols-2 gap-2">
                <Stepper compact value={top[0]} min={1} max={30} onChange={(v) => setTop([Math.round(v), top[1]])} />
                <Stepper compact value={top[1]} min={1} max={30} onChange={(v) => setTop([top[0], Math.round(v)])} />
              </div>
            </Field>
            <Field label="Back-off · reps (mín – máx)">
              <div className="grid grid-cols-2 gap-2">
                <Stepper compact value={bo[0]} min={1} max={40} onChange={(v) => setBo([Math.round(v), bo[1]])} />
                <Stepper compact value={bo[1]} min={1} max={40} onChange={(v) => setBo([bo[0], Math.round(v)])} />
              </div>
            </Field>
          </>
        )}
        <Field label="Descanso">
          <Stepper value={rest} step={15} min={30} max={600} suffix="s" onChange={(v) => setRest(Math.round(v))} />
        </Field>
        {!straight && (
          <Field label="Parciales [+LP] en el Back-off">
            <Segmented layoutId="lpseg" className="h-12 items-stretch" value={lp ? 'si' : 'no'} onChange={(v) => setLp(v === 'si')} options={[{ value: 'no', label: 'No' }, { value: 'si', label: 'Sí, 3–5' }]} />
          </Field>
        )}
        <Field label="Ejecución" className="sm:col-span-2">
          <textarea className="field min-h-[96px] resize-y leading-relaxed" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Claves técnicas: ángulo, tempo, pausas…" />
        </Field>
      </div>
      {!valid && <p className="mt-3 text-sm text-amber-300">El mínimo de cada rango no puede ser mayor que el máximo.</p>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!valid}
          onClick={() => onSave(straight ? { top, backoff: top, sets, rir, restSeconds: rest, notes: notes.trim() } : { top, backoff: bo, restSeconds: rest, partials: lp, notes: notes.trim() })}
        >
          Guardar
        </Button>
      </div>
    </Modal>
  )
}

const STRAIGHT_STEPS = [
  { key: 'Calentamiento', text: '1–3 series de aproximación progresivas antes de los ejercicios pesados; 1 en los de muchas repeticiones.' },
  { key: 'Series de trabajo', text: 'Todas con el mismo peso, dentro del rango de reps y dejando el RIR indicado en reserva.' },
  { key: 'Descanso', text: 'Respeta el descanso indicado entre series para rendir igual en todas.' },
  { key: 'Doble progresión', text: 'Cuando todas las series llegan al tope del rango, sube el peso y vuelve a empezar desde abajo.' },
]
