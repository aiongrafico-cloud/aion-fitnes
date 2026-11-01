import { motion } from 'framer-motion'
import { Activity, ClipboardList, Dumbbell, History, LayoutDashboard, LineChart, Scale, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../ui'

export type Tab = 'panel' | 'entrenar' | 'rutina' | 'progreso' | 'cuerpo' | 'ejercicios' | 'historial' | 'ajustes'

export const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'panel', label: 'Panel', icon: LayoutDashboard },
  { id: 'entrenar', label: 'Entrenar', icon: Activity },
  { id: 'rutina', label: 'Rutina', icon: ClipboardList },
  { id: 'progreso', label: 'Progreso', icon: LineChart },
  { id: 'cuerpo', label: 'Cuerpo', icon: Scale },
  { id: 'ejercicios', label: 'Ejercicios', icon: Dumbbell },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
]

/** En móvil van en la cabecera; el resto en la barra inferior. */
const HEADER_TABS: Tab[] = ['ejercicios', 'historial', 'ajustes']

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <div className="relative grid h-8 w-8 place-items-center rounded-[10px] border border-white/[0.08] bg-gradient-to-br from-ink-800 to-ink-950">
        <svg viewBox="0 0 32 32" className="h-5 w-5">
          <path d="M9 23 16 8l7 15" stroke="#10b981" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 18h8" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight text-zinc-50">Aion</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">Fitness</div>
      </div>
    </div>
  )
}

export function Shell({ tab, onTab, children, hasDraft, name }: { tab: Tab; onTab: (t: Tab) => void; children: ReactNode; hasDraft: boolean; name: string }) {
  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-white/[0.05] bg-ink-950/60 px-4 py-6 backdrop-blur-xl lg:flex">
        <Logo className="px-2" />
        <nav className="mt-10 flex flex-col gap-1">
          {TABS.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className={cx(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-200',
                )}
              >
                {active && (
                  <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-white/[0.07] bg-white/[0.05]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                )}
                <Icon size={18} className={cx('relative', active && 'text-emerald-400')} />
                <span className="relative">{t.label}</span>
                {t.id === 'entrenar' && hasDraft && <span className="relative ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
          <div className="label">Atleta</div>
          <div className="mt-1 truncate text-sm font-medium text-zinc-200">{name || 'Sin nombre'}</div>
        </div>
      </aside>

      {/* Cabecera móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.05] bg-ink-950/70 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo />
        <div className="flex gap-1">
          <button onClick={() => onTab('ejercicios')} aria-label="Ejercicios" className={cx('grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[0.05]', tab === 'ejercicios' ? 'text-emerald-400' : 'text-zinc-400')}>
            <Dumbbell size={18} />
          </button>
          <button onClick={() => onTab('historial')} aria-label="Historial" className={cx('grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[0.05]', tab === 'historial' ? 'text-emerald-400' : 'text-zinc-400')}>
            <History size={18} />
          </button>
          <button onClick={() => onTab('ajustes')} aria-label="Ajustes" className={cx('grid h-9 w-9 place-items-center rounded-xl hover:bg-white/[0.05]', tab === 'ajustes' ? 'text-emerald-400' : 'text-zinc-400')}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>

      {/* Navegación inferior móvil */}
      <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="glass-strong flex items-center justify-between px-1.5 py-1.5">
          {TABS.filter((t) => !HEADER_TABS.includes(t.id)).map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => onTab(t.id)} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium">
                {active && <motion.span layoutId="mnav-active" className="absolute inset-0 rounded-xl bg-white/[0.06]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <Icon size={19} className={cx('relative transition-colors', active ? 'text-emerald-400' : 'text-zinc-500')} />
                <span className={cx('relative', active ? 'text-zinc-100' : 'text-zinc-500')}>{t.label}</span>
                {t.id === 'entrenar' && hasDraft && <span className="absolute right-[30%] top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
