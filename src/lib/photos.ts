/**
 * Fotos reales de técnica (posición inicial y final) de Free Exercise DB
 * (https://github.com/yuhonas/free-exercise-db, dominio público / Unlicense).
 * Van dentro de la app: funcionan sin conexión. Cada par está ordenado como el movimiento de motion.ts
 * (_0 = posición inicial, _1 = posición de trabajo); algunas fotos originales se intercambiaron para ello.
 */
const files = import.meta.glob('../assets/exercises/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function frames(key: string): [string, string] | null {
  const a = files[`../assets/exercises/${key}_0.webp`]
  const b = files[`../assets/exercises/${key}_1.webp`]
  return a && b ? [a, b] : null
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Clave de foto según el nombre del ejercicio (sirve también para ejercicios propios). */
export function photoKeyFor(name: string): string | null {
  const n = norm(name)
  const has = (...k: string[]) => k.some((x) => n.includes(x))
  if (has('press inclinado')) return has('multipower') && !has('mancuerna') ? 'smith_machine_incline_bench_press' : 'incline_dumbbell_press'
  if (has('maquina convergente', 'press en maquina') && !has('militar')) return 'machine_bench_press'
  if (has('press banca', 'press plano', 'press de banca')) return 'dumbbell_bench_press'
  if (has('press militar', 'press de hombro')) return 'dumbbell_shoulder_press'
  if (has('fondos', 'press cerrado')) return 'dips_triceps_version'
  if (has('cruce', 'aperturas', 'pec deck')) return 'low_cable_crossover'
  if (has('elevaciones laterales', 'elevacion lateral')) return has('polea') && !has('mancuerna') ? 'cable_seated_lateral_raise' : 'side_lateral_raise'
  if (has('pajaro', 'posterior', 'reverse')) return 'reverse_machine_flyes'
  if (has('face pull')) return 'face_pull'
  if (has('sobre la cabeza', 'frances')) return 'cable_rope_overhead_triceps_extension'
  if (has('pushdown', 'triceps en polea', 'extension de triceps')) return 'triceps_pushdown'
  if (has('jalon')) return has('prono', 'abierto', 'ancho') ? 'wide_grip_lat_pulldown' : 'v_bar_pulldown'
  if (has('remo') && has('polea')) return 'seated_one_arm_cable_pulley_rows'
  if (has('remo') && has('barra', 'remo en t')) return 'lying_t_bar_row'
  if (has('remo')) return 'dumbbell_incline_row'
  if (has('predicador', 'scott')) return 'machine_preacher_curls'
  if (has('curl inclinado', 'bayesiano')) return 'incline_dumbbell_curl'
  if (has('curl femoral')) return has('tumbado', 'acostado') ? 'lying_leg_curls' : 'seated_leg_curl'
  if (has('martillo', 'curl')) return 'hammer_curls'
  if (has('bulgara')) return 'split_squat_with_dumbbells'
  if (has('zancada', 'lunge')) return 'dumbbell_rear_lunge'
  if (has('hip thrust', 'pies altos', 'puente')) return 'barbell_hip_thrust'
  if (has('extensiones de cuadriceps', 'extension de cuadriceps')) return 'leg_extensions'
  if (has('peso muerto', 'rumano')) return 'romanian_deadlift'
  if (has('talones sentado', 'soleo')) return 'seated_calf_raise'
  if (has('talones', 'gemelo')) return 'standing_calf_raises'
  if (has('hack', 'sentadilla')) return 'hack_squat'
  if (has('prensa')) return 'leg_press'
  return null
}

export function photosFor(name: string): [string, string] | null {
  const k = photoKeyFor(name)
  return k ? frames(k) : null
}

/** Búsqueda de vídeos de técnica en YouTube. */
export function videoUrlFor(name: string): string {
  const clean = name.replace(/\(.*?\)/g, '').trim()
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${clean} técnica correcta`)}`
}
