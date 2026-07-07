---
subpilares: [recuperacion]
---

# Recuperación, carga de entrenamiento y descanso del atleta joven

Guía operativa del sub-pilar **recuperacion** para entrenadores y staff de Black Gold (Sucumbíos, Ecuador). La recuperación es una señal de **disponibilidad y riesgo**, no una nota de rendimiento: su score de readiness NO entra al radar ni al overall del atleta (ver `packages/analytics-core/readiness.js` y `taxonomia.js`), sirve para **modular la carga** y asignar hábitos. Este documento fundamenta las misiones de recuperación del club y los triggers del check-in diario.

> [!NOTE]
> Reglas del club: el check-in diario captura tres métricas por atleta y día — `sueno_calidad` (1-10, más es mejor), `fatiga_fisica` (1-10, 10 = "al 100%") y `color_orina` (1-8, escala de Armstrong, menos es mejor). El score compuesto de readiness pondera sueño 40 %, fatiga 40 % e hidratación 20 %.

## Sueño del deportista joven: horas, higiene del sueño y rendimiento
<!-- subpilares: recuperacion -->

El sueño es el recuperador más potente y barato del atleta amazónico. La Academia Americana de Medicina del Sueño recomienda **8-10 horas diarias para adolescentes de 13 a 18 años** y 9-12 horas de 6 a 12 años, de forma regular, para promover salud y rendimiento óptimos (Paruthi et al., 2016). Dormir menos degrada la atención, el humor y el control motor fino del tiro.

El impacto en baloncesto está medido: cuando jugadores universitarios extendieron su sueño a ~10 h durante 5-7 semanas, la **precisión de tiros libres y triples subió alrededor de un 9 %** y el sprint de 84 m bajó de 16,2 a 15,5 s (Mah et al., 2011). Menos sueño = peor `sueno_calidad` en el check-in y, si cae a 3 o menos, dispara el trigger `sueno_deficiente`.

Higiene del sueño para el atleta joven (rutina del club):
- Horario fijo de acostarse y levantarse, también el fin de semana.
- Cortar pantallas 60 min antes; cuarto oscuro y lo más fresco posible (clima húmedo de Sucumbíos).
- Nada de cafeína ni entrenamiento neuromuscular intenso en las 3 h previas.
- Siesta corta (20-30 min) solo si la noche fue insuficiente, nunca cerca de la noche.

## Hidratación en clima amazónico: protocolo antes, durante y después del entrenamiento
<!-- subpilares: recuperacion -->

En Sucumbíos el calor húmedo reduce la evaporación del sudor y acelera la deshidratación: hay que beber **por protocolo, no por sed**, porque la sed aparece cuando ya se perdió ~2 % del peso corporal, umbral en que caen fuerza, velocidad y concentración (Sawka et al., 2007).

Protocolo ACSM adaptado al club (Sawka et al., 2007):
- **Antes:** 5-7 ml/kg de agua unas 4 horas antes de entrenar (un atleta de 50 kg ≈ 250-350 ml). Llegar con orina color 1-3.
- **Durante:** beber a intervalos regulares para limitar la pérdida de peso a menos del 2 %; en sesiones largas o de doble turno, añadir sodio (sales o bebida deportiva sencilla).
- **Después:** reponer **~1,25-1,5 litros por cada kg perdido** en la sesión (pesarse antes/después es el método más fiable).

Escala de color de orina 1-8 (Armstrong et al., 1994), la misma del check-in:
- 1-3: bien hidratado.
- 4: hidratación a vigilar → trigger `hidratacion_baja`.
- 5 o más: deshidratación severa → trigger `deshidratado_extremo`, reponer líquidos y electrolitos **antes** de entrenar.

Señales de alarma: boca seca, calambres, mareo, orina oscura y escasa, frecuencia cardiaca elevada en reposo.

## Fatiga y sobreentrenamiento: señales de alarma en jóvenes
<!-- subpilares: recuperacion -->

La fatiga acumulada mal gestionada lleva al sobreentrenamiento: caída sostenida del rendimiento, irritabilidad, sueño roto, más infecciones y desmotivación. En jóvenes el riesgo es mayor porque combinan crecimiento, colegio y deporte. El autoinforme diario detecta el problema antes que cualquier prueba de laboratorio (Hooper & Mackinnon, 1995).

