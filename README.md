# Aion Fitness

App web de entrenamiento con sobrecarga progresiva adaptativa. React 19 + TypeScript (strict) + Vite + Tailwind CSS, con Recharts, Framer Motion, Lucide, canvas-confetti y Zod. Todos los datos se guardan en `localStorage` (clave `aion-fitness:v1`) y se validan con Zod al cargar.

## Uso

```bash
npm install
npm run dev          # desarrollo en http://localhost:5173
npm test             # tests del motor de cálculo (Vitest)
npm run build        # build de producción en dist/
npm run build:single # un único index.html autocontenido en dist-single/
```

## Módulos

| Vista | Qué hace |
|---|---|
| Punto de inicio | Onboarding en 6 pasos: perfil, experiencia, frecuencia y duración (8/10/12 semanas), fuerza base con peso × reps × RPE y 1RM en vivo, objetivo y resumen con curva proyectada. Incluye modo demo. |
| Rutina | Rutina predeterminada Torso/Pierna de 4 días con el protocolo Calentamiento → Top Set (RIR 1–0) → Back-off (−10–15 %, RIR 0) [+LP]. Rangos, descansos, parciales y técnica editables por ejercicio; añadir, quitar y reordenar; restaurar la predeterminada. |
| Panel | Tonelaje semanal (vs semana anterior a la misma fecha), % de cumplimiento de sobrecarga, 1RM proyectado, sesiones de la semana, curva y prescripción de la semana. |
| Entrenar | Logger con ejercicios precargados con la prescripción del día, series editables, RPE, temporizador de descanso, detección de récords en vivo y confeti. |
| Progreso | Gráfico proyección original vs ajustada vs real sesión a sesión, descargas sombreadas y tabla del plan semanal. |
| Ejercicios | Catálogo con plantillas, ejercicios personalizados (grupo muscular, peso inicial, incremento semanal, peso corporal), archivar y eliminar. |
| Historial | Sesiones por semana con tonelaje, series, 1RM estimado y PRs. |
| Ajustes | Perfil, fórmula, discos, descanso, exportar/importar JSON, nuevo ciclo y reinicio. |

## Motor de cálculo (`src/lib`)

- **1RM** (`oneRepMax.ts`): Epley `w·(1+r/30)`, Brzycki `w·36/(37−r)` o promedio (Brzycki solo hasta 10 reps). El RPE se convierte en repeticiones en reserva (RIR = 10 − RPE) y se suman a las reps. `weightForReps` es la inversa exacta para prescribir cargas.
- **Proyección** (`program.ts`): la tasa semanal inicial sale del incremento deseado / carga de trabajo inicial (sugerido según experiencia × objetivo × frecuencia). Cada semana `g = r0 · decay^(k−1)` (rendimientos decrecientes); semanas de descarga cada 4–6 semanas sin crecimiento; la última semana nunca es descarga.
- **Prescripción**: fuerza progresa carga (5×5), hipertrofia progresa series (3→5 × 10), resistencia progresa repeticiones (15→20). RPE en rampa dentro del bloque; descarga = 60 % de las series a RPE 6. Pesos redondeados a los discos disponibles. Para peso corporal se resta el peso del atleta y se prescribe lastre.
- **Recálculo adaptativo**: con el mejor 1RM real de cada semana se ajusta por mínimos cuadrados el modelo `ln(1RM_w/1RM_0) = m · Σ ln(1+g)`, regularizado hacia `m = 1` con un prior de 2 semanas y acotado a [0, 2,5]. La proyección ajustada parte de la última semana con datos (mezcla 60/40 de dato real y modelo) con el multiplicador `m`. La prescripción de la semana en curso usa solo datos de semanas anteriores, así no cambia a mitad de semana.
- **Cumplimiento**: % de semanas-ejercicio (sin descargas) en las que el 1RM real alcanza al menos el 98 % del objetivo original.

## Rutina Top Set + Back-off (`src/lib/routine.ts`)

- **Top Set**: peso calculado para el centro del rango a RPE 9,5 (RIR ≈ 0,5) desde el 1RM objetivo de la semana. Si haces más reps que el rango, el 1RM real sube, el ajuste lo detecta y el peso sube.
- **Back-off**: Top Set × 0,875 (−12,5 %), redondeado a discos, al fallo (RPE 10), con 4 parciales [+LP] sugeridas cuando el ejercicio las lleva.
- **Calentamiento**: 3 aproximaciones (50/70/85 %) si el Top Set pesa ≥ 40 kg, si no 2 (60/80 %). No cuentan para 1RM ni tonelaje.
- **Descargas**: Top Set a RIR 3 y sin Back-off.
- **Calibración**: los ejercicios sin referencia toman como línea base su mejor serie de la primera sesión; desde ahí tienen curva propia.
- **Rotación**: el día sugerido es el siguiente al último día entrenado. Los ejercicios unilaterales cuentan ambos lados en el tonelaje.

## App Android (APK)

El proyecto incluye la app nativa de Android con Capacitor (`android/`). La web se empaqueta dentro del APK y funciona sin conexión; los datos se guardan en el teléfono. En Android, "Exportar copia" abre el menú Compartir para guardar el archivo.

- **GitHub Actions**: cada push a `main` compila el APK (`.github/workflows/android-apk.yml`) y lo deja como artefacto `aion-fitness-apk` en la pestaña Actions.
- **En tu ordenador** (requiere Android Studio): `npm install && npm run build && npx cap sync android`, luego `npx cap open android` y en Android Studio *Build → Build APK(s)*. El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
