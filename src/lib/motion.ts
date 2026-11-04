/**
 * Animaciones de técnica: una figura articulada 2D (vista lateral o frontal) con cinemática directa
 * para el torso e inversa (2 segmentos) para brazos y piernas cuando la mano o el pie están fijos.
 * Todo es geométrico y sin recursos externos: funciona sin conexión dentro del APK.
 *
 * Convención de ángulos (grados, ejes SVG con y hacia abajo): 0 = abajo, 90 = adelante (derecha),
 * 180 = arriba, −90 = atrás (izquierda).
 */

export type Pt = [number, number]

export const FLOOR = 110
export const SEG = { torso: 34, neck: 4, head: 6.5, upper: 17, fore: 16, thigh: 22, shin: 22, foot: 8 }

/** Brazo o pierna: por ángulos (cinemática directa) o por posición de la mano/pie (cinemática inversa). */
export type Limb = { a1: number; a2: number } | { end: Pt; bend: 1 | -1 }

export interface Pose {
  hip: Pt
  torso: number
  arm: Limb
  leg: Limb
  /** Extremidades del fondo (por defecto iguales a las de delante). */
  arm2?: Limb
  leg2?: Limb
  /** Inclinación del pie en grados (talón elevado en gemelos). */
  heel?: number
}

export type LoadKind = 'bar' | 'db' | 'handle' | 'none'

export interface Equipment {
  /** Polígonos estáticos (banco, respaldo, almohadillas): listas de puntos. */
  shapes?: Pt[][]
  /** Barras o soportes (líneas gruesas estáticas). */
  lines?: [Pt, Pt][]
  /** Polea: el cable va de este anclaje a la mano. */
  cable?: Pt
  /** Almohadilla que acompaña al tobillo (curl femoral, extensiones, gemelo sentado). */
  anklePad?: boolean
  /** Almohadilla sobre la rodilla (jalón, gemelo sentado). */
  kneePad?: boolean
  /** Carga en la cadera (hip thrust). */
  hipBar?: boolean
}

export interface Motion {
  id: string
  label: string
  view: 'side' | 'front'
  /** Posición inicial (normalmente estiramiento o arriba) y posición de trabajo. */
  start: Pose
  end: Pose
  load: LoadKind
  equipment: Equipment
  /** Tempo en segundos: ida (start→end), pausa en end, vuelta, pausa en start. */
  tempo: [number, number, number, number]
  /** Texto de cada fase. */
  phases: [string, string, string, string]
  cues: string[]
}

/* ── Utilidades geométricas ─────────────────────────────────────────────── */

const rad = (d: number) => (d * Math.PI) / 180
export const dir = (a: number): Pt => [Math.sin(rad(a)), Math.cos(rad(a))]
const add = (p: Pt, a: number, l: number): Pt => {
  const d = dir(a)
  return [p[0] + d[0] * l, p[1] + d[1] * l]
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

/** Cinemática inversa de 2 segmentos: articulación intermedia para llegar de `root` a `end`. */
export function ik(root: Pt, end: Pt, l1: number, l2: number, bend: 1 | -1): { mid: Pt; end: Pt } {
  const dx = end[0] - root[0]
  const dy = end[1] - root[1]
  const raw = Math.hypot(dx, dy) || 0.0001
  const d = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, raw))
  const base = Math.atan2(dy, dx)
  const off = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))
  const ang = base + bend * off
  const mid: Pt = [root[0] + Math.cos(ang) * l1, root[1] + Math.sin(ang) * l1]
  const reach: Pt = [root[0] + (dx / raw) * d, root[1] + (dy / raw) * d]
  return { mid, end: reach }
}

function solveLimb(root: Pt, limb: Limb, l1: number, l2: number): [Pt, Pt] {
  if ('end' in limb) {
    const r = ik(root, limb.end, l1, l2, limb.bend)
    return [r.mid, r.end]
  }
  const mid = add(root, limb.a1, l1)
  return [mid, add(mid, limb.a2, l2)]
}

