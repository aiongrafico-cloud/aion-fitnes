import { AlertTriangle, CheckCircle2, Info, MessageSquareQuote, Sparkles, XCircle } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Card, SectionTitle, cx } from '../../components/ui'
import { useAthlete } from '../../store/AppStore'
import { weeklyReview, type Tone } from '../../lib/coach'
import { formatShort, todayISO } from '../../lib/date'
import { tonnage } from '../../lib/format'
import { say } from '../../lib/voice'

const ICON: Record<Tone, ReactNode> = {
  good: <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />,
  warn: <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />,
  bad: <XCircle size={15} className="mt-0.5 shrink-0 text-rose-400" />,
  info: <Info size={15} className="mt-0.5 shrink-0 text-zinc-400" />,
}

/** Revisión semanal del entrenador: qué fue bien, qué ajustar y el plan para la semana siguiente. */
export function CoachReview({ week }: { week: number }) {
  const athlete = useAthlete()
  const today = todayISO()
  const r = useMemo(() => weeklyReview(athlete, today, week), [athlete, today, week])
  const [open, setOpen] = useState(false)
  const ring = r.score >= 85 ? '#10b981' : r.score >= 65 ? '#f59e0b' : '#f43f5e'
  const C = 2 * Math.PI * 22

  return (
    <Card className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
      <SectionTitle
        title="Tu entrenador · revisión semanal"
        subtitle={`${formatShort(r.from)} – ${formatShort(r.to)}`}
        action={
          <button
            onClick={() => void say(`${r.headline} ${r.points.map((p) => p.text).join(' ')} Para la próxima semana: ${r.next.join(' ')}`)}
            className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
          >
            Escuchar
          </button>
        }
      />
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90">
            <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="5" />
            <circle cx="26" cy="26" r="22" fill="none" stroke={ring} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - r.score / 100)} />
          </svg>
          <span className="tnum absolute inset-0 grid place-items-center text-sm font-semibold text-zinc-50">{r.score}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-start gap-1.5 text-[15px] font-medium leading-snug text-zinc-100">
            <MessageSquareQuote size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            {r.headline}
          </div>
          <div className="tnum mt-1 text-xs text-zinc-500">
            {r.sessions}/{r.planned} sesiones · {r.workSets} series · {tonnage(r.tonnage)}
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {(open ? r.points : r.points.slice(0, 3)).map((p) => (
          <li key={p.text} className="flex gap-2 text-[13px] leading-snug text-zinc-300">
            {ICON[p.tone]}
            {p.text}
          </li>
        ))}
      </ul>

      {(open || r.points.length <= 3) && r.next.length > 0 && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5">
          <div className="label flex items-center gap-1.5 !text-emerald-300/90">
            <Sparkles size={12} /> Para la próxima semana
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[13px] leading-snug text-zinc-200">
            {r.next.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
        </div>
      )}
      {r.points.length > 3 && (
        <button onClick={() => setOpen((v) => !v)} className={cx('mt-3 text-xs font-medium text-zinc-500 hover:text-zinc-200')}>
          {open ? 'Ver menos' : 'Ver revisión completa y plan'}
        </button>
      )}
    </Card>
  )
}
