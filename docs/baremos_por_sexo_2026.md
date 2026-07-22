# Baremos por sexo desde Sub15 — 2026-07-22

Fase siguiente a la [revisión científica por edades](baremos_revision_2026.md) (§Hallazgos
transversales #1). Encargada por el owner: separar los umbrales de evaluación por sexo a partir
de Sub15, porque el dimorfismo es grande en varias pruebas físicas y el umbral unisex (anclado en
datos masculinos) penalizaba sistemáticamente a las atletas mujeres — o, en flexibilidad, las
sobrevaloraba.

**Metodología (mismo estándar que julio):** un agente investigador por familia de prueba
(PubMed, EUROFIT/Tomkinson, FitnessGram/President's Council, ACSM/Cooper, powerlifting normativo,
combine NBA/WNBA, goniometría clínica) + **verificación adversarial independiente** de cada
propuesta (¿las fuentes existen y dicen eso? ¿los cortes se derivan de los datos? ¿estructura
válida? ¿brecha coherente?). Solo se aplicó lo que sobrevivió a la verificación. El motor ya
soportaba capas de género (`resolverUmbrales`, `packages/analytics-core/baremos.js`) y el runtime
ya pasaba `genero` (`EvaluacionModal.jsx`) — esta fase es **contenido**, no cambio de motor.

## Convención de estructura

Las 8 pruebas separadas pasan de `{ Sub12:[…], Sub15:[…], … }` a
`{ Masculino: { Sub12,Sub15,Sub18,Senior }, Femenino: { … } }`. **Sub12 queda unificado**
(idéntico en ambos sexos: dimorfismo pre-puberal mínimo — la separación es "desde Sub15").
**Masculino = el valor validado en julio 2026, sin cambios** (evita regresión para varones y
mantiene verdes los tests). Cuando no se conoce el género, el resolver cae a `Masculino`.

## Resultado global

| Prueba | Veredicto | Acción |
|---|---|---|
| `cmj_salto` | Ajuste APROBADO CON CAMBIOS | Femenino Sub15/18/Senior (Sub18/Senior rebajados en verificación) |
| `pushups_max` | APROBADO | Femenino Sub15/18/Senior (Senior extrapolado) |
| `pushups_30s` | APROBADO (confianza baja) | Femenino DERIVADO por ratio (sin fuente directa de 30s) |
| `dominadas` | APROBADO (confianza baja) | Femenino con piso realista (mayoría marca 0) |
| `sentadilla_rel` | APROBADO | Femenino Sub15/18/Senior (razón F/M ≈0.80) |
| `press_banca_rel` | APROBADO CON CAMBIOS | Femenino Sub18/Senior (rebajado: jugadoras reales ~0.54×BW) |
| `sit_reach` | APROBADO | Femenino > Masculino (mujeres más flexibles) |
| `lane_agility` | APROBADO CON CAMBIOS (confianza baja) | Femenino estimado por triangulación de tests de COD |
| `cadera_ri` | **RECHAZADO** | **Queda UNISEX** — delta no protocolo-agnóstico + baseline no comparable |
| `cadera_re` | RECHAZADO en investigación | Queda unisex — 4 fuentes discrepan en la dirección |
| `hombro_re` / `hombro_ri` | RECHAZADO en investigación | Quedan unisex — sin efecto por sexo con protocolo 90° en población general |
| `zigzag_balon` | SIN EVIDENCIA | Queda unisex — prueba propia del club, sin test estandarizado comparable |

Resistencia (`course_navette`, carreras Vinueza, `yoyo_ir1`) **ya estaba por sexo** desde antes.

## Cortes femeninos aplicados (Masculino = julio, sin cambios)

| Prueba | Unidad | Fem Sub15 | Fem Sub18 | Fem Senior |
|---|---|---|---|---|
| `cmj_salto` | cm | [22,25,28,31] | [24,28,31,34] | [27,30,33,36] |
| `pushups_max` | reps | [5,10,14,20] | [8,14,19,25] | [11,17,20,28] |
| `pushups_30s` | reps | [4,8,11,13] | [7,11,14,17] | [9,13,15,18] |
| `dominadas` | reps | [0,0,1,3] | [0,1,2,4] | [0,1,2,5] |
| `sentadilla_rel` | ×BW | [0.38,0.60,0.85,1.10] | [0.68,0.92,1.16,1.40] | [0.68,0.92,1.20,1.59] |
| `press_banca_rel` | ×BW | — | [0.35,0.49,0.65,0.82] | [0.44,0.58,0.75,0.98] |
| `sit_reach` | cm | [7,10,14,17] | [8,11,15,18] | [5,9,14,18] |
| `lane_agility` | s (menos=mejor) | [12.6,13.7,14.4,15.8] | [11.8,12.5,13.2,14.5] | [11.3,12.1,12.9,14.1] |

## Fuentes por prueba (verificadas en re-fetch adversarial)

- **CMJ** — Lesinski et al. 2020 (PLoS ONE, élite juvenil alemana, percentiles por sexo/edad,
  manos en cadera); Cabarkapa 2024 (Frontiers, U16/U18 femenino); Philipp 2023 (Sports, NCAA D1).
  Verificación: fuentes exactas, sin fabricación; **Sub18 y Senior rebajados** porque la primera
  propuesta inflaba la brecha F/M (~28% en Sub18) y anclaba Senior a una muestra NCAA de n=7.
- **Push-ups máx** — President's Council 1985 National School Population Fitness Survey
  (percentiles de flexiones en niñas, misma postura completa); corroborado por NCYFS (Boy Scouts).
  Brecha verificada textual: mediana 17a ♀16 vs ♂37. **Senior extrapolado** más allá del rango 17+.
- **Flexiones 30s** — sin normativa directa del test de 30s por sexo; **derivado** por el ratio
  30s/máx del masculino aplicado al femenino de push-ups. Confianza baja, revisar con datos del club.
- **Dominadas** — President's 1985 (niñas p50≈1), NCYFS chin-ups (p50=0), USMC PFT (min 1/máx 7);
  piso realista por declive secular. La cita puntual de Vanderburgh ("<25%") se retiró por no
  verificable; el paper existe pero esa cifra no se confirmó.
- **Sentadilla relativa** — van den Hoek 2024 (JSAMS, powerlifting n=809.986, razón F/M ≈0.80) y
  Nuzzo & Pinto 2026 (meta-análisis, tren inferior F/M=0.855). Verificado exacto; validado contra
  futbolistas universitarias (1.16×BW ≈ t3 Senior). Sub15 usa razón ≈0.85 (interpolación puberal).
- **Press banca relativo** — van den Hoek 2024 (razón F/M ≈0.70) + Nuzzo & Pinto (tren superior
  F/M=0.74). **Rebajado en verificación** porque el promedio real de jugadoras de baloncesto
  (~0.54×BW, Cabarkapa n=7) caía en el t1 de la primera propuesta → provisional, recalibrar con
  muestra propia.
- **Sit & Reach** — Canadian Health Measures Survey (Hoffmann/…/Tomkinson 2019, Health Reports,
  Tabla 3). Método: delta femenino−masculino DENTRO de la misma tabla (el offset de caja +26 cm se
  cancela en la resta), sumado al masculino validado. Verificado exacto; hallazgo: la brecha (~5-8
  cm) es ESTABLE con la edad, no se ensancha. Única prueba donde Femenino > Masculino.
- **Lane Agility** — no existe tabla pública de lane agility femenino; **estimación indirecta** por
  triangulación de tests de COD análogos por sexo (T-test Pauole et al. 2000; 505; Illinois). La
  verificación corrigió la atribución (Semenick→Pauole), retiró un anclaje WNBA no verificable, y
  la marcó como estimación de baja confianza — no medición directa.

## Por qué 5 pruebas quedaron unisex (fail-safe honesto)

- **`cadera_ri`** — RECHAZADA por la verificación: el dimorfismo direccional (mujeres +RI) es real,
  pero (a) el delta F−M solo es "más estable" que el valor crudo, no protocolo-agnóstico (Han 2015,
  única fuente que aísla protocolo, muestra 5.8-7.9° según sentado/prono, n=34); y (b) el baseline
  masculino del club (mediana 29°) está 7-17° por debajo de las poblaciones fuente (~36-46°), lo que
  indica que el protocolo de medición del club no es comparable — trasplantar un shift en grados
  repetiría el error de protocolo que ya hundió la recalibración por edad en julio.
- **`cadera_re`** — 4 fuentes discrepan en la dirección del dimorfismo (dos "sin diferencia", una
  invertida). No hay base citable consistente.
- **`hombro_re` / `hombro_ri`** — el único estudio de población general con el protocolo del club
  (90° abducción, Fleisig 2022 n=6635) no muestra efecto de sexo estable; las fuentes con efecto
  grande usan otro protocolo (brazo al lado) o población atleta overhead de élite (voleibol).
- **`zigzag_balon`** — prueba propia del club sin test estandarizado con esa unidad (COD/min); no
  existe normativa por sexo. Recomendación: recolectar N≥30 por sexo del propio club antes de separar.

Estas 5 son candidatas a revisión futura **con datos propios del club** (mismo protocolo, ambos
sexos), la vía correcta para el ROM y las pruebas caseras.

## Propagación y arquitectura

El scoring en vivo manda desde `catalogo_ejercicios` (BD), no desde `baremos.js`. Para llevar estos
cortes a producción: `npm run functions:sync` (regenera la copia Edge) y
`node Dashboard_Premium/scripts/sync_catalogo_ejercicios.mjs` con `SIMULAR=false` (UPDATE de
`thresholds` por `baremo_key`). El sync es shape-agnostic (copia profunda), así que la capa de
género viaja transparente. El runtime (`EvaluacionModal.jsx`) ya resuelve `genero: atleta?.genero`
(de `usuarios.genero || 'Masculino'`).

**Hallazgo colateral del sync:** la recalibración de julio de `hombro_re` ([70,79,87,94] →
[80,86,92,98], commit `3ce5525`, ya en main) nunca se había propagado a producción; el mismo sync
la reconcilia. También limpia `inputs_requeridos` sobrantes en 4 pruebas de resistencia.

## Trazabilidad

Reportes completos de investigación (7 agentes) y verificación adversarial (6 agentes) — con
fuentes, URLs, datos extraídos y veredictos — archivados en la sesión de trabajo del 2026-07-22.