function lerpLimb(a: Limb, b: Limb, t: number): Limb {
  if ('end' in a && 'end' in b) return { end: lerpPt(a.end, b.end, t), bend: t < 0.5 ? a.bend : b.bend }
  if (!('end' in a) && !('end' in b)) return { a1: lerp(a.a1, b.a1, t), a2: lerp(a.a2, b.a2, t) }
  return t < 0.5 ? a : b
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    hip: lerpPt(a.hip, b.hip, t),
    torso: lerp(a.torso, b.torso, t),
    arm: lerpLimb(a.arm, b.arm, t),
    leg: lerpLimb(a.leg, b.leg, t),
    arm2: a.arm2 && b.arm2 ? lerpLimb(a.arm2, b.arm2, t) : undefined,
    leg2: a.leg2 && b.leg2 ? lerpLimb(a.leg2, b.leg2, t) : undefined,
    heel: lerp(a.heel ?? 0, b.heel ?? 0, t),
  }
}

export interface Skeleton {
  hip: Pt
  shoulder: Pt
  head: Pt
  elbow: Pt
  hand: Pt
  knee: Pt
  ankle: Pt
  toe: Pt
  elbow2: Pt
  hand2: Pt
  knee2: Pt
  ankle2: Pt
  toe2: Pt
}

/** Posiciones de todas las articulaciones de una pose en vista lateral. */
export function solve(p: Pose): Skeleton {
  const shoulder = add(p.hip, p.torso, SEG.torso)
  const head = add(shoulder, p.torso, SEG.neck + SEG.head)
  const [elbow, hand] = solveLimb(shoulder, p.arm, SEG.upper, SEG.fore)
  const [elbow2, hand2] = solveLimb(shoulder, p.arm2 ?? p.arm, SEG.upper, SEG.fore)
  const [knee, ankle] = solveLimb(p.hip, p.leg, SEG.thigh, SEG.shin)
  const [knee2, ankle2] = solveLimb(p.hip, p.leg2 ?? p.leg, SEG.thigh, SEG.shin)
  const footAngle = 90 + (p.heel ?? 0)
  return { hip: p.hip, shoulder, head, elbow, hand, knee, ankle, toe: add(ankle, footAngle, SEG.foot), elbow2, hand2, knee2, ankle2, toe2: add(ankle2, footAngle, SEG.foot) }
}

/** Fase actual del ciclo: pose interpolada (con suavizado) e índice de fase. */
export function sample(m: Motion, timeSec: number): { pose: Pose; phase: number; progress: number } {
  const [t1, h1, t2, h2] = m.tempo
  const total = t1 + h1 + t2 + h2
  let t = timeSec % total
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
  if (t < t1) return { pose: lerpPose(m.start, m.end, ease(t / t1)), phase: 0, progress: t / t1 }
  t -= t1
  if (t < h1) return { pose: m.end, phase: 1, progress: t / h1 }
  t -= h1
  if (t < t2) return { pose: lerpPose(m.end, m.start, ease(t / t2)), phase: 2, progress: t / t2 }
  t -= t2
  return { pose: m.start, phase: 3, progress: h2 ? t / h2 : 1 }
}

export function cycleSeconds(m: Motion): number {
  return m.tempo.reduce((a, b) => a + b, 0)
}

/* ── Biblioteca de movimientos ─────────────────────────────────────────── */

const standLegs = (x: number): Pick<Pose, 'leg' | 'leg2'> => ({ leg: { end: [x + 4, FLOOR - 2], bend: -1 }, leg2: { end: [x - 4, FLOOR - 2], bend: -1 } })
const standHip = (x: number): Pt => [x, FLOOR - 2 - SEG.thigh - SEG.shin + 0.5]
const bench = (x1: number, x2: number, y: number): Pt[] => [[x1, y], [x2, y], [x2, y + 4], [x1, y + 4]]
const backrest = (hip: Pt, angle: number, len: number): Pt[] => {
  const top = add(hip, angle, len)
  const n = dir(angle + 90)
  // Lado opuesto a la espalda del atleta.
  const o = 4
  return [hip, top, [top[0] - n[0] * o, top[1] - n[1] * o], [hip[0] - n[0] * o, hip[1] - n[1] * o]]
}

