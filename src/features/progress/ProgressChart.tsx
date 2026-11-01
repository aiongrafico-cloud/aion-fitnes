import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ExerciseAnalysis } from '../../lib/program'
import { formatShort } from '../../lib/date'
import { kg, num } from '../../lib/format'

interface Row {
  x: number
  original?: number
  adjusted?: number
  real?: number
  date?: string
}

export const CHART_COLORS = { original: '#8b5cf6', adjusted: '#10b981', real: '#f4f4f5' }

export function ProgressChart({ analysis, height = 320, compact = false }: { analysis: ExerciseAnalysis; height?: number; compact?: boolean }) {
  const { rows, deloads, domain } = useMemo(() => {
    const rows: Row[] = []
    for (let w = 0; w <= analysis.totalWeeks; w++) {
      const adj = analysis.adjusted[w]
      rows.push({ x: w, original: round(analysis.original[w]), adjusted: adj == null ? undefined : round(adj) })
    }
    for (const p of analysis.points) rows.push({ x: p.x, real: round(p.e1rm), date: p.date })
    // La línea real arranca en la evaluación inicial.
    rows.push({ x: 0, real: round(analysis.base), date: undefined })
    rows.sort((a, b) => a.x - b.x || (a.real == null ? -1 : 1))
    const values = rows.flatMap((r) => [r.original, r.adjusted, r.real].filter((v): v is number => v != null))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = Math.max(2, (max - min) * 0.12)
    return {
      rows,
      deloads: [...analysis.deloadWeeks],
      domain: [Math.floor((min - pad) / 2.5) * 2.5, Math.ceil((max + pad) / 2.5) * 2.5] as [number, number],
    }
  }, [analysis])

  const ticks = Array.from({ length: analysis.totalWeeks + 1 }, (_, i) => i)
  const gid = `adjGrad-${analysis.exercise.id}`

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 12, right: compact ? 4 : 12, left: compact ? -6 : -4, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.adjusted} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART_COLORS.adjusted} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,.04)" vertical={false} />
          {deloads.map((w) => (
            <ReferenceArea key={w} x1={w - 1} x2={w} fill="rgba(139,92,246,.07)" stroke="none" ifOverflow="hidden" />
          ))}
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, analysis.totalWeeks]}
            ticks={compact ? ticks.filter((t) => t % 2 === 0) : ticks}
            tickFormatter={(w) => `S${w}`}
            stroke="#52525b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis domain={domain} stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} width={compact ? 44 : 50} tickFormatter={(v) => num(v)} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,.12)', strokeDasharray: '3 3' }} />
          {analysis.currentWeek > 0 && (
            <ReferenceLine
              x={analysis.currentWeek}
              stroke="rgba(255,255,255,.18)"
              strokeDasharray="2 4"
              label={compact ? undefined : { value: 'Hoy', position: 'insideTopRight', fill: '#a1a1aa', fontSize: 11 }}
            />
          )}
          <Line type="monotone" dataKey="original" name="Proyección original" stroke={CHART_COLORS.original} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls isAnimationActive={false} />
          <Area type="monotone" dataKey="adjusted" name="Proyección ajustada" stroke={CHART_COLORS.adjusted} strokeWidth={2.5} fill={`url(#${gid})`} dot={false} connectNulls isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="real"
            name="Rendimiento real"
            stroke={CHART_COLORS.real}
            strokeWidth={1.5}
            strokeOpacity={0.55}
            dot={{ r: compact ? 2.5 : 3.5, fill: '#09090b', stroke: CHART_COLORS.real, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: CHART_COLORS.adjusted, stroke: '#09090b', strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function round(v: number) {
  return Math.round(v * 10) / 10
}

interface TooltipPayload {
  dataKey?: string | number
  value?: number
  color?: string
  name?: string
  payload?: Row
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: number }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  const isSession = row?.real != null && row.date
  const title = isSession ? `Sesión · ${formatShort(row!.date!)}` : label === 0 ? 'Evaluación inicial' : `Semana ${Number(label).toFixed(label! % 1 ? 1 : 0)}`
  const labels: Record<string, string> = { original: 'Plan original', adjusted: 'Plan ajustado', real: '1RM real (estimado)' }
  return (
    <div className="glass-strong min-w-[180px] !rounded-xl px-3.5 py-3 text-xs shadow-2xl">
      <div className="mb-2 font-medium text-zinc-300">{title}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2 text-zinc-400">
              <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[p.dataKey as keyof typeof CHART_COLORS] }} />
              {labels[String(p.dataKey)]}
            </span>
            <span className="tnum font-semibold text-zinc-100">{kg(p.value as number)}</span>
          </div>
        ))}
    </div>
  )
}

export function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400">
      <span className="flex items-center gap-2">
        <svg width="18" height="4">
          <line x1="0" y1="2" x2="18" y2="2" stroke={CHART_COLORS.original} strokeWidth="2" strokeDasharray="4 3" />
        </svg>
        Proyección original
      </span>
      <span className="flex items-center gap-2">
        <span className="h-[3px] w-[18px] rounded bg-emerald-500" /> Proyección ajustada
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-zinc-100" /> Real por sesión
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm bg-violet-500/20" /> Descarga
      </span>
    </div>
  )
}
