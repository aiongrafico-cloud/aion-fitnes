import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { KeepAwake } from '@capacitor-community/keep-awake'

const KEY = 'aion-voice'

export function voiceEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setVoiceEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* sin almacenamiento */
  }
  if (!on) stopSpeaking()
}

const native = () => Capacitor.isNativePlatform()

/** Lee un texto en voz alta (es-ES). Interrumpe lo que se estuviera diciendo. */
export async function say(text: string): Promise<void> {
  if (!voiceEnabled() || !text) return
  try {
    if (native()) {
      await TextToSpeech.stop().catch(() => {})
      await TextToSpeech.speak({ text, lang: 'es-ES', rate: 1.0, pitch: 1.0, volume: 1.0, category: 'playback' })
      return
    }
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'es-ES'
    const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith('es'))
    if (v) u.voice = v
    synth.speak(u)
  } catch {
    /* sin voz disponible */
  }
}

export function stopSpeaking() {
  try {
    if (native()) void TextToSpeech.stop().catch(() => {})
    else window.speechSynthesis?.cancel()
  } catch {
    /* nada */
  }
}

/** Pitido corto (cuenta atrás) con Web Audio. */
let ctx: AudioContext | null = null
export function beep(freq = 880, ms = 140) {
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + ms / 1000 + 0.02)
  } catch {
    /* sin audio */
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* sin vibración */
  }
}

/** Mantiene la pantalla encendida durante el entrenamiento guiado. */
let lock: { release: () => Promise<void> } | null = null
export async function keepScreenOn(on: boolean) {
  try {
    if (native()) {
      await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep())
      return
    }
    if (on) {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      lock = (await wl?.request('screen')) ?? null
    } else {
      await lock?.release()
      lock = null
    }
  } catch {
    /* no soportado */
  }
}

/** "82,5" → "82 y medio kilos"; con lastre: "más 10 kilos". */
export function kgSpoken(w: number, bodyweight = false): string {
  const int = Math.floor(w)
  const frac = Math.round((w - int) * 100) / 100
  const n = frac === 0 ? `${int}` : frac === 0.5 ? `${int} y medio` : String(w).replace('.', ',')
  if (bodyweight) return w > 0 ? `con ${n} kilos de lastre` : 'con tu peso corporal'
  return w > 0 ? `${n} kilos` : 'sin peso'
}

export function secondsSpoken(s: number): string {
  if (s < 60) return `${s} segundos`
  const m = Math.floor(s / 60)
  const r = s % 60
  const mm = m === 1 ? 'un minuto' : `${m} minutos`
  return r ? `${mm} y ${r} segundos` : mm
}