function inclinePress(id: string, label: string, incline: number, load: LoadKind): Motion {
  const hip: Pt = [76, 80]
  const torso = -90 - incline
  const sh = add(hip, torso, SEG.torso)
  const up = dir(180)
  const top: Pt = [sh[0] + 3, sh[1] + up[1] * 30]
  const chest: Pt = [sh[0] + 6, sh[1] - 9]
  const legs: Pick<Pose, 'leg'> = { leg: { end: [108, FLOOR - 2], bend: -1 } }
  return {
    id,
    label,
    view: 'side',
    start: { hip, torso, arm: { end: top, bend: 1 }, ...legs },
    end: { hip, torso, arm: { end: chest, bend: 1 }, ...legs },
    load,
    equipment: { shapes: [backrest([hip[0] + 2, hip[1] + 4], torso, 40), bench(64, 92, hip[1] + 4)], lines: [[[78, hip[1] + 8], [78, FLOOR]]] },
    tempo: [3, 1, 1, 0.6],
    phases: ['Baja en 3 s', 'Pausa 1 s abajo', 'Empuja', 'Arriba'],
    cues: ['Escápulas juntas y pecho alto', 'Codos a ~45° del torso', 'Toca la parte alta del pecho sin rebotar'],
  }
}

const MOTIONS: Record<string, Motion> = {}
const def = (m: Motion) => (MOTIONS[m.id] = m)

def(inclinePress('press-inclinado', 'Press inclinado', 30, 'db'))
def(inclinePress('press-inclinado-barra', 'Press inclinado en Multipower', 30, 'bar'))
def(inclinePress('press-plano', 'Press plano', 0, 'db'))

def({
  id: 'cruces',
  label: 'Cruces en polea',
  view: 'side',
  start: { hip: standHip(80), torso: 172, arm: { a1: -35, a2: -20 }, ...standLegs(80) },
  end: { hip: standHip(80), torso: 172, arm: { a1: 115, a2: 128 }, ...standLegs(80) },
  load: 'handle',
  equipment: { cable: [26, 96], lines: [[[22, 8], [22, FLOOR]]] },
  tempo: [1, 1, 2, 0.4],
  phases: ['Cierra hacia el pecho', 'Aprieta 1 s', 'Abre controlado en 2 s', 'Estiramiento'],
  cues: ['Codos ligeramente flexionados y fijos', 'El movimiento sale del hombro, no del codo', 'Siente el estiramiento del pectoral atrás'],
})

def({
  id: 'pec-deck',
  label: 'Pec Deck',
  view: 'front',
  start: { hip: standHip(80), torso: 180, arm: { a1: 95, a2: 100 }, ...standLegs(80) },
  end: { hip: standHip(80), torso: 180, arm: { a1: 20, a2: -25 }, ...standLegs(80) },
  load: 'handle',
  equipment: {},
  tempo: [1, 1, 2, 0.4],
  phases: ['Cierra los brazos', 'Aprieta 1 s', 'Abre en 2 s', 'Estiramiento'],
  cues: ['Brazos a la altura de la clavícula', 'Pecho alto, espalda pegada al respaldo'],
})

def({
  id: 'laterales',
  label: 'Elevaciones laterales',
  view: 'front',
  start: { hip: standHip(80), torso: 180, arm: { a1: 10, a2: 12 }, ...standLegs(80) },
  end: { hip: standHip(80), torso: 180, arm: { a1: 86, a2: 92 }, ...standLegs(80) },
  load: 'db',
  equipment: {},
  tempo: [1, 0.4, 2, 0.4],
  phases: ['Sube hasta el hombro', 'Arriba', 'Baja en 2 s', 'Abajo sin soltar tensión'],
  cues: ['Lidera con el codo, no con la mano', 'Sin encoger el trapecio ni balancearte', 'Detente a la altura del hombro'],
})