**Índice de Hooper simplificado** (versión club): el atleta puntúa 1-7 cuatro ítems — calidad de sueño, fatiga, estrés y dolor muscular. La suma semanal y, sobre todo, su tendencia al alza es la señal a vigilar; cambios bruscos importan más que un valor aislado (Hooper & Mackinnon, 1995). Esto se refleja invertido en el check-in: peor sueño y fatiga bajan el score de readiness.

Dos estados de recuperación que el motor del club marca como críticos:
- **`sobreentrenamiento_activo`** (estado "Agotamiento Activo"): protocolo obligatorio de sueño 10-12 h, actividades de hobby para restaurar el sistema parasimpático y suspensión de la carga neuromuscular intensa.
- **`fatiga_silenciosa`** (estado "Fatiga Silenciosa"): reducir el volumen de entrenamiento un 30-40 %, monitorear frecuencia cardiaca en reposo y sueño; si persiste más de 7 días, derivar a evaluación médica.

Señales tempranas en el joven: peor humor, se "arrastra" en el calentamiento, pierde precisión de tiro y evita el contacto.

## Medición de la carga de entrenamiento: RPE de sesión y carga semanal
<!-- subpilares: recuperacion -->

Para dosificar hay que medir. El método más práctico y validado es el **RPE de sesión (sRPE)**: 30 minutos después de terminar, el atleta puntúa el esfuerzo global de 0 a 10 (escala CR-10), y la carga interna de esa sesión es (Foster et al., 2001):

**Carga (UA) = RPE × minutos de sesión.**

Ejemplo: 8 de RPE × 90 min = 720 unidades arbitrarias. Sumando las sesiones de la semana se obtiene la **carga semanal**, base para planificar progresiones y descargas.

Dos derivados útiles de Foster et al. (2001), en versión sencilla para el club:
- **Monotonía** = media diaria de carga de la semana ÷ su desviación estándar. Muy alta (>2) significa semanas "planas", sin días fáciles ni difíciles: peor recuperación aunque el total no sea enorme.
- **Strain (tensión)** = carga semanal × monotonía. Picos de strain preceden a lesiones y catarros. Se baja el strain metiendo variación: días duros y días verdaderamente suaves.

> [!NOTE]
> Trigger `rpe_extremo`: si el atleta reporta RPE ≥ 9 (esfuerzo al límite), el día toca recuperación activa, estiramiento y movilidad, no más carga. Trigger `percepcion_alterada`: si el atleta percibe RPE ≥ 8 pero el coach registró intensidad ≤ 5, sospechar fatiga sistémica acumulada o mala recuperación; revisar sueño, nutrición e hidratación.

## Relación carga aguda crónica y regla 3 a 1 de descarga
<!-- subpilares: recuperacion -->

Para saber si se sube la carga demasiado rápido se compara la **carga aguda** (la de esta semana) con la **carga crónica** (media de las últimas 3-4 semanas). El cociente entre ambas (ACWR) resume el equilibrio: valores entre **0,8 y 1,3** se asocian a menor riesgo de lesión, mientras que por encima de ~1,5 el riesgo sube (Gabbett, 2016).

La lectura práctica importa más que el número: **lo que lesiona es el salto brusco**, no el trabajo en sí. Un atleta bien preparado tolera cargas altas si llegó a ellas de forma progresiva. El ACWR es una brújula, no un GPS: su cálculo exacto está discutido metodológicamente (Impellizzeri et al., 2020), así que en el club se usa como orientación junto al readiness y al RPE, no como regla ciega.

**Regla 3:1 de descarga** (coherente con Vinueza Tapia): tres semanas de carga creciente o sostenida (100 %) seguidas de una **semana reducida al 60-70 %** para asimilar la fatiga acumulada. Este microciclo de descarga se integra en la periodización anual del club (fase preparatoria de 20 semanas, competitiva de 15 y recuperatoria de 17). En jóvenes en pleno estirón, adelantar la descarga si aparecen dolores de crecimiento o cae el readiness.

## Recuperación activa: movilidad, estiramientos y días de descanso
<!-- subpilares: recuperacion -->

Recuperarse no es no hacer nada: la recuperación activa acelera la limpieza de la fatiga sin sumar estrés. Herramientas del club:
- **Día de descanso real:** al menos 1-2 por semana sin entrenamiento estructurado, más para las categorías menores. El descanso es cuando el cuerpo se adapta y crece.
- **Recuperación activa:** 20-30 min de intensidad baja (caminar, nadar, bici suave, juego libre) el día después de una sesión dura; mejora el flujo sanguíneo y el ánimo.
- **Movilidad y estiramiento estático post-sesión:** 5-10 min al final, enfocado en tobillo, cadera y zona torácica, las áreas clave del salto y el tiro. El estiramiento dinámico va en el calentamiento; el estático, en la vuelta a la calma (coherente con la estructura de sesión de Vinueza Tapia).
- **Sueño como recuperación número uno:** ninguna técnica sustituye dormir 8-10 h.

