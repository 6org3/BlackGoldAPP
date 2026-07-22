# Revisión científica de baremos por edades — 2026-07-22

Revisión de las 20 pruebas del catálogo de evaluación contra literatura en español e inglés, encargada por el owner (2026-07-22). Metodología: un agente investigador por prueba (PubMed, EUROFIT/Tomkinson, FitnessGram/President's Council, ACSM/Cooper, FIBA, FUPRECOL, estudios ecuatorianos) + verificación adversarial independiente de TODA propuesta de ajuste (¿las fuentes existen y dicen eso? ¿los cortes se derivan de los datos? ¿estructura válida? ¿cambio sustancial >10%?). Solo se aplicó lo que sobrevivió a la verificación.

## Resultado global

| Prueba | Veredicto | Acción |
|---|---|---|
| cmj_salto | Ajuste APROBADO | Cortes nuevos (Sub15/18/Senior) |
| sit_reach | Ajuste APROBADO | Cortes nuevos (4 buckets) |
| course_navette | Ajuste APROBADO | Cortes nuevos (toda la matriz) |
| sentadilla_rel | Ajuste aprobado CON CAMBIOS | Cortes nuevos (Sub15/18/Senior) |
| hombro_re | Ajuste aprobado CON CAMBIOS | Solo rotación externa |
| dominadas | RATIFICADA (President's Challenge p50/p85/p95 calzan) | Sin cambios |
| pushups_max | RATIFICADA (percentiles President's Council casi exactos) | Sin cambios |
| press_banca_rel | RATIFICADA (Cooper/ACE p20-p80 calzan) | Sin cambios |
| dorsiflexion | RATIFICADA (Merino-Marbán N=693 baloncesto 10-17: categorías casi idénticas) | Sin cambios |
| pistol_single_squat | RATIFICADA (sin normativa científica de reps; solo crowdsourced) | Sin cambios |
| carrera_600m_vinueza | RATIFICADA contra el estudio nacional ecuatoriano | Sin cambios |
| carrera_1000m_vinueza | Ajuste RECHAZADO por verificación | Sin cambios |
| yoyo_ir1 | Ajuste RECHAZADO (fuente mal atribuida) | Sin cambios |
| tiro_libre | RATIFICADA (Zuzik 2011 por edad/sexo, minibasket FEB, ACB) | Sin cambios |
| tiro_media | RATIFICADA (estudio directo 15.7±0.9 años, 5m: 42.3%±14.8 → cortes Sub18 casi exactos) | Sin cambios |
| tiro_3pts | Ajuste RECHAZADO (3 de 6 citas del investigador mal atribuidas/fabricadas) | Sin cambios |
| lane_agility | Ajuste RECHAZADO (fuentes reales pero cambio no sustancial) | Sin cambios |
| zigzag_balon | SIN EVIDENCIA (prueba propia del club; no existe test estandarizado con esa unidad) | Sin cambios |
| cadera_ri / cadera_re | Ajuste RECHAZADO (ambigüedad de protocolo sentado/prono sin resolver) | Sin cambios |
| hombro_ri | Ajuste RECHAZADO (el verificador solo aprobó la ER) | Sin cambios |
| eficiencia_tactica / resiliencia | Ratings subjetivos del coach 0-100 — fuera del alcance (sin normativa posible) | Sin cambios |

## Cortes aplicados (detalle y fuentes)

- **CMJ** (protocolo: manos en cadera; con brazos libres sumar ~5-8 cm): Sub15 [27,31,36,41], Sub18 [32,37,42,48], Senior [34,39,44,50]. Los cortes previos de Senior exigían la media NBA (68.7 cm, PMC7504515) para "excellent" y clasificaban "poor" a un profesional ACB medio (39.2 cm, PMC12121892). Juveniles: PMC8222820 (baloncesto portugués, P50 12a=29.8 → 16a=35.8).
- **Sit & Reach** (convención 0 = punta del pie): Sub12 [0,4,9,13], Sub15 [-1,3,8,12], Sub18 [0,4,9,13], Senior [-2,2,8,13]. Los previos mezclaban norma masculina (Sub12/15) y femenina (Sub18/Senior) con un salto de +5-8 cm entre buckets fisiológicamente injustificado. Fuente: Tomkinson 2018 (BJSM, n=2.78M, EUROFIT convertido de caja +15 cm).
- **Course Navette** (paliers): matriz completa F/M × bucket × nivel recalibrada con Tomkinson 2017 (n=1.14M, 50 países), FUPRECOL (Latinoamérica) y PACER. La capa Desarrollo ≈ mediana poblacional; la meseta puberal femenina (las chicas no progresan tras ~12 años como los chicos) ahora se respeta; "excellent" de Elite pasó de p99+ inalcanzable a ~p90-p95.
- **Sentadilla relativa**: Sub15 [0.45,0.7,1.0,1.3], Sub18 [0.85,1.15,1.45,1.75], Senior [0.85,1.15,1.5,1.99] (Sub12 igual). PMC9140541: en 492 futbolistas juveniles ninguno superó 2.0×BW; los cortes previos de Sub15 exigían de entrada el promedio de 16-17 años. Nota: 1RM directo en Sub12 es cuestionable — preferir estimación por repeticiones submáximas.
- **Rotación externa de hombro**: [80,86,92,98] (protocolo: 90° de abducción). Con los previos, un hombro NORMAL (~90° AAOS) clasificaba above_avg.

## La batería Vinueza, identificada

La fuente es con alta probabilidad **"Normas de detección masiva de posibles talentos deportivos en Ecuador"** (Romero Frómeta, Bacallao Ramos, **Vinueza Tapia**, Chávez Cevallos y Vaca García, 2015) — el estudio nacional FEDENADOR/Ministerio del Deporte (2012-2013, N=1266, edades 9-10 y 11-12) que usa exactamente 600m hasta los 10 años y 1000m en 11-12, con percentiles 1-10 por sexo. Los cortes provisionales de 600m quedaron RATIFICADOS contra ese anclaje y normativos internacionales; los de 1000m se mantienen (el ajuste propuesto no sobrevivió la verificación). **Pendiente del owner**: si tiene las tablas numéricas originales del manual (foto/PDF), contrastarlas celda por celda sería el cierre definitivo.

## Hallazgos transversales (decisiones pendientes del owner)

1. **Separación por sexo**: 10+ investigadores independientes la recomiendan desde Sub15 — el dimorfismo es grande en CMJ, dominadas, push-ups (mediana 17 años: varones 37 vs mujeres 16), sit&reach (brecha que se ENSANCHA con la edad) y rotación de cadera (~9-13° más de RI en niñas). Hoy solo resistencia tiene tablas por sexo. `resolverUmbrales` ya soporta capas de género → técnicamente viable; es decisión de producto + trabajo de catálogo. PROPUESTA: fase siguiente. **→ EJECUTADO (2026-07-22): 8 pruebas separadas por sexo desde Sub15, 5 quedaron unisex tras verificación adversarial (incluida `cadera_ri`, rechazada por ambigüedad de protocolo). Ver [`baremos_por_sexo_2026.md`](baremos_por_sexo_2026.md).**
2. **Protocolos a documentar por prueba** (los baremos solo tienen sentido con protocolo fijo): CMJ manos en cadera vs brazos libres (±5-8 cm); rotación de cadera sentado 90° vs prono (±8°); hombro a lado vs 90° abducción (±10°); sit&reach convención del cero.
3. **Arquitectura del scoring** (verificado en código): en runtime manda la tabla `catalogo_ejercicios` de la DB, no `baremos.js` — todo cambio de cortes requiere correr `Dashboard_Premium/scripts/sync_catalogo_ejercicios.mjs` (SIMULAR=false) tras el merge. `npm run functions:sync` es un sync distinto (bundle de Edge Functions).

## Trazabilidad

JSONs completos de ambas rondas (investigaciones, fuentes con URL y dato extraído, y veredictos de verificación) archivados en la sesión de trabajo del 2026-07-22. Ronda 1: 10 pruebas (fable + verificadores fable). Ronda 2: 10 pruebas + 2 verificaciones diferidas (sonnet, por límite de gasto de la cuenta).
