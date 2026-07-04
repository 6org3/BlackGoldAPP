# Baremos científicos — auditoría de fuentes

**Fecha:** 2026-07-02 · **Estado:** primera pasada de auditoría, no una validación completa.

`baremos.js` cita como fuente "NSCA, FitnessGram, NBA Combine, NIH/PubMed" pero ese
documento de respaldo nunca existió en el repo — este archivo es el primer intento real
de dejar un rastro auditable. No reconstruye el origen de cada uno de los ~80 umbrales
(20 pruebas × 4 categorías); documenta lo que se investigó al auditar el motor para el
loop Evaluación→Misión→XP (`docs/spec_loop_misiones_baremo.md`) y qué falta.

## 1. Género — brecha confirmada, no implementada

**Hallazgo de código:** `normalizarValor()` tenía un parámetro `genero` (default
`'Masculino'`) que no hacía nada — ningún umbral en `BAREMOS` está anidado por sexo, así
que el fallback siempre resolvía al mismo objeto sin importar el género pasado. Ningún
call site (`EvaluacionModal.jsx`, tests) llegó a pasarlo tampoco. Se eliminó el parámetro
en esta auditoría (ver `baremos.js`) para no aparentar un soporte que no existe.

**Evidencia de que sí importa:**
- FitnessGram (Cooper Institute) publica *Healthy Fitness Zone* separadas por sexo y
  edad para push-ups — los umbrales de niños y niñas divergen desde primaria. [FITNESSGRAM® Healthy Fitness Zone Performance Standards](https://californiaops.org/wp-content/uploads/2024/06/hfz-standards.pdf)
- En básquet juvenil, los varones muestran mayor impulso concéntrico, potencia media y
  altura de salto (CMJ) que las mujeres en el mismo rango de edad — afecta directamente
  `cmj_salto`, la prueba de explosividad más usada del catálogo. [Sex-Specific Differences in Vertical Jump Force–Time Metrics in Youth Basketball Players](https://ouci.dntb.gov.ua/en/works/lxLrrmgP/)

**Qué falta para implementarlo de verdad (no es solo código):**
1. Capturar el género del atleta — no existe columna `genero`/`sexo` en `usuarios` ni `atletas` hoy.
2. Umbrales por sexo para cada prueba física (fuerza/explosividad principalmente;
   movilidad y técnica requieren revisión caso por caso), respaldados por fuente citable.
3. Decisión de producto sobre cómo tratar categorías no binarias / datos faltantes.

Esto es una iniciativa aparte, no algo para resolver dentro del loop de misiones — se
deja documentado aquí para que quede en el radar del equipo técnico/científico.

## 2. Umbrales idénticos en las 4 categorías de edad — revisar

`dorsiflexion`, `cadera_ri`, `cadera_re`, `hombro_re`, `hombro_ri` repiten exactamente
los mismos 4 umbrales en Sub12/Sub15/Sub18/Senior. Es plausible que el rango de movimiento
articular (en grados) sea más estable entre categorías que la fuerza o la potencia, pero
la evidencia encontrada apunta a que sí varía, aunque modestamente:

- Rango de rotación de cadera clínicamente reportado: "Hip rotation ROM was reduced with
  age... 4.7° less in [older subjects]" — hay una tendencia con la edad, no es plano.
  [Clinical evaluation of hip joint rotation range of motion in adults](https://www.sciencedirect.com/science/article/pii/S187705681100288X)

**Conclusión:** no hay evidencia de que estos 5 umbrales idénticos-por-4 sean incorrectos,
pero tampoco hay confirmación de que fueron investigados por categoría — el patrón (misma
fila copiada 4 veces, en 5 pruebas distintas) es consistente con "se usó un único set de
normas clínicas de adulto sin diferenciar por edad". **Pendiente: validar con el cuerpo
técnico del club** (mismo estándar de honestidad que ya usa `categoriaABucketBaremo` en
`baremos.js` para su propio mapeo).

## 3. `sit_reach` — salto brusco Sub15 → Sub18, verificar contra la fuente

De `Sub15: [-5,-1,4,9]` a `Sub18: [4,6,10,13]` (el umbral "excellent" sube +9). La
literatura de desarrollo adolescente documenta una **pérdida temporal** de flexibilidad
durante el pico de velocidad de crecimiento (PHV) — el hueso crece más rápido que el
complejo músculo-tendón — con recuperación y ganancia neta recién *después* del pico:

> "Levels of flexibility tend to temporarily plateau or even decrease at the time of the
> adolescent growth spurt... around 6 months before and after PHV, reduced flexibility is
> observed in the lower limbs." — [Is There a "Window of Opportunity" for Flexibility Development in Youth?](https://pmc.ncbi.nlm.nih.gov/articles/PMC9259532/)

Esto no invalida necesariamente los números actuales (el PHV en varones suele ocurrir
~12-14 años, es decir dentro del rango Sub15, y la ganancia neta que se ve en Sub18 podría
corresponder al período post-PHV que la misma fuente describe) — pero el salto es lo
bastante grande como para merecer una revisión explícita contra la fuente original antes
de usarlo para generar misiones de movilidad.

## 4. Riesgo estructural: el catálogo que usa la app en vivo puede estar desincronizado de este archivo

`EvaluacionModal.jsx` no llama a `normalizarValor()` con los umbrales de este archivo
directamente — usa `catalogo_ejercicios`, una tabla de Supabase poblada **una sola vez**
por `Dashboard_Premium/scripts/generate_baremos_sql.js` a partir de una copia antigua de
`BAREMOS`. Ese script:

- Lee `src/lib/baremosEngine.js` buscando el patrón `const BAREMOS = {...}` con una
  expresión regular + `eval()`.
- Ese patrón **ya no existe** en `baremosEngine.js` — es un shim que hace
  `export * from '../../../packages/analytics-core/baremos.js'` desde la extracción a
  `analytics-core`. El script está roto (fallaría con "No se pudo extraer BAREMOS" si se
  corriera hoy).

**Implicación:** cualquier corrección hecha en `packages/analytics-core/baremos.js`
después del seed original (incluyendo el propio mapeo `categoriaABucketBaremo` de v20, o
los umbrales que se corrijan a partir de esta auditoría) **no se propaga automáticamente**
a lo que la app usa en producción para evaluar atletas. Auditar los números de este
archivo no garantiza que sean los números reales en uso hasta que se resuelva esta
desincronización — es un hallazgo fuera del alcance original de esta auditoría, pero
bloquea que la auditoría tenga efecto práctico. Recomendado como siguiente paso antes de
confiar en cualquier corrección numérica futura de `BAREMOS`.

## 5. Banda de tier con ancho cero (menor, cosmético)

`dominadas` en `Sub12: [0, 0, 3, 8]` — con `t1=t2=0`, el tier `below_avg` es
matemáticamente inalcanzable: un atleta pasa de "Debe Mejorar" (0 dominadas) directo a
"Promedio" (1 dominada). Podría ser intencional (muchos niños de esa edad hacen 0
dominadas, es un umbral de suelo razonable), pero vale la pena una revisión rápida.

## Resumen de acciones tomadas en esta auditoría

- ✅ Eliminado el parámetro `genero` no funcional de `normalizarValor()` (ver `baremos.js`).
- ✅ El fallback silencioso "sin baremo para este bucket → tier poor / puntuación 0" ahora
  devuelve `{ noAplica: true, mensajeNoAplica }` explícito; `EvaluacionModal.jsx` bloquea
  el guardado y muestra el motivo en vez de registrar un score fantasma.
- ⏳ Pendiente (fuera de este turno): puntos 2, 3, 4 y 5 de este documento — decisiones de
  producto/ciencia o trabajo de ingeniería más amplio, no cambios de código acotados.
