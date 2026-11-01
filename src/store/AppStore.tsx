import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { defaultState, loadState, saveState, uid } from '../lib/storage'
import { todayISO } from '../lib/date'
import { analyzeExercise, effectiveLoad, initialWorkingLoad, isWorkSet, suggestedIncrement, GOALS } from '../lib/program'
import { estimate1RM, roundToPlate } from '../lib/oneRepMax'
import { buildDefaultRoutine, DEFAULT_ROUTINE, PROTOCOL } from '../lib/routine'
import { programWeekOf } from '../lib/date'
import type { AppState, BodyEntry, Exercise, ExerciseLog, Profile, Routine, RoutineItem, Session, SetLog, Settings } from '../lib/types'

type Action =
  | { type: 'completeOnboarding'; profile: Profile; exercises: Exercise[]; routine: Routine | null }
  | { type: 'updateProfile'; profile: Partial<Profile> }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'addExercise'; exercise: Exercise }
  | { type: 'updateExercise'; id: string; patch: Partial<Exercise> }
  | { type: 'deleteExercise'; id: string }
  | { type: 'startDraft'; date?: string; dayId?: string; entries?: { exerciseId: string; sets: Omit<SetLog, 'id'>[] }[] }
  | { type: 'setDraftDate'; date: string }
  | { type: 'setDraftNotes'; notes: string }
  | { type: 'addDraftExercise'; exerciseId: string; sets: Omit<SetLog, 'id'>[] }
  | { type: 'removeDraftExercise'; exerciseId: string }
  | { type: 'addDraftSet'; exerciseId: string; set?: Partial<SetLog> }
  | { type: 'updateDraftSet'; exerciseId: string; setId: string; patch: Partial<SetLog> }
  | { type: 'removeDraftSet'; exerciseId: string; setId: string }
  | { type: 'discardDraft' }
  | { type: 'finishDraft' }
  | { type: 'deleteSession'; id: string }
  | { type: 'startNewCycle' }
  | { type: 'updateRoutineItem'; dayId: string; itemId: string; patch: Partial<RoutineItem> }
  | { type: 'removeRoutineItem'; dayId: string; itemId: string }
  | { type: 'addRoutineItem'; dayId: string; item: RoutineItem }
  | { type: 'moveRoutineItem'; dayId: string; itemId: string; dir: -1 | 1 }
  | { type: 'resetRoutine' }
  | { type: 'saveBodyEntry'; entry: BodyEntry }
  | { type: 'deleteBodyEntry'; id: string }
  | { type: 'replace'; state: AppState }
  | { type: 'reset' }

