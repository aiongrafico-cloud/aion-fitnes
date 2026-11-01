import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { Shell, TABS, type Tab } from './components/layout/Shell'
import { useStore } from './store/AppStore'
import { Onboarding } from './features/onboarding/Onboarding'
import { Dashboard } from './features/dashboard/Dashboard'
import { Logger } from './features/logger/Logger'
import { Progress } from './features/progress/Progress'
import { Exercises } from './features/exercises/Exercises'
import { HistoryView } from './features/history/History'
import { SettingsView } from './features/settings/Settings'
import { RoutineView } from './features/routine/RoutineView'

function readHash(): Tab {
  const h = window.location.hash.replace('#', '') as Tab
  return TABS.some((t) => t.id === h) ? h : 'panel'
}

export default function App() {
  const { state } = useStore()
  const [tab, setTab] = useState<Tab>(readHash)
  const [focusExercise, setFocusExercise] = useState<string | null>(null)
  const [pendingDay, setPendingDay] = useState<string | null>(null)
  const clearPendingDay = useCallback(() => setPendingDay(null), [])

  useEffect(() => {
    const onHash = () => setTab(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((t: Tab, exerciseId?: string) => {
    if (exerciseId) setFocusExercise(exerciseId)
    setTab(t)
    try {
      history.replaceState(null, '', `#${t}`)
    } catch {
      /* entornos sandbox sin history */
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (!state.profile) return <Onboarding />

  return (
    <Shell tab={tab} onTab={go} hasDraft={!!state.draft} name={state.profile.name}>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === 'panel' && <Dashboard go={go} />}
          {tab === 'entrenar' && <Logger go={go} initialDayId={pendingDay} onConsumeDay={clearPendingDay} />}
          {tab === 'rutina' && (
            <RoutineView
              go={go}
              onTrainDay={(id) => {
                setPendingDay(id)
                go('entrenar')
              }}
            />
          )}
          {tab === 'progreso' && <Progress focusId={focusExercise} onFocus={setFocusExercise} />}
          {tab === 'ejercicios' && <Exercises go={go} />}
          {tab === 'historial' && <HistoryView />}
          {tab === 'ajustes' && <SettingsView />}
        </motion.div>
      </AnimatePresence>
    </Shell>
  )
}
