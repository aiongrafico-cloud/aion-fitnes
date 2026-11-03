import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../ui'
import { FLOOR, SEG, cycleSeconds, dir, sample, solve, type Motion, type Pose, type Pt } from '../../lib/motion'

const C = {
  body: '#e4e4e7',
  back: '#71717a',
  equip: '#3f3f46',
  equipLine: '#52525b',
  cable: '#a1a1aa',
  load: '#8b5cf6',
  accent: '#10b981',
}

const line = (a: Pt, b: Pt) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] })

/** Figura animada que muestra la técnica de un ejercicio con su tempo. */
export function ExerciseAnimation({ motion, className, compact = false }: { motion: Motion; className?: string; compact?: boolean }) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      acc += dt
      // ~30 fps es suficiente y ahorra batería.
      if (acc >= 1 / 30) {
        if (document.hidden) {
          acc = 0
        } else {
          const step = Math.min(acc, 0.25)
          setTime((t) => t + step)
          acc = 0
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const { pose, phase, progress } = useMemo(() => sample(motion, time), [motion, time])
  const total = cycleSeconds(motion)
  const cycleProgress = (time % total) / total

  return (
    <div ref={ref} className={cx('relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent', className)}>
      <svg viewBox="0 0 160 118" className="block w-full" role="img" aria-label={`Animación: ${motion.label}`}>
        <defs>
          <radialGradient id="aion-floor" cx="50%" cy="0%" r="60%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y={FLOOR} width="160" height="8" fill="url(#aion-floor)" />
        <line x1="6" y1={FLOOR} x2="154" y2={FLOOR} stroke="rgba(255,255,255,.08)" strokeWidth="0.8" />
        {motion.view === 'front' ? <FrontFigure motion={motion} pose={pose} /> : <SideFigure motion={motion} pose={pose} />}
      </svg>

      <div className={cx('flex items-center gap-2 border-t border-white/[0.05] px-3', compact ? 'py-1.5' : 'py-2')}>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className={cx('truncate font-medium', phase === 0 || phase === 2 ? 'text-emerald-300' : 'text-zinc-400')}>{motion.phases[phase]}</span>
            <span className="tnum shrink-0 text-zinc-600">{motion.view === 'front' ? 'vista frontal' : 'vista lateral'}</span>
          </div>
          <div className="mt-1 flex h-1 gap-0.5 overflow-hidden rounded-full">
            {motion.tempo.map((d, i) => (
              <div key={i} className="relative h-full overflow-hidden rounded-full bg-white/[0.06]" style={{ flex: d || 0.0001 }}>
                <div className={cx('absolute inset-y-0 left-0', i % 2 === 0 ? 'bg-emerald-500' : 'bg-violet-400')} style={{ width: `${(i < phase ? 1 : i === phase ? progress : 0) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">{Math.round(cycleProgress * 100)}%</span>
    </div>
  )
}

function Load({ at, kind }: { at: Pt; kind: Motion['load'] }) {
  if (kind === 'bar') return <circle cx={at[0]} cy={at[1]} r={6.5} fill="rgba(139,92,246,.18)" stroke={C.load} strokeWidth={1.6} />
  if (kind === 'db')
    return (
      <g>
        <rect x={at[0] - 5} y={at[1] - 2.2} width={10} height={4.4} rx={1.6} fill={C.load} opacity={0.9} />
      </g>
    )
  if (kind === 'handle') return <circle cx={at[0]} cy={at[1]} r={2.2} fill={C.accent} />
  return null
}

function Equipment({ motion, sk, back }: { motion: Motion; sk: ReturnType<typeof solve>; back?: boolean }) {
  const e = motion.equipment
  if (back) {
    return (
      <g>
        {e.lines?.map(([a, b], i) => <line key={i} {...line(a, b)} stroke={C.equipLine} strokeWidth={2.2} strokeLinecap="round" />)}
        {e.shapes?.map((pts, i) => <polygon key={i} points={pts.map((p) => p.join(',')).join(' ')} fill={C.equip} stroke={C.equipLine} strokeWidth={0.6} strokeLinejoin="round" />)}
        {e.cable && <line {...line(e.cable, sk.hand)} stroke={C.cable} strokeWidth={0.7} strokeDasharray="2 1.5" />}
        {e.cable && <circle cx={e.cable[0]} cy={e.cable[1]} r={2.4} fill={C.equip} stroke={C.cable} strokeWidth={0.8} />}
      </g>
    )
  }
  const shin = [sk.ankle[0] - sk.knee[0], sk.ankle[1] - sk.knee[1]]
  return (
    <g>
      {e.anklePad && <circle cx={sk.ankle[0] - shin[0] * 0.12} cy={sk.ankle[1] - shin[1] * 0.12} r={3.6} fill={C.equip} stroke={C.accent} strokeWidth={1} />}
      {e.kneePad && <rect x={sk.knee[0] - 6} y={sk.knee[1] - 7.5} width={12} height={4} rx={2} fill={C.equip} stroke={C.accent} strokeWidth={0.8} />}
      {e.hipBar && <circle cx={sk.hip[0] + 1} cy={sk.hip[1] - 7} r={6} fill="rgba(139,92,246,.18)" stroke={C.load} strokeWidth={1.6} />}
    </g>
  )
}

function SideFigure({ motion, pose }: { motion: Motion; pose: Pose }) {
  const sk = solve(pose)
  const limb = (a: Pt, b: Pt, c: Pt, color: string, w: number) => (
    <g stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points={`${a.join(',')} ${b.join(',')} ${c.join(',')}`} />
    </g>
  )
  return (
    <g>
      <Equipment motion={motion} sk={sk} back />
      {/* Extremidades del fondo */}
      {limb(sk.hip, sk.knee2, sk.ankle2, C.back, 5.2)}
      <line {...line(sk.ankle2, sk.toe2)} stroke={C.back} strokeWidth={3.4} strokeLinecap="round" />
      {limb(sk.shoulder, sk.elbow2, sk.hand2, C.back, 4.4)}
      {/* Tronco y cabeza */}
      <line {...line(sk.hip, sk.shoulder)} stroke={C.body} strokeWidth={9} strokeLinecap="round" />
      <circle cx={sk.head[0]} cy={sk.head[1]} r={SEG.head} fill={C.body} />
      {/* Extremidades de delante */}
      {limb(sk.hip, sk.knee, sk.ankle, C.body, 5.6)}
      <line {...line(sk.ankle, sk.toe)} stroke={C.body} strokeWidth={3.6} strokeLinecap="round" />
      {limb(sk.shoulder, sk.elbow, sk.hand, C.body, 4.8)}
      <Equipment motion={motion} sk={sk} />
      <Load at={sk.hand} kind={motion.load} />
    </g>
  )
}

function FrontFigure({ motion, pose }: { motion: Motion; pose: Pose }) {
  const cx0 = pose.hip[0]
  const hipY = pose.hip[1]
  const shY = hipY - SEG.torso
  const headY = shY - SEG.neck - SEG.head
  const arms = [1, -1].map((side) => {
    const root: Pt = [cx0 + side * 9, shY + 1]
    if ('end' in pose.arm) return { root, elbow: root, hand: root }
    const d1 = dir(pose.arm.a1)
    const elbow: Pt = [root[0] + side * d1[0] * SEG.upper, root[1] + d1[1] * SEG.upper]
    const d2 = dir(pose.arm.a2)
    const hand: Pt = [elbow[0] + side * d2[0] * SEG.fore, elbow[1] + d2[1] * SEG.fore]
    return { root, elbow, hand }
  })
  const legs = [1, -1].map((side) => {
    const hip: Pt = [cx0 + side * 5, hipY]
    const ankle: Pt = [cx0 + side * 7, FLOOR - 2]
    return { hip, knee: [(hip[0] + ankle[0]) / 2, (hip[1] + ankle[1]) / 2] as Pt, ankle }
  })
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {legs.map((l, i) => (
        <g key={i}>
          <polyline points={`${l.hip.join(',')} ${l.knee.join(',')} ${l.ankle.join(',')}`} stroke={C.body} strokeWidth={5.6} fill="none" />
          <line {...line(l.ankle, [l.ankle[0] + (i === 0 ? 3 : -3), l.ankle[1] + 1.5])} stroke={C.body} strokeWidth={3.6} />
        </g>
      ))}
      <path d={`M ${cx0 - 9} ${shY + 1} L ${cx0 + 9} ${shY + 1} L ${cx0 + 5.5} ${hipY} L ${cx0 - 5.5} ${hipY} Z`} fill={C.body} stroke={C.body} strokeWidth={3} />
      <circle cx={cx0} cy={headY} r={SEG.head} fill={C.body} />
      {arms.map((a, i) => (
        <g key={i}>
          <polyline points={`${a.root.join(',')} ${a.elbow.join(',')} ${a.hand.join(',')}`} stroke={C.body} strokeWidth={4.8} fill="none" />
          <Load at={a.hand} kind={motion.load} />
        </g>
      ))}
    </g>
  )
}