def({
  id: 'face-pull',
  label: 'Pájaros / Face pull',
  view: 'side',
  start: { hip: standHip(70), torso: 176, arm: { a1: 92, a2: 92 }, ...standLegs(70) },
  end: { hip: standHip(70), torso: 180, arm: { a1: -82, a2: 175 }, ...standLegs(70) },
  load: 'handle',
  equipment: { cable: [140, 33], lines: [[[144, 8], [144, FLOOR]]] },
  tempo: [1, 1, 2, 0.3],
  phases: ['Tira hacia afuera y atrás', 'Aprieta 1 s', 'Vuelve en 2 s', 'Brazos al frente'],
  cues: ['Codos altos, a la altura de los hombros', 'Junta los omóplatos al final', 'Sin echar el torso atrás'],
})

def({
  id: 'triceps-cabeza',
  label: 'Extensión de tríceps sobre la cabeza',
  view: 'side',
  start: { hip: standHip(84), torso: 160, arm: { a1: 160, a2: -10 }, leg: { end: [96, FLOOR - 2], bend: -1 }, leg2: { end: [64, FLOOR - 2], bend: -1 } },
  end: { hip: standHip(84), torso: 160, arm: { a1: 162, a2: 165 }, leg: { end: [96, FLOOR - 2], bend: -1 }, leg2: { end: [64, FLOOR - 2], bend: -1 } },
  load: 'handle',
  equipment: { cable: [24, 98], lines: [[[20, 8], [20, FLOOR]]] },
  tempo: [1, 0.5, 2, 0.6],
  phases: ['Extiende los codos', 'Bloquea', 'Baja en 2 s', 'Estiramiento máximo'],
  cues: ['Codos fijos apuntando al frente', 'Baja hasta sentir el estiramiento detrás del brazo'],
})

def({
  id: 'pushdown',
  label: 'Extensión de tríceps en polea',
  view: 'side',
  start: { hip: standHip(72), torso: 172, arm: { a1: 6, a2: 140 }, ...standLegs(72) },
  end: { hip: standHip(72), torso: 172, arm: { a1: 6, a2: 8 }, ...standLegs(72) },
  load: 'handle',
  equipment: { cable: [96, 8], lines: [[[100, 6], [100, FLOOR]]] },
  tempo: [1, 0.5, 2, 0.3],
  phases: ['Empuja hacia abajo', 'Bloquea', 'Sube en 2 s', 'Arriba'],
  cues: ['Codos pegados a los costados', 'Solo se mueven los antebrazos'],
})

const pulldownHip: Pt = [72, 86]
def({
  id: 'jalon',
  label: 'Jalón al pecho',
  view: 'side',
  start: { hip: pulldownHip, torso: 192, arm: { end: [70, 12], bend: 1 }, leg: { end: [94, FLOOR - 2], bend: -1 } },
  end: { hip: pulldownHip, torso: 198, arm: { end: [66, 46], bend: 1 }, leg: { end: [94, FLOOR - 2], bend: -1 } },
  load: 'bar',
  equipment: { cable: [70, 0], kneePad: true, shapes: [bench(54, 86, 90)], lines: [[[70, 94], [70, FLOOR]]] },
  tempo: [1, 0.5, 2, 0.5],
  phases: ['Lleva los codos a las costillas', 'Aprieta', 'Sube en 2 s', 'Estira arriba'],
  cues: ['Pecho alto y ligera inclinación atrás', 'Tira con los codos, no con las manos', 'Estira por completo arriba'],
})

const rowHip: Pt = [62, 84]
def({
  id: 'remo-apoyado',
  label: 'Remo con pecho apoyado',
  view: 'side',
  start: { hip: rowHip, torso: 132, arm: { end: [96, 94], bend: -1 }, leg: { end: [84, FLOOR - 2], bend: -1 } },
  end: { hip: rowHip, torso: 132, arm: { end: [80, 70], bend: -1 }, leg: { end: [84, FLOOR - 2], bend: -1 } },
  load: 'handle',
  equipment: { shapes: [backrest([rowHip[0] + 10, rowHip[1] + 2], 132, 34), bench(50, 72, 88)], lines: [[[62, 92], [62, FLOOR]]] },
  tempo: [1, 1, 2, 0.4],
  phases: ['Tira hacia la cadera', 'Aprieta 1 s', 'Baja en 2 s', 'Estira los omóplatos'],
  cues: ['Pecho pegado al apoyo', 'Codos a ~45°', 'Estira los omóplatos al frente al bajar'],
})

