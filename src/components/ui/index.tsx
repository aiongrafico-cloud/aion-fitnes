import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion'
import { Minus, Plus, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useEffect, useState, type ReactNode } from 'react'

export { clsx as cx }

/* ── Card ─────────────────────────────────────────────────────────────────── */

export function Card({ className, interactive, ...props }: HTMLMotionProps<'div'> & { interactive?: boolean }) {
  return (
    <motion.div
      className={clsx(
        'glass p-5',
        interactive && 'cursor-pointer transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]',
        className,
      )}
      {...(interactive ? { whileHover: { y: -2 }, whileTap: { scale: 0.99 } } : {})}
      {...props}
    />
  )
}

/* ── Button ───────────────────────────────────────────────────────────────── */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'violet'

const variants: Record<Variant, string> = {
  primary:
    'bg-emerald-500 text-ink-950 font-semibold shadow-[0_8px_30px_-8px_rgba(16,185,129,.6)] hover:bg-emerald-400 disabled:bg-emerald-500/40',
  violet:
    'bg-violet-500 text-white font-semibold shadow-[0_8px_30px_-8px_rgba(139,92,246,.6)] hover:bg-violet-400 disabled:bg-violet-500/40',
  secondary: 'border border-white/[0.08] bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08] hover:border-white/[0.14]',
  ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]',
  danger: 'border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: HTMLMotionProps<'button'> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'icon' }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl text-sm transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        size === 'icon' && 'h-9 w-9',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  )
}

/* ── Badge ────────────────────────────────────────────────────────────────── */

export function Badge({ tone = 'zinc', children, className }: { tone?: 'zinc' | 'emerald' | 'violet' | 'amber' | 'rose'; children: ReactNode; className?: string }) {
  const tones = {
    zinc: 'bg-white/[0.05] text-zinc-400 border-white/[0.06]',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

/* ── Segmented control ────────────────────────────────────────────────────── */

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  layoutId,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
  layoutId: string
}) {
  return (
    <div className={clsx('relative flex rounded-xl border border-white/[0.06] bg-white/[0.02] p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative z-10 flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
            value === o.value ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 -z-10 rounded-lg border border-white/[0.08] bg-white/[0.08]"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Number stepper ───────────────────────────────────────────────────────── */

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  suffix,
  className,
  compact,
  ariaLabel,
  bareOnMobile,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  className?: string
  compact?: boolean
  ariaLabel?: string
  /** En móvil oculta los botones −/+ para dejar todo el ancho al número. */
  bareOnMobile?: boolean
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)))
  // Texto local para permitir escribir decimales ("72," / "72.") sin que el valor controlado lo borre.
  const [text, setText] = useState(String(value))
  useEffect(() => {
    if (Number(text.replace(',', '.')) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div
      className={clsx(
        'flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] transition focus-within:border-emerald-500/50',
        compact ? 'h-10' : 'h-12',
        className,
      )}
    >
      <button type="button" aria-label="Restar" onClick={() => set(value - step)} className={clsx('h-full w-9 shrink-0 place-items-center text-zinc-500 transition hover:text-zinc-100 active:scale-90', bareOnMobile ? 'hidden sm:grid' : 'grid')}>
        <Minus size={15} />
      </button>
      <div className="flex min-w-0 flex-1 items-baseline justify-center">
        <input
          aria-label={ariaLabel}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9.,]/g, '')
            setText(t)
            const n = Number(t.replace(',', '.'))
            if (t !== '' && Number.isFinite(n)) onChange(Math.min(max, n))
          }}
          onBlur={() => {
            const n = Number(text.replace(',', '.'))
            set(text === '' || !Number.isFinite(n) ? min : n)
            setText(String(Math.min(max, Math.max(min, Number.isFinite(n) && text !== '' ? n : min))))
          }}
          onFocus={(e) => e.target.select()}
          className={clsx('tnum w-full min-w-0 bg-transparent text-center font-semibold text-zinc-50 outline-none', compact ? 'text-[15px]' : 'text-lg')}
        />
        {suffix && <span className="-ml-1 pr-1 text-xs text-zinc-500">{suffix}</span>}
      </div>
      <button type="button" aria-label="Sumar" onClick={() => set(value + step)} className={clsx('h-full w-9 shrink-0 place-items-center text-zinc-500 transition hover:text-zinc-100 active:scale-90', bareOnMobile ? 'hidden sm:grid' : 'grid')}>
        <Plus size={15} />
      </button>
    </div>
  )
}

/* ── Modal / sheet ────────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={clsx('glass-strong relative max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-2xl sm:p-6', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
              <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ── Misc ─────────────────────────────────────────────────────────────────── */

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label mb-2 block">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-zinc-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-zinc-400">{icon}</div>
      <h3 className="text-[15px] font-semibold text-zinc-100">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ProgressRing({ value, size = 56, stroke = 5, color = '#10b981', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.06)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}