function mapDraftEntry(state: AppState, exerciseId: string, fn: (e: ExerciseLog) => ExerciseLog): AppState {
  if (!state.draft) return state
  return {
    ...state,
    draft: { ...state.draft, entries: state.draft.entries.map((e) => (e.exerciseId === exerciseId ? fn(e) : e)) },
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'completeOnboarding':
      return {
        ...state,
        profile: action.profile,
        exercises: action.exercises,
        routine: action.routine,
        sessions: [],
        draft: null,
        body: [{ id: uid(), date: action.profile.startDate, weight: action.profile.bodyweight }],
      }
    case 'updateProfile':
      return state.profile ? { ...state, profile: { ...state.profile, ...action.profile } } : state
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'addExercise':
      return { ...state, exercises: [...state.exercises, action.exercise] }
    case 'updateExercise':
      return { ...state, exercises: state.exercises.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)) }
    case 'deleteExercise':
      return {
        ...state,
        exercises: state.exercises.filter((e) => e.id !== action.id),
        sessions: state.sessions
          .map((s) => ({ ...s, entries: s.entries.filter((en) => en.exerciseId !== action.id) }))
          .filter((s) => s.entries.length > 0),
        draft: state.draft ? { ...state.draft, entries: state.draft.entries.filter((en) => en.exerciseId !== action.id) } : null,
      }
    case 'startDraft':
      if (state.draft) return state
      return {
        ...state,
        draft: {
          id: uid(),
          date: action.date ?? todayISO(),
          dayId: action.dayId,
          entries: (action.entries ?? []).map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map((st) => ({ ...st, id: uid() })) })),
          createdAt: new Date().toISOString(),
        },
      }
    case 'setDraftDate':
      return state.draft ? { ...state, draft: { ...state.draft, date: action.date } } : state
    case 'setDraftNotes':
      return state.draft ? { ...state, draft: { ...state.draft, notes: action.notes } } : state
    case 'addDraftExercise': {
      if (!state.draft || state.draft.entries.some((e) => e.exerciseId === action.exerciseId)) return state
      const entry: ExerciseLog = { exerciseId: action.exerciseId, sets: action.sets.map((s) => ({ ...s, id: uid() })) }
      return { ...state, draft: { ...state.draft, entries: [...state.draft.entries, entry] } }
    }
    case 'removeDraftExercise':
      return state.draft
        ? { ...state, draft: { ...state.draft, entries: state.draft.entries.filter((e) => e.exerciseId !== action.exerciseId) } }
        : state
    case 'addDraftSet':
      return mapDraftEntry(state, action.exerciseId, (e) => {
        const last = e.sets[e.sets.length - 1]
        const set: SetLog = {
          id: uid(),
          weight: action.set?.weight ?? last?.weight ?? 0,
          reps: action.set?.reps ?? last?.reps ?? 8,
          rpe: action.set?.rpe ?? last?.rpe,
          done: false,
          kind: action.set?.kind ?? (last && last.kind !== 'warmup' ? 'normal' : undefined),
        }
        return { ...e, sets: [...e.sets, set] }
      })
    case 'updateDraftSet':
      return mapDraftEntry(state, action.exerciseId, (e) => ({
        ...e,
        sets: e.sets.map((s) => (s.id === action.setId ? { ...s, ...action.patch } : s)),
      }))
    case 'removeDraftSet':
      return mapDraftEntry(state, action.exerciseId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== action.setId) }))
    case 'discardDraft':
      return { ...state, draft: null }
    case 'finishDraft': {
      if (!state.draft) return state
      const entries = state.draft.entries
        .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((e) => e.sets.length > 0)
      if (entries.length === 0) return { ...state, draft: null }
      const session: Session = { ...state.draft, entries }
      return { ...state, exercises: calibrateFrom(state, session), sessions: [...state.sessions, session], draft: null }
    }
    case 'deleteSession':
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id) }
    case 'startNewCycle': {
      // Nuevo ciclo: el mejor rendimiento actual pasa a ser la nueva línea base.
      if (!state.profile) return state
      const profile = state.profile
      const today = todayISO()
      const goal = GOALS[profile.goal]
      const exercises = state.exercises.map((ex) => {
        if (ex.calibrated === false) return ex
        const a = analyzeExercise(ex, profile, state.sessions, state.settings)
        const load = initialWorkingLoad(a.currentBest, profile.goal, state.settings)
        const bw = ex.bodyweight ? profile.bodyweight : 0
        const weight = Math.max(0, roundToPlate(load - bw, state.settings.rounding))
        return { ...ex, baseline: { weight, reps: goal.reps, rpe: goal.rpe }, startWeek: 0 }
      })
      return { ...state, exercises, profile: { ...profile, startDate: today }, draft: null }
    }
    case 'updateRoutineItem':
      return mapDay(state, action.dayId, (items) => items.map((i) => (i.id === action.itemId ? { ...i, ...action.patch } : i)))
    case 'removeRoutineItem':
      return mapDay(state, action.dayId, (items) => items.filter((i) => i.id !== action.itemId))
    case 'addRoutineItem':
      return mapDay(state, action.dayId, (items) => [...items, action.item])
    case 'moveRoutineItem':
      return mapDay(state, action.dayId, (items) => {
        const i = items.findIndex((x) => x.id === action.itemId)
        const j = i + action.dir
        if (i < 0 || j < 0 || j >= items.length) return items
        const next = [...items]
        ;[next[i], next[j]] = [next[j], next[i]]
        return next
      })
    case 'resetRoutine': {
      const week = state.profile ? Math.max(0, programWeekOf(state.profile.startDate, todayISO()) - 1) : 0
      const built = buildDefaultRoutine(state.exercises, week)
      return { ...state, exercises: [...state.exercises, ...built.exercises].map((e) => (built.routine.days.some((d) => d.items.some((i) => i.exerciseId === e.id)) ? { ...e, archived: false } : e)), routine: built.routine }
    }
    case 'saveBodyEntry': {
      // Un registro por día: guardar en una fecha existente la sustituye.
      const body = [...(state.body ?? []).filter((b) => b.date !== action.entry.date && b.id !== action.entry.id), action.entry]
      const latestWeight = body.filter((b) => b.weight != null).sort((a, b) => a.date.localeCompare(b.date)).pop()
      // El peso más reciente actualiza el perfil (afecta a los ejercicios con peso corporal).
      const profile = state.profile && latestWeight?.weight ? { ...state.profile, bodyweight: latestWeight.weight } : state.profile
      return { ...state, body, profile }
    }
    case 'deleteBodyEntry':
      return { ...state, body: (state.body ?? []).filter((b) => b.id !== action.id) }
    case 'replace':
      return ensureRoutine(action.state)
    case 'reset':
      return defaultState
  }
}

