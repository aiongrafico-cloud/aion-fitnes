import { addDays, daysBetween } from './date'
import { summarizeSessions, VOLUME_TARGET, weeklyMuscleVolume } from './analytics'
import { muscleLabel } from './catalog'
import { metricChange } from './body'
import { progressionAlert } from './routine'
import { readinessFor } from './readiness'
import { kg } from './format'
import type { AppState, Profile } from './types'

export type Tone = 'good' | 'warn' | 'bad' | 'info'

export interface ReviewPoint {
  tone: Tone
  text: string
}

export interface WeeklyReview {
  from: string
  to: string
  sessions: number
  planned: number
  workSets: number
  prevWorkSets: number
  tonnage: number
  prevTonnage: number
  prs: string[]
  /** 0–100 */
  score: number
  headline: string
  points: ReviewPoint[]
  /** Recomendaciones para la semana que viene. */
  next: string[]
}

/** Revisión del entrenador de los últimos 7 días frente a los 7 anteriores. */
export function weeklyReview(state: AppState & { profile: Profile }, today: string, week: number): WeeklyReview {
  const { profile, exercises, sessions, settings, routine } = state
  const from = addDays(today, -6)
  const prevFrom = addDays(today, -13)
  const summaries = summarizeSessions(sessions, exercises, profile, settings)
  const inWin = summaries.filter((s) => s.session.date >= from && s.session.date <= today)
  const inPrev = summaries.filter((s) => s.session.date >= prevFrom && s.session.date < from)
  const sum = (a: typeof inWin, k: 'sets' | 'tonnage') => a.reduce((t, s) => t + s[k], 0)
  const name = (id: string) => exercises.find((e) => e.id === id)?.name ?? ''
  const prs = [...new Set(inWin.flatMap((s) => s.prs.map((p) => name(p.exerciseId))))].filter(Boolean)
  const planned = profile.daysPerWeek
  const done = inWin.length
  const points: ReviewPoint[] = []
  const next: string[] = []

  // Asistencia
  const adherence = Math.min(1, done / planned)
  if (done >= planned) points.push({ tone: 'good', text: `Cumpliste las ${planned} sesiones de la semana.` })
  else if (done >= planned - 1) points.push({ tone: 'warn', text: `${done} de ${planned} sesiones: casi completa.` })
  else points.push({ tone: 'bad', text: `${done} de ${planned} sesiones. La constancia es lo que más rinde: ${planned - done} sin hacer.` })
  if (done < planned) next.push('Agenda los días de entreno al principio de la semana y protégelos como una cita.')

  // Volumen y tonelaje
  const sets = sum(inWin, 'sets')
  const prevSets = sum(inPrev, 'sets')
  const ton = sum(inWin, 'tonnage')
  const prevTon = sum(inPrev, 'tonnage')
  if (prevTon > 0 && ton > 0) {
    const d = (ton / prevTon - 1) * 100
    points.push({ tone: d >= -5 ? 'good' : 'warn', text: `Tonelaje ${d >= 0 ? '+' : ''}${d.toFixed(0)} % frente a la semana anterior (${sets} series efectivas).` })
  }

  // Récords
  if (prs.length) points.push({ tone: 'good', text: `Récords: ${prs.slice(0, 4).join(', ')}${prs.length > 4 ? ` y ${prs.length - 4} más` : ''}.` })

  // Progresión por ejercicio
  const up: string[] = []
  const down: string[] = []
  const stuck: string[] = []
  const seen = new Set<string>()
  for (const d of routine?.days ?? []) {
    for (const it of d.items) {
      const ex = exercises.find((e) => e.id === it.exerciseId)
      if (!ex || seen.has(ex.id)) continue
      seen.add(ex.id)
      const a = progressionAlert(ex, it, sessions, profile, settings, today)
      if (!a || daysBetween(a.last.date, today) > 14) continue
      if (a.kind === 'subir') up.push(`${ex.name} (${kg(a.to ?? 0)})`)
      else if (a.kind === 'bajar') down.push(ex.name)
      else if (a.kind === 'estancado') stuck.push(ex.name)
    }
  }
  if (up.length) points.push({ tone: 'good', text: `Toca subir peso en: ${up.slice(0, 4).join(', ')}${up.length > 4 ? '…' : ''}.` })
  if (down.length) points.push({ tone: 'warn', text: `Carga demasiado alta en: ${down.slice(0, 3).join(', ')}. Ya la ajusté para la próxima sesión.` })
  if (stuck.length) {
    points.push({ tone: 'bad', text: `Estancado en: ${stuck.slice(0, 3).join(', ')}.` })
    next.push(`En ${stuck[0]}: cuida el descanso entre series, controla la bajada y, si sigue igual, adelanta una semana de descarga.`)
  }

  // Recuperación (check-ins)
  const checks = sessions.filter((s) => s.date >= from && s.date <= today && s.checkin).map((s) => readinessFor(s.checkin!))
  if (checks.length) {
    const avg = checks.reduce((t, r) => t + r.score, 0) / checks.length
    const pain = sessions.some((s) => s.date >= from && s.checkin?.pain)
    if (avg >= 7.5) points.push({ tone: 'good', text: 'Buena recuperación: llegaste fresco a casi todas las sesiones.' })
    else if (avg >= 6) points.push({ tone: 'info', text: 'Recuperación normal esta semana.' })
    else {
      points.push({ tone: 'bad', text: 'Llegaste cansado a varias sesiones.' })
      next.push('Prioriza 7–9 h de sueño. Si la semana que viene sigue igual, hacemos una descarga.')
    }
    if (pain) next.push('Registraste dolor articular: cambia el ejercicio que molesta o reduce el rango de movimiento.')
  } else if (done > 0) {
    next.push('Haz el check-in antes de entrenar: así ajusto la carga a cómo llegas cada día.')
  }

  // Volumen por músculo
  const [lo] = VOLUME_TARGET[profile.goal]
  const vol = weeklyMuscleVolume(exercises, sessions, profile, routine, week - 1)
  const low = vol.filter((v) => v.planned >= lo && v.sets > 0 && v.sets < lo).map((v) => muscleLabel(v.group).toLowerCase())
  if (low.length && done >= planned - 1) points.push({ tone: 'warn', text: `Poco volumen la semana pasada en ${low.slice(0, 3).join(', ')} (menos de ${lo} series).` })

  // Peso corporal frente al objetivo
  const w = metricChange(state.body ?? [], 'weight')
  if (w?.weeklyRate != null && daysBetween(w.latest.date, today) <= 10) {
    const pct = (w.weeklyRate / w.latest.value) * 100
    const rate = `${w.weeklyRate >= 0 ? '+' : ''}${w.weeklyRate.toFixed(2).replace('.', ',')} kg/semana`
    if (profile.goal === 'hipertrofia') {
      if (pct < 0) {
        points.push({ tone: 'warn', text: `Tu peso baja (${rate}). Para ganar músculo conviene un ligero superávit.` })
        next.push('Suma unas 200–300 kcal al día (por ejemplo, un batido o una ración extra de carbohidratos).')
      } else if (pct > 0.75) {
        points.push({ tone: 'warn', text: `Subes de peso rápido (${rate}): parte será grasa.` })
        next.push('Recorta unas 200 kcal al día para subir entre 0,25 y 0,5 % de tu peso por semana.')
      } else points.push({ tone: 'good', text: `Peso en buen ritmo para ganar músculo (${rate}).` })
    } else points.push({ tone: 'info', text: `Peso corporal: ${rate}.` })
  } else {
    next.push('Pésate 2–3 mañanas por semana en la pestaña Cuerpo para que pueda vigilar tu ritmo.')
  }

  if (up.length) next.unshift(`Sube la carga en ${up[0].split(' (')[0]}${up.length > 1 ? ` y ${up.length - 1} ejercicio${up.length > 2 ? 's' : ''} más` : ''}; la app ya lo tiene prescrito.`)
  if (!next.length) next.push('Sigue igual: mismo plan, intenta sumar una repetición en cada ejercicio.')

  const tonePts = points.reduce((t, p) => t + (p.tone === 'good' ? 1 : p.tone === 'bad' ? -1.5 : p.tone === 'warn' ? -0.5 : 0), 0)
  const score = Math.round(Math.max(0, Math.min(100, adherence * 70 + 15 + tonePts * 6 + (prs.length ? 5 : 0))))
  const headline =
    done === 0
      ? 'Semana sin entrenos registrados. Empezamos de nuevo hoy.'
      : score >= 85
        ? 'Semana excelente. Vas por muy buen camino.'
        : score >= 65
          ? 'Buena semana, con un par de cosas que ajustar.'
          : 'Semana floja. Vamos a corregirla juntos.'

  return { from, to: today, sessions: done, planned, workSets: sets, prevWorkSets: prevSets, tonnage: ton, prevTonnage: prevTon, prs, score, headline, points, next: next.slice(0, 4) }
}