> [!NOTE]
> Ante los triggers `fatiga_alta` (fatiga_fisica ≤ 3) o `rpe_extremo`, el plan del día cambia a recuperación activa + movilidad y se recorta el volumen, en vez de forzar la sesión prevista.

## Nutrición para la recuperación: proteína, carbohidratos y ventana post entrenamiento
<!-- subpilares: recuperacion -->

Comer bien después de entrenar repone energía y repara el músculo. Prioridades basadas en el consenso de nutrición deportiva (Thomas, Erdman & Burke, 2016; Jäger et al., 2017):
- **Carbohidratos** para rellenar el glucógeno: tras sesiones intensas, ~1-1,2 g/kg en las primeras horas. Fuentes locales económicas: plátano, yuca, arroz, avena, fruta.
- **Proteína** para reparar: ~0,3 g/kg justo después (≈15-25 g), dentro de una ingesta diaria de **1,4-2,0 g/kg** repartida en el día (Jäger et al., 2017). Fuentes accesibles en la Amazonía: huevo, pescado de río, pollo, menestras, leche.
- **Ventana post-entrenamiento:** comer en los 30-60 min siguientes ayuda, sobre todo si hay doble sesión o partido al día siguiente; con un día completo de descanso por medio, importa más el total diario que el minuto exacto.
- **Rehidratar** al mismo tiempo (ver sección de hidratación) y priorizar comida real sobre suplementos.

> [!NOTE]
> Regla del club: cada atleta lleva una merienda de recuperación (fruta + fuente de proteína) para consumir al terminar. En categorías menores, avisar a las familias qué preparar con alimentos locales baratos.

## Protocolo de recuperación por categoría: Sub12, Sub15, Sub18 y Senior
<!-- subpilares: recuperacion -->

Volúmenes máximos orientativos y días de descanso por bucket de baremos (a modular con el readiness individual):

| Bucket (fase biológica) | Categorías FEB | Sesiones/sem | Duración | Días descanso | Foco de recuperación |
|---|---|---|---|---|---|
| **Sub12** (PSICOMOTRIZ) | Premini, Mini | 2-3 | 60-75 min | ≥3-4 | Sueño 9-11 h, juego libre, sin sobreuso |
| **Sub15** (TECNICA) | Menores, Prejuvenil temprano | 3-4 | 75-90 min | 2-3 | Sueño 8-10 h, descarga 3:1, movilidad diaria |
| **Sub18** (BIOMECANICA) | Prejuvenil tardío, Juvenil | 4-5 | 90-120 min | 1-2 | sRPE + ACWR, nutrición post, tapering |
| **Senior** (BIOMECANICA) | Mayores | 4-6 | 90-120 min | 1-2 | Monitoreo de carga completo, sueño estricto |

> [!NOTE]
> En Sub12 la prioridad es **no acumular carga**: mucho juego, poca especialización, descanso amplio. La regla de "horas de deporte organizado por semana no mayor que la edad en años" es una salvaguarda simple contra el sobreuso en niños. A partir de Sub15 se introduce la medición formal de carga (sRPE) y la descarga 3:1; en Sub18/Senior se usa el sistema completo de readiness, RPE y relación aguda:crónica.

## Umbrales de readiness: cuándo reducir carga o descansar
<!-- subpilares: recuperacion -->

Reglas **si-entonces** que el staff aplica leyendo el check-in del día. Los nombres de condición son los literales que usan el motor y las misiones del club (`packages/analytics-core/readiness.js` y `didactica.js`):