function mapDay(state: AppState, dayId: string, fn: (items: RoutineItem[]) => RoutineItem[]): AppState {
  if (!state.routine) return state
  return { ...state, routine: { ...state.routine, days: state.routine.days.map((d) => (d.id === dayId ? { ...d, items: fn(d.items) } : d)) } }
}

/**
 * Calibración: un ejercicio sin línea base toma como referencia su mejor serie efectiva de la primera sesión.
 * Su plan empieza la semana siguiente (startWeek = semana de la sesión).
 */
function calibrateFrom(state: AppState, session: Session): Exercise[] {
  const profile = state.profile
  if (!profile) return state.exercises
  return state.exercises.map((ex) => {
    if (ex.calibrated !== false) return ex
    const entry = session.entries.find((e) => e.exerciseId === ex.id)
    if (!entry) return ex
    let best: SetLog | null = null
    let bestV = 0
    for (const st of entry.sets) {
      if (!st.done || !isWorkSet(st) || st.reps <= 0) continue
      const v = estimate1RM(effectiveLoad(ex, st.weight, profile.bodyweight), st.reps, st.rpe ?? PROTOCOL.topRpe, state.settings.formula)
      if (v > bestV) {
        bestV = v
        best = st
      }
    }
    if (!best || bestV <= 0) return ex
    return {
      ...ex,
      calibrated: true,
      baseline: { weight: best.weight, reps: best.reps, rpe: best.rpe ?? PROTOCOL.topRpe },
      startWeek: Math.max(0, programWeekOf(profile.startDate, session.date)),
      weeklyIncrement: suggestedIncrement(bestV, profile, state.settings),
    }
  })
}

/** Datos anteriores a la rutina: se añade la rutina predeterminada sin tocar ejercicios ni sesiones existentes. */
export function ensureRoutine(input: AppState): AppState {
  const state = migrate(input)
  if (!state.profile || state.routine) return { ...state, routine: state.routine ?? null }
  const week = Math.max(0, programWeekOf(state.profile.startDate, todayISO()) - 1)
  const built = buildDefaultRoutine(state.exercises, week)
  return { ...state, exercises: [...state.exercises, ...built.exercises], routine: built.routine }
}

/** Migraciones de datos guardados con versiones anteriores de la app. */
function migrate(state: AppState): AppState {
  // Grupos musculares de pierna más finos para el volumen semanal.
  const groupByName = new Map(DEFAULT_ROUTINE.flatMap((d) => d.items).map((t) => [t.name.toLowerCase(), t.group]))
  const exercises = state.exercises.map((e) => {
    const g = groupByName.get(e.name.toLowerCase())
    return e.muscleGroup === 'piernas' && g && g !== 'piernas' ? { ...e, muscleGroup: g } : e
  })
  // Registro corporal: se inicia con el peso del perfil.
  const body = state.body ?? (state.profile ? [{ id: uid(), date: state.profile.startDate, weight: state.profile.bodyweight }] : [])
  return { ...state, exercises, body }
}

interface Store {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const Ctx = createContext<Store | null>(null)

export function AppStoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial ?? null, (i) => ensureRoutine(i ?? loadState()))
  useEffect(() => saveState(state), [state])
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de AppStoreProvider')
  return s
}

/** Hook para vistas que requieren onboarding completado. */
export function useAthlete() {
  const { state, dispatch } = useStore()
  if (!state.profile) throw new Error('Perfil no configurado')
  return { ...state, profile: state.profile, dispatch }
}
