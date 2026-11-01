import { ArrowDownRight, ArrowUpRight, Minus, Ruler, Save, Scale, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, EmptyState, Field, SectionTitle, cx } from '../../components/ui'
import { useConfirm } from '../../components/ui/confirm'
import { useAthlete } from '../../store/AppStore'
import { BODY_METRICS, metricChange, metricSeries, sortBody, trailingAverage, type BodyMetric } from '../../lib/body'
import { daysBetween, formatShort, todayISO } from '../../lib/date'
import { uid } from '../../lib/storage'
import { num } from '../../lib/format'
import type { BodyEntry } from '../../lib/types'

type Draft = Partial<Record<BodyMetric, string>>

function parseNum(v: string | undefined): number | undefined {
  if (v == null || v.trim() === '') return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function BodyView() {
  const { body = [], profile, dispatch } = useAthlete()
  const ask = useConfirm()
  const entries = useMemo(() => sortBody(body), [body])
  const [date, setDate] = useState(todayISO())
  const existing = entries.find((e) => e.date === date)
  const [draft, setDraft] = useState<Draft>(() => toDraft(existing))
  const [metric, setMetric] = useState<BodyMetric>('weight')
  const [saved, setSaved] = useState(false)

  const changeDate = (d: string) => {
    setDate(d)
    setDraft(toDraft(entries.find((e) => e.date === d)))
    setSaved(false)
  }

  const save = () => {
    const entry: BodyEntry = { id: existing?.id ?? uid(), date }
    let any = false
    for (const m of BODY_METRICS) {
      const v = parseNum(draft[m.key])
      if (v != null) {
        entry[m.key] = Math.min(m.max * 1.5, v)
        any = true
      }
    }
    if (!any) return
    dispatch({ type: 'saveBodyEntry', entry })
    setSaved(true)
  }

  const weight = metricChange(entries, 'weight')
  const waist = metricChange(entries, 'waist')
  const bf = metricChange(entries, 'bodyFat')
  const available = BODY_METRICS.filter((m) => metricSeries(entries, m.key).length > 0)
  const current = available.some((m) => m.key === metric) ? metric : 'weight'
  const meta = BODY_METRICS.find((m) => m.key === current)!

  const chart = useMemo(() => {
    const s = metricSeries(entries, current)
    const avg = trailingAverage(s, 7)
    return s.map((p, i) => ({ x: daysBetween(s[0].date, p.date), date: p.date, value: p.value, avg: Math.round(avg[i] * 10) / 10 }))
  }, [entries, current])

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Composición corporal</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Cuerpo</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Peso actual" value={weight ? `${num(weight.latest.value)} kg` : `${num(profile.bodyweight)} kg`} sub={weight ? formatShort(weight.latest.date) : 'Del perfil'} />
        <Stat label="Cambio ~30 días" value={weight?.vs30 != null ? signed(weight.vs30, 'kg') : '—'} delta={weight?.vs30 ?? null} sub={weight ? `Total ${signed(weight.total, 'kg')}` : 'Sin datos'} />
        <Stat
          label="Ritmo semanal"
          value={weight?.weeklyRate != null ? signed(weight.weeklyRate, 'kg') : '—'}
          delta={weight?.weeklyRate ?? null}
          sub={weight?.weeklyRate != null ? `${signed((weight.weeklyRate / weight.latest.value) * 100, '%')} del peso / sem.` : '3+ pesajes en 4 semanas'}
        />
        <Stat
          label={waist ? 'Cintura' : bf ? 'Grasa corporal' : 'Cintura'}
          value={waist ? `${num(waist.latest.value)} cm` : bf ? `${num(bf.latest.value)} %` : '—'}
          delta={waist ? waist.vs30 : bf ? bf.vs30 : null}
          sub={waist ? (waist.vs30 != null ? `${signed(waist.vs30, 'cm')} en ~30 días` : formatShort(waist.latest.date)) : bf ? (bf.vs30 != null ? `${signed(bf.vs30, '%')} en ~30 días` : formatShort(bf.latest.date)) : 'Añade medidas'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <Card className="min-w-0 lg:col-span-3">
          <SectionTitle title={`Evolución · ${meta.label}`} subtitle={current === 'weight' ? 'Pesajes y media de 7 días (suaviza la retención de líquidos)' : `Mediciones en ${meta.unit}`} />
          {available.length > 1 && (
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 scrollbar-none">
              {available.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={cx('whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium transition', m.key === current ? 'border-white/10 bg-white/[0.08] text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-300')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          {chart.length < 2 ? (
            <EmptyState icon={<Scale size={22} />} title="Aún no hay curva" description="Registra al menos dos mediciones en días distintos para ver tu evolución. Pésate en ayunas, a la misma hora." />
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,.04)" vertical={false} />
                  <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(x) => formatShort(chart.find((c) => c.x === x)?.date ?? chart[0].date)} ticks={pickTicks(chart.map((c) => c.x))} stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(v)} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,.12)', strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload as (typeof chart)[number] | undefined
                      if (!active || !row) return null
                      return (
                        <div className="glass-strong !rounded-xl px-3.5 py-3 text-xs shadow-2xl">
                          <div className="mb-1.5 font-medium text-zinc-300">{formatShort(row.date)}</div>
                          <div className="tnum font-semibold text-zinc-50">
                            {num(row.value)} {meta.unit}
                          </div>
                          {current === 'weight' && (
                            <div className="tnum mt-0.5 text-emerald-300">
                              Media 7 días {num(row.avg)} {meta.unit}
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#f4f4f5" strokeOpacity={current === 'weight' ? 0.35 : 0.8} strokeWidth={1.5} dot={{ r: 3, fill: '#09090b', stroke: '#f4f4f5', strokeWidth: 1.5 }} isAnimationActive={false} />
                  {current === 'weight' && <Line type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2.5} dot={false} isAnimationActive={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <SectionTitle title={existing ? 'Editar registro' : 'Nuevo registro'} subtitle="Solo el peso es necesario; las medidas, cuando quieras" />
          <div className="space-y-4">
            <Field label="Fecha">
              <input type="date" className="field" value={date} max={todayISO()} onChange={(e) => e.target.value && changeDate(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {BODY_METRICS.map((m) => {
                const last = metricSeries(entries.filter((e) => e.date < date), m.key).pop()
                return (
                  <Field key={m.key} label={`${m.label} (${m.unit})`} className={m.key === 'weight' ? 'col-span-2' : undefined}>
                    <input
                      className="field tnum"
                      inputMode="decimal"
                      placeholder={last ? num(last.value) : m.hint ?? ''}
                      value={draft[m.key] ?? ''}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, [m.key]: e.target.value }))
                        setSaved(false)
                      }}
                    />
                  </Field>
                )
              })}
            </div>
            <Button className="w-full" onClick={save} disabled={!BODY_METRICS.some((m) => parseNum(draft[m.key]) != null)}>
              <Save size={15} /> {saved ? 'Guardado' : existing ? 'Actualizar registro' : 'Guardar registro'}
            </Button>
            <p className="text-xs leading-relaxed text-zinc-500">El último peso registrado actualiza tu perfil, así los ejercicios con peso corporal usan tu carga real.</p>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Registros" subtitle={`${entries.length} ${entries.length === 1 ? 'medición' : 'mediciones'}`} />
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Sin registros todavía.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left">
                  {['Fecha', ...BODY_METRICS.map((m) => `${m.label.split(' ')[0]} (${m.unit})`), ''].map((h) => (
                    <th key={h} className="label border-b border-white/[0.05] pb-3 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((e, i, arr) => {
                  const prev = arr[i + 1]
                  return (
                    <tr key={e.id} className="border-b border-white/[0.03] last:border-0">
                      <td className="py-2.5 pr-3">
                        <button onClick={() => changeDate(e.date)} className="font-medium text-zinc-200 hover:text-emerald-300">
                          {formatShort(e.date)}
                        </button>
                      </td>
                      {BODY_METRICS.map((m) => (
                        <td key={m.key} className="tnum py-2.5 pr-3 text-zinc-300">
                          {e[m.key] != null ? (
                            <span className="flex items-center gap-1">
                              {num(e[m.key] as number)}
                              {m.key === 'weight' && prev?.weight != null && e.weight !== prev.weight && (
                                <span className={cx('text-[10px]', (e.weight as number) < prev.weight ? 'text-sky-300' : 'text-amber-300')}>{signed((e.weight as number) - prev.weight, '')}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2.5 text-right">
                        <button
                          aria-label="Eliminar registro"
                          onClick={async () => (await ask({ title: 'Eliminar registro', message: `Se eliminará la medición del ${formatShort(e.date)}.`, confirmLabel: 'Eliminar', danger: true })) && dispatch({ type: 'deleteBodyEntry', id: e.id })}
                          className="grid h-8 w-8 place-items-center rounded-lg text-zinc-600 transition hover:bg-white/5 hover:text-rose-300"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex gap-2 text-xs text-zinc-500">
          <Ruler size={14} className="mt-px shrink-0" />
          <span>
            Mide siempre en las mismas condiciones. <Badge className="!py-0">Consejo</Badge> En volumen, un ritmo de +0,25–0,5 % del peso por semana minimiza la ganancia de grasa.
          </span>
        </div>
      </Card>
    </div>
  )
}

function toDraft(e: BodyEntry | undefined): Draft {
  const d: Draft = {}
  if (!e) return d
  for (const m of BODY_METRICS) if (e[m.key] != null) d[m.key] = String(e[m.key]).replace('.', ',')
  return d
}

function signed(v: number, unit: string): string {
  const s = num(Math.abs(v))
  const sign = Math.abs(v) < 0.05 ? '±' : v > 0 ? '+' : '−'
  return `${sign}${s}${unit ? (unit === '%' ? ' %' : ` ${unit}`) : ''}`
}

function pickTicks(xs: number[]): number[] {
  if (xs.length <= 5) return xs
  const step = (xs.length - 1) / 4
  return [0, 1, 2, 3, 4].map((i) => xs[Math.round(i * step)])
}

function Stat({ label, value, sub, delta }: { label: string; value: string; sub: string; delta?: number | null }) {
  const Icon = delta == null || Math.abs(delta) < 0.05 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <Card className="!p-4">
      <div className="label">{label}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="tnum text-2xl font-semibold tracking-tight text-zinc-50">{value}</span>
        {delta != null && <Icon size={16} className="text-zinc-500" />}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
    </Card>
  )
}
