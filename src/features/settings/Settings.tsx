import { useConfirm } from '../../components/ui/confirm'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Download, RefreshCcw, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, Card, Field, SectionTitle, Segmented, Stepper } from '../../components/ui'
import { useAthlete } from '../../store/AppStore'
import { EXPERIENCE, GOALS } from '../../lib/program'
import { parseState } from '../../lib/storage'
import { todayISO } from '../../lib/date'
import type { AppState, Experience, Formula, Goal } from '../../lib/types'

export function SettingsView() {
  const athlete = useAthlete()
  const { profile, settings, dispatch } = athlete
  const fileRef = useRef<HTMLInputElement>(null)
  const ask = useConfirm()
  const [msg, setMsg] = useState<string | null>(null)

  const exportData = async () => {
    const state: AppState = { version: 1, profile, exercises: athlete.exercises, sessions: athlete.sessions, draft: athlete.draft, settings, routine: athlete.routine, body: athlete.body }
    const json = JSON.stringify(state, null, 2)
    const fileName = `aion-fitness-${todayISO()}.json`
    // En la app de Android no hay descargas de navegador: se guarda el archivo y se abre el menú Compartir.
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await Filesystem.writeFile({ path: fileName, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
        await Share.share({ title: 'Copia de Aion Fitness', files: [res.uri] })
        setMsg('Copia creada. Guárdala en Drive, Archivos o donde prefieras.')
      } catch {
        setMsg('No se pudo crear la copia. Inténtalo de nuevo.')
      }
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const importData = async (file: File) => {
    try {
      const parsed = parseState(JSON.parse(await file.text()))
      if (!parsed) throw new Error('invalid')
      dispatch({ type: 'replace', state: parsed })
      setMsg('Datos importados correctamente.')
    } catch {
      setMsg('El archivo no es una copia válida de Aion Fitness.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Configuración</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Ajustes</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Perfil del atleta" subtitle="Los cambios recalculan el plan al instante" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2">
              <input className="field" value={profile.name} onChange={(e) => dispatch({ type: 'updateProfile', profile: { name: e.target.value } })} />
            </Field>
            <Field label="Peso corporal">
              <Stepper value={profile.bodyweight} step={0.5} min={30} max={250} suffix="kg" onChange={(v) => dispatch({ type: 'updateProfile', profile: { bodyweight: v } })} />
            </Field>
            <Field label="Días por semana">
              <Stepper value={profile.daysPerWeek} min={2} max={6} onChange={(v) => dispatch({ type: 'updateProfile', profile: { daysPerWeek: Math.round(v) } })} />
            </Field>
            <Field label="Experiencia" className="sm:col-span-2">
              <Segmented
                layoutId="set-exp"
                value={profile.experience}
                onChange={(v: Experience) => dispatch({ type: 'updateProfile', profile: { experience: v } })}
                options={(Object.keys(EXPERIENCE) as Experience[]).map((k) => ({ value: k, label: EXPERIENCE[k].label }))}
              />
            </Field>
            <Field label="Objetivo" className="sm:col-span-2">
              <Segmented
                layoutId="set-goal"
                value={profile.goal}
                onChange={(v: Goal) => dispatch({ type: 'updateProfile', profile: { goal: v } })}
                options={(Object.keys(GOALS) as Goal[]).map((k) => ({ value: k, label: GOALS[k].label.split(' ')[0] }))}
              />
            </Field>
            <Field label="Duración del ciclo" className="sm:col-span-2">
              <Segmented layoutId="set-weeks" value={profile.programWeeks} onChange={(v: number) => dispatch({ type: 'updateProfile', profile: { programWeeks: v } })} options={[8, 10, 12].map((w) => ({ value: w, label: `${w} sem` }))} />
            </Field>
            <Field label="Inicio del ciclo" className="sm:col-span-2">
              <input type="date" className="field" value={profile.startDate} max={todayISO()} onChange={(e) => e.target.value && dispatch({ type: 'updateProfile', profile: { startDate: e.target.value } })} />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Cálculo" />
            <div className="space-y-4">
              <Field label="Fórmula de 1RM" hint="El promedio usa Epley + Brzycki hasta 10 reps efectivas y Epley por encima.">
                <Segmented
                  layoutId="set-formula"
                  value={settings.formula}
                  onChange={(v: Formula) => dispatch({ type: 'updateSettings', settings: { formula: v } })}
                  options={[
                    { value: 'promedio', label: 'Promedio' },
                    { value: 'epley', label: 'Epley' },
                    { value: 'brzycki', label: 'Brzycki' },
                  ]}
                />
              </Field>
              <Field label="Incremento mínimo de discos">
                <Segmented layoutId="set-round" value={settings.rounding} onChange={(v: number) => dispatch({ type: 'updateSettings', settings: { rounding: v } })} options={[0.5, 1, 1.25, 2.5].map((r) => ({ value: r, label: `${String(r).replace('.', ',')} kg` }))} />
              </Field>
              <Field label="Descanso entre series">
                <Stepper value={settings.restSeconds} step={15} min={15} max={600} suffix="s" onChange={(v) => dispatch({ type: 'updateSettings', settings: { restSeconds: Math.round(v) } })} />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle title="Datos" subtitle="Todo se guarda localmente en este dispositivo" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={exportData}>
                <Download size={15} /> Exportar copia
              </Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Importar copia
              </Button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
              <Button
                variant="violet"
                className="sm:col-span-2"
                onClick={async () => (await ask({ title: 'Nuevo ciclo', message: 'Tu mejor 1RM actual de cada ejercicio pasará a ser la nueva línea base y el ciclo empezará hoy. El historial se conserva.', confirmLabel: 'Iniciar ciclo' })) && dispatch({ type: 'startNewCycle' })}
              >
                <RefreshCcw size={15} /> Nuevo ciclo desde mi nivel actual
              </Button>
              <Button variant="danger" className="sm:col-span-2" onClick={async () => (await ask({ title: 'Borrar todo', message: 'Se eliminarán tu perfil, ejercicios y sesiones, y volverás a la evaluación inicial. Esta acción no se puede deshacer.', confirmLabel: 'Borrar todo', danger: true })) && dispatch({ type: 'reset' })}>
                <RotateCcw size={15} /> Borrar todo y empezar de cero
              </Button>
            </div>
            {msg && <p className="mt-3 text-sm text-zinc-400">{msg}</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}