def({
  id: 'remo-polea',
  label: 'Remo en polea baja',
  view: 'side',
  start: { hip: [56, 88], torso: 166, arm: { end: [104, 64], bend: -1 }, leg: { end: [102, 94], bend: -1 } },
  end: { hip: [56, 88], torso: 184, arm: { end: [64, 70], bend: -1 }, leg: { end: [102, 94], bend: -1 } },
  load: 'handle',
  equipment: { cable: [150, 70], shapes: [bench(36, 76, 92), [[104, 86], [108, 86], [108, 100], [104, 100]]], lines: [[[150, 60], [150, FLOOR]]] },
  tempo: [1, 1, 2, 0.4],
  phases: ['Codo pegado hacia la cadera', 'Aprieta 1 s', 'Vuelve en 2 s', 'Estira'],
  cues: ['Codo pegado al torso', 'Torso estable: no te balancees'],
})

def({
  id: 'curl-predicador',
  label: 'Curl predicador',
  view: 'side',
  start: { hip: [56, 88], torso: 176, arm: { a1: 48, a2: 58 }, leg: { end: [86, FLOOR - 2], bend: -1 } },
  end: { hip: [56, 88], torso: 176, arm: { a1: 48, a2: 175 }, leg: { end: [86, FLOOR - 2], bend: -1 } },
  load: 'bar',
  equipment: { shapes: [[[62, 58], [82, 78], [80, 82], [60, 62]], bench(40, 70, 92)], lines: [[[78, 82], [78, FLOOR]]] },
  tempo: [1, 0.5, 2, 0.3],
  phases: ['Sube', 'Aprieta', 'Baja en 2 s', 'Casi extendido'],
  cues: ['Brazo apoyado entero en el banco', 'Sin rebotar abajo'],
})

def({
  id: 'curl',
  label: 'Curl de bíceps',
  view: 'side',
  start: { hip: standHip(78), torso: 180, arm: { a1: 2, a2: 4 }, ...standLegs(78) },
  end: { hip: standHip(78), torso: 180, arm: { a1: 8, a2: 160 }, ...standLegs(78) },
  load: 'db',
  equipment: {},
  tempo: [1, 0.5, 2, 0.3],
  phases: ['Sube', 'Aprieta', 'Baja en 2 s', 'Abajo'],
  cues: ['Codos quietos junto al cuerpo', 'Sin balanceo del torso'],
})

def({
  id: 'curl-inclinado',
  label: 'Curl inclinado',
  view: 'side',
  start: { hip: [80, 84], torso: -145, arm: { a1: -6, a2: -6 }, leg: { end: [108, FLOOR - 2], bend: -1 } },
  end: { hip: [80, 84], torso: -145, arm: { a1: -4, a2: 150 }, leg: { end: [108, FLOOR - 2], bend: -1 } },
  load: 'db',
  equipment: { shapes: [backrest([82, 88], -145, 42), bench(66, 94, 88)], lines: [[[80, 92], [80, FLOOR]]] },
  tempo: [1, 0.5, 2, 0.5],
  phases: ['Sube', 'Aprieta', 'Baja en 2 s', 'Estiramiento'],
  cues: ['Brazos colgando por detrás del torso', 'El codo no se adelanta'],
})

def({
  id: 'press-militar',
  label: 'Press militar sentado',
  view: 'side',
  start: { hip: [70, 88], torso: 186, arm: { end: [74, 44], bend: 1 }, leg: { end: [96, FLOOR - 2], bend: -1 } },
  end: { hip: [70, 88], torso: 186, arm: { end: [70, 16], bend: 1 }, leg: { end: [96, FLOOR - 2], bend: -1 } },
  load: 'db',
  equipment: { shapes: [backrest([66, 92], 190, 42), bench(56, 84, 92)], lines: [[[70, 96], [70, FLOOR]]] },
  tempo: [1, 0.3, 2, 0.4],
  phases: ['Empuja arriba', 'Arriba', 'Baja en 2 s', 'Mentón'],
  cues: ['Respaldo ligeramente inclinado', 'Baja hasta la altura de las orejas o el mentón'],
})