| Condición (trigger) | Se dispara cuando | Acción |
|---|---|---|
| `deshidratado_extremo` | color_orina ≥ 5 | Rehidratar con electrolitos ANTES de entrenar; no arrancar hasta corregir |
| `hidratacion_baja` | color_orina = 4 | Aumentar ingesta de agua durante el día; vigilar |
| `sueno_deficiente` | sueno_calidad ≤ 3 | Bajar la carga neuromuscular alta de hoy; reforzar higiene del sueño |
| `fatiga_alta` | fatiga_fisica ≤ 3 | Recuperación activa + movilidad; recortar volumen |
| `sobreentrenamiento_activo` | estado "Agotamiento Activo" | Suspender carga intensa; sueño 10-12 h; hobby/parasimpático |
| `fatiga_silenciosa` | estado "Fatiga Silenciosa" | Reducir volumen 30-40 %; si persiste >7 días, médico |
| `rpe_extremo` | RPE reportado ≥ 9 | Solo recuperación activa, estiramiento y movilidad |
| `percepcion_alterada` | RPE ≥ 8 con esfuerzo coach ≤ 5 | Sospechar fatiga sistémica; revisar sueño, nutrición e hidratación |

> [!NOTE]
> Prioridad de actuación: primero las condiciones **críticas** (`deshidratado_extremo`, `sobreentrenamiento_activo`, `fatiga_silenciosa`, `rpe_extremo`), luego las **altas** (`sueno_deficiente`, `fatiga_alta`, `percepcion_alterada`) y por último las **medias** (`hidratacion_baja`). Cuando varias coinciden, gana la de peor severidad y el día se reorienta a recuperación.

## Fuentes

### Fuentes sobre sueño, hidratación y nutrición para la recuperación

- Mah, C. D., Mah, K. E., Kezirian, E. J., & Dement, W. C. (2011). *The effects of sleep extension on the athletic performance of collegiate basketball players*. Sleep, 34(7), 943-950. DOI: 10.5665/SLEEP.1132.
- Paruthi, S., Brooks, L. J., D'Ambrosio, C., et al. (2016). *Recommended amount of sleep for pediatric populations: a consensus statement of the American Academy of Sleep Medicine*. Journal of Clinical Sleep Medicine, 12(6), 785-786. DOI: 10.5664/jcsm.5866.
- Sawka, M. N., Burke, L. M., Eichner, E. R., Maughan, R. J., Montain, S. J., & Stachenfeld, N. S. (2007). *American College of Sports Medicine position stand: exercise and fluid replacement*. Medicine & Science in Sports & Exercise, 39(2), 377-390. DOI: 10.1249/mss.0b013e31802ca597.
- Armstrong, L. E., Maresh, C. M., Castellani, J. W., et al. (1994). *Urinary indices of hydration status*. International Journal of Sport Nutrition, 4(3), 265-279. DOI: 10.1123/ijsn.4.3.265.
- Thomas, D. T., Erdman, K. A., & Burke, L. M. (2016). *Position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the American College of Sports Medicine: nutrition and athletic performance*. Journal of the Academy of Nutrition and Dietetics, 116(3), 501-528. DOI: 10.1016/j.jand.2015.12.006.
- Jäger, R., Kerksick, C. M., Campbell, B. I., et al. (2017). *International Society of Sports Nutrition position stand: protein and exercise*. Journal of the International Society of Sports Nutrition, 14, 20. DOI: 10.1186/s12970-017-0177-8.

### Fuentes sobre carga de entrenamiento, fatiga, sobreentrenamiento y descarga

- Hooper, S. L., & Mackinnon, L. T. (1995). *Monitoring overtraining in athletes: recommendations*. Sports Medicine, 20(5), 321-327. DOI: 10.2165/00007256-199520050-00003.
- Foster, C., Florhaug, J. A., Franklin, J., et al. (2001). *A new approach to monitoring exercise training*. Journal of Strength and Conditioning Research, 15(1), 109-115. DOI: 10.1519/00124278-200102000-00019.
- Gabbett, T. J. (2016). *The training-injury prevention paradox: should athletes be training smarter and harder?* British Journal of Sports Medicine, 50(5), 273-280. DOI: 10.1136/bjsports-2015-095788.
- Impellizzeri, F. M., Tenan, M. S., Kempton, T., Novak, A., & Coutts, A. J. (2020). *Acute:chronic workload ratio: conceptual issues and fundamental pitfalls* / *Training load and injury part 1*. Journal of Orthopaedic & Sports Physical Therapy, 50(10). DOI: 10.2519/jospt.2020.9675.
- Vinueza Tapia, E. *Fundamentos técnico-metodológicos de la planificación del entrenamiento en la iniciación deportiva* (Ecuador). Documento interno del club (`blackgold-mcp/knowledge/fundamentos_iniciacion_vinueza.md`): períodos 20/15/17 semanas, patrón de carga 3:1, estructura de sesión y descanso por edad.