def({
  id: 'fondos',
  label: 'Fondos en paralelas',
  view: 'side',
  start: { hip: [76, 62], torso: 176, arm: { end: [81, 61], bend: -1 }, leg: { a1: 15, a2: -95 } },
  end: { hip: [72, 80], torso: 160, arm: { end: [81, 61], bend: -1 }, leg: { a1: 15, a2: -95 } },
  load: 'none',
  equipment: { lines: [[[66, 63], [102, 63]], [[98, 63], [98, FLOOR]]] },
  tempo: [2, 0.4, 1, 0.4],
  phases: ['Baja en 2 s', 'Abajo', 'Empuja', 'Bloquea'],
  cues: ['Torso erguido para cargar el tríceps', 'Baja hasta ~90° de codo'],
})

def({
  id: 'sentadilla',
  label: 'Sentadilla hack / prensa',
  view: 'side',
  start: { hip: [82, 66], torso: 170, arm: { a1: 160, a2: -60 }, leg: { end: [92, FLOOR - 2], bend: -1 } },
  end: { hip: [66, 94], torso: 150, arm: { a1: 160, a2: -60 }, leg: { end: [92, FLOOR - 2], bend: -1 } },
  load: 'none',
  equipment: { shapes: [[[84, 108], [104, 108], [104, FLOOR], [84, FLOOR]]] },
  tempo: [3, 0.4, 1, 0.5],
  phases: ['Baja en 3 s', 'Profundidad máxima', 'Empuja', 'Arriba'],
  cues: ['Talones apoyados todo el recorrido', 'Rodillas en la línea de los pies', 'Rompe la paralela sin despegar la pelvis'],
})

def({
  id: 'curl-femoral-sentado',
  label: 'Curl femoral sentado',
  view: 'side',
  start: { hip: [60, 80], torso: 182, arm: { a1: 40, a2: 60 }, leg: { a1: 90, a2: 88 } },
  end: { hip: [60, 80], torso: 182, arm: { a1: 40, a2: 60 }, leg: { a1: 90, a2: -5 } },
  load: 'none',
  equipment: { anklePad: true, shapes: [bench(46, 82, 84), backrest([48, 84], 190, 36), [[66, 72], [86, 72], [86, 76], [66, 76]]], lines: [[[60, 88], [60, FLOOR]]] },
  tempo: [1, 1, 2, 0.4],
  phases: ['Flexiona', 'Aprieta 1 s', 'Extiende en 2 s', 'Isquios estirados'],
  cues: ['Pelvis fija con la almohadilla del muslo', 'Inclina el torso adelante para estirar más los isquios'],
})

def({
  id: 'curl-femoral-tumbado',
  label: 'Curl femoral tumbado',
  view: 'side',
  start: { hip: [76, 82], torso: -86, arm: { end: [28, 92], bend: 1 }, leg: { a1: 90, a2: 92 } },
  end: { hip: [76, 82], torso: -86, arm: { end: [28, 92], bend: 1 }, leg: { a1: 92, a2: 205 } },
  load: 'none',
  equipment: { anklePad: true, shapes: [bench(26, 104, 88)], lines: [[[40, 92], [40, FLOOR]], [[96, 92], [96, FLOOR]]] },
  tempo: [1, 1, 2, 0.4],
  phases: ['Flexiona', 'Aprieta 1 s', 'Baja en 2 s', 'Extensión completa'],
  cues: ['Cadera clavada al banco', 'Baja hasta extender la rodilla por completo'],
})

def({
  id: 'extension-cuadriceps',
  label: 'Extensiones de cuádriceps',
  view: 'side',
  start: { hip: [60, 82], torso: 186, arm: { a1: 20, a2: 20 }, leg: { a1: 90, a2: -12 } },
  end: { hip: [60, 82], torso: 186, arm: { a1: 20, a2: 20 }, leg: { a1: 88, a2: 90 } },
  load: 'none',
  equipment: { anklePad: true, shapes: [bench(44, 84, 86), backrest([48, 86], 196, 36)], lines: [[[62, 90], [62, FLOOR]]] },
  tempo: [1, 1, 2, 0.3],
  phases: ['Extiende', 'Pausa 1 s arriba', 'Baja en 2 s', 'Abajo'],
  cues: ['Espalda pegada al respaldo', 'Pausa arriba apretando el cuádriceps'],
})

def({
  id: 'rumano',
  label: 'Peso muerto rumano',
  view: 'side',
  start: { hip: [76, 64], torso: 180, arm: { a1: 2, a2: 2 }, leg: { end: [80, FLOOR - 2], bend: -1 } },
  end: { hip: [62, 64], torso: 98, arm: { a1: 4, a2: 4 }, leg: { end: [80, FLOOR - 2], bend: -1 } },
  load: 'bar',
  equipment: {},
  tempo: [3, 0.5, 1, 0.5],
  phases: ['Cadera atrás en 3 s', 'Tensión de isquios', 'Sube empujando la cadera', 'Arriba'],
  cues: ['Espalda neutra todo el recorrido', 'Rodillas semiflexionadas y fijas', 'La barra pegada a las piernas'],
})

def({
  id: 'gemelo-pie',
  label: 'Elevación de talones de pie',
  view: 'side',
  start: { hip: [78, 61], torso: 180, arm: { a1: 160, a2: -40 }, leg: { a1: 2, a2: 0 }, heel: 18 },
  end: { hip: [78, 51], torso: 180, arm: { a1: 160, a2: -40 }, leg: { a1: 2, a2: 0 }, heel: -32 },
  load: 'none',
  equipment: { shapes: [[[80, 106], [104, 106], [104, FLOOR], [80, FLOOR]]], lines: [[[60, 26], [96, 26]]] },
  tempo: [1, 1, 1.5, 2],
  phases: ['Sube de puntillas', 'Contrae arriba', 'Baja', 'Pausa 2 s en el fondo'],
  cues: ['Pausa de 2 s abajo para quitar el rebote del tendón', 'Rodillas casi extendidas'],
})

def({
  id: 'gemelo-sentado',
  label: 'Elevación de talones sentado',
  view: 'side',
  start: { hip: [60, 82], torso: 180, arm: { a1: 40, a2: 70 }, leg: { a1: 90, a2: 2 }, heel: 18 },
  end: { hip: [60, 76], torso: 180, arm: { a1: 40, a2: 70 }, leg: { a1: 96, a2: 4 }, heel: -30 },
  load: 'none',
  equipment: { kneePad: true, shapes: [bench(44, 76, 86), [[80, 104], [100, 104], [100, FLOOR], [80, FLOOR]]] },
  tempo: [1, 1, 1.5, 2],
  phases: ['Sube', 'Contrae', 'Baja', 'Pausa 2 s abajo'],
  cues: ['Rodillas a 90°', 'Pausa estricta abajo'],
})

def({
  id: 'bulgara',
  label: 'Sentadilla búlgara',
  view: 'side',
  start: { hip: [76, 60], torso: 180, arm: { a1: 2, a2: 2 }, leg: { end: [96, FLOOR - 2], bend: -1 }, leg2: { end: [46, 80], bend: -1 } },
  end: { hip: [70, 80], torso: 174, arm: { a1: 4, a2: 4 }, leg: { end: [96, FLOOR - 2], bend: -1 }, leg2: { end: [46, 80], bend: -1 } },
  load: 'db',
  equipment: { shapes: [bench(30, 56, 82)], lines: [[[36, 86], [36, FLOOR]], [[50, 86], [50, FLOOR]]] },
  tempo: [2, 0.4, 1, 0.4],
  phases: ['Baja en 2 s', 'Abajo', 'Sube con la pierna de delante', 'Arriba'],
  cues: ['Torso erguido para el cuádriceps', 'El peso en la pierna de delante'],
})

def({
  id: 'zancada',
  label: 'Zancada hacia atrás',
  view: 'side',
  start: { hip: [86, 64], torso: 178, arm: { a1: 2, a2: 2 }, leg: { end: [92, FLOOR - 2], bend: -1 }, leg2: { end: [82, FLOOR - 2], bend: -1 } },
  end: { hip: [74, 86], torso: 166, arm: { a1: 6, a2: 6 }, leg: { end: [92, FLOOR - 2], bend: -1 }, leg2: { end: [44, FLOOR - 2], bend: -1 } },
  load: 'db',
  equipment: {},
  tempo: [1.5, 0.4, 1, 0.4],
  phases: ['Paso largo atrás', 'Abajo', 'Vuelve empujando con el talón', 'Pies juntos'],
  cues: ['Torso algo inclinado para el glúteo', 'La rodilla de atrás casi roza el suelo'],
})

def({
  id: 'hip-thrust',
  label: 'Hip thrust',
  view: 'side',
  start: { hip: [80, 98], torso: -112, arm: { a1: 60, a2: 90 }, leg: { end: [104, FLOOR - 2], bend: -1 } },
  end: { hip: [82, 76], torso: -90, arm: { a1: 60, a2: 90 }, leg: { end: [104, FLOOR - 2], bend: -1 } },
  load: 'none',
  equipment: { hipBar: true, shapes: [bench(26, 52, 82)], lines: [[[38, 86], [38, FLOOR]]] },
  tempo: [1, 1, 2, 0.4],
  phases: ['Empuja la cadera', 'Aprieta 1 s', 'Baja en 2 s', 'Abajo'],
  cues: ['Mentón al pecho y costillas abajo', 'Espinillas verticales arriba'],
})

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Animación que corresponde a un ejercicio por su nombre (sirve también para ejercicios propios). */
export function motionFor(name: string): Motion | null {
  const n = norm(name)
  const has = (...k: string[]) => k.some((x) => n.includes(x))
  if (has('press inclinado')) return MOTIONS[has('multipower') && !has('mancuerna') ? 'press-inclinado-barra' : 'press-inclinado']
  if (has('press banca', 'press plano', 'press de banca')) return MOTIONS['press-plano']
  if (has('press militar', 'press de hombro')) return MOTIONS['press-militar']
  if (has('fondos', 'press cerrado')) return MOTIONS['fondos']
  if (has('pec deck', 'contractor')) return MOTIONS['pec-deck']
  if (has('cruce', 'aperturas')) return MOTIONS['cruces']
  if (has('elevaciones laterales', 'elevacion lateral')) return MOTIONS['laterales']
  if (has('pajaro', 'face pull', 'posterior')) return MOTIONS['face-pull']
  if (has('sobre la cabeza', 'frances', 'copa')) return MOTIONS['triceps-cabeza']
  if (has('pushdown', 'triceps en polea', 'extension de triceps')) return MOTIONS['pushdown']
  if (has('jalon', 'dominada')) return MOTIONS['jalon']
  if (has('remo') && has('polea')) return MOTIONS['remo-polea']
  if (has('remo')) return MOTIONS['remo-apoyado']
  if (has('predicador', 'scott')) return MOTIONS['curl-predicador']
  if (has('curl inclinado', 'bayesiano')) return MOTIONS['curl-inclinado']
  if (has('curl femoral')) return MOTIONS[has('tumbado', 'acostado') ? 'curl-femoral-tumbado' : 'curl-femoral-sentado']
  if (has('curl')) return MOTIONS['curl']
  if (has('bulgara')) return MOTIONS['bulgara']
  if (has('zancada', 'lunge')) return MOTIONS['zancada']
  if (has('hip thrust', 'pies altos', 'puente')) return MOTIONS['hip-thrust']
  if (has('extensiones de cuadriceps', 'extension de cuadriceps')) return MOTIONS['extension-cuadriceps']
  if (has('peso muerto', 'rumano')) return MOTIONS['rumano']
  if (has('talones sentado', 'soleo')) return MOTIONS['gemelo-sentado']
  if (has('talones', 'gemelo')) return MOTIONS['gemelo-pie']
  if (has('hack', 'sentadilla', 'prensa')) return MOTIONS['sentadilla']
  return null
}

export const ALL_MOTIONS = MOTIONS
