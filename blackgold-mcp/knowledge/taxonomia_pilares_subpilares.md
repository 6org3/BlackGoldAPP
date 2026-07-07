---
subpilares: []
---

# Taxonomía Black Gold: pilares, sub-pilares, pruebas y baremos

Este documento es el glosario operativo del sistema de evaluación del club Black Gold (Sucumbíos, Ecuador). Define los 3 pilares del rendimiento y sus pesos en el overall — fisico 40 %, tecnico 35 %, mental 25 % (`taxonomia.js`, analytics-core) —, los 8 sub-pilares que forman el radar del atleta (fuerza, explosividad, resistencia, movilidad, tiro, agilidad, tactica, resiliencia) y los 2 sub-pilares de monitoreo que se miden pero no puntúan (recuperacion y composicion_corporal).

Cada prueba de la batería se normaliza a una puntuación 0–100 mediante baremos por edad con 5 tiers: Debe Mejorar (15), Por Debajo (35), Promedio (55), Muy Bueno (75) y Excelente (95) (`baremos.js`). El promedio de cada pilar, ponderado por su peso, produce el overall, que asigna el rango del atleta: Rookie (0–39), Prospect (40–59), Starter (60–74), All-Star (75–89) y Legend (90–100) (`baremos.js`).

> [!NOTE]
> Regla operativa: la evaluación compara al atleta contra el baremo de su bucket de edad (Sub12, Sub15, Sub18, Senior), pero la decisión de entrenamiento siempre prioriza el seguimiento longitudinal individual sobre la comparación poblacional (baremos_cientificos.md).

## Radar de 8 sub-pilares: mapa de la batería de pruebas por sub-pilar

El radar del atleta tiene 8 ejes, en este orden fijo (`taxonomia.js`). La tabla resume qué pruebas de la batería alimentan cada sub-pilar y en qué unidad se registra la medición:

| Sub-pilar | Pilar | Pruebas de la batería (keys) | Unidad |
|---|---|---|---|
| fuerza | fisico | `sentadilla_rel`, `pushups_max`, `press_banca_rel` | × peso corporal, reps |
| explosividad | fisico | `cmj_salto`, `pushups_30s`, `dominadas` | cm, reps |
| resistencia | fisico | Course Navette, Yo-Yo IR1, 600/1000 m (catálogo en BD) | paliers, metros, tiempo |
| movilidad | fisico | `sit_reach`, `dorsiflexion`, `cadera_ri`/`cadera_re`, `hombro_ri`/`hombro_re`, `pistol_single_squat` | cm, grados, reps |
| tiro | tecnico | `tiro_libre`, `tiro_media`, `tiro_3pts` | % de acierto |
| agilidad | tecnico | `lane_agility`, `zigzag_balon` | segundos, COD/min |
| tactica | mental | `eficiencia_tactica` | rating del coach 0–100 |
| resiliencia | mental | `resiliencia` | rating del coach 0–100 |

Los sub-pilares de monitoreo (recuperacion, composicion_corporal) se describen en su propia sección: se miden pero no forman parte del radar (`taxonomia.js`).

## Pilar fisico (40 por ciento del overall): fuerza, explosividad, resistencia y movilidad

El pilar fisico es el de mayor peso en el overall: 0.40 (`taxonomia.js`). Agrupa cuatro sub-pilares — fuerza, explosividad, resistencia y movilidad — y su desarrollo se planifica sobre las fases sensibles de la iniciación deportiva: fuerza 10–12 años, velocidad 7–10, resistencia 9–14 y flexibilidad 6–12 (Vinueza, doc. interno). Es también el pilar donde más pesa el biotipo del club: atletas de estatura baja o media con alta densidad muscular y explosividad, base física del sistema Sucumbíos Small Ball.

Cada sub-pilar se describe abajo en dos partes: qué es y cómo se mide (protocolo de prueba, umbrales por edad), y cómo se entrena (ejercicios, progresión y dosis por bucket).

### Fuerza: definición, desarrollo, protocolo de prueba, medición y umbrales por edad
<!-- subpilares: fuerza -->

La fuerza es la capacidad de generar tensión muscular contra una resistencia; sostiene la explosividad, la técnica de salto y la prevención de lesiones. Su fase sensible se abre a los 10–12 años y su desarrollo continúa hasta los 16–18 (Vinueza, doc. interno).

Pruebas de la batería del club (keys de `baremos.js`):

- `sentadilla_rel` — sentadilla trasera a profundidad paralela; 1RM estimado ÷ peso corporal (tren inferior).
- `pushups_max` — flexiones continuas hasta el fallo con técnica estricta (tren superior).
- `press_banca_rel` — 1RM de press de banca ÷ peso corporal; definido SOLO para Sub18 y Senior (`baremos.js`).

Administración: mejor intento tras calentamiento estandarizado. En Sub12 no se hace 1RM: se evalúa la calidad técnica con sentadilla goblet o peso corporal (Faigenbaum et al., 2009; baremos_cientificos.md §1.1).

Umbrales de referencia (tablas completas en baremos_cientificos.md §1): promedio de sentadilla relativa Sub12 0.4–0.59× PC, Sub15 1.0–1.29× PC, Sub18 y Senior 1.4–1.69× PC; Excelente Sub18 ≥2.0× PC (`baremos.js`). Si una prueba no define baremo para el bucket (p. ej. `press_banca_rel` en Sub15), el motor la marca "no aplica" y no penaliza el pilar.

> [!NOTE]
> La NSCA no define estándares mínimos oficiales de fuerza para adolescentes: estos umbrales son referencias de atletas jóvenes entrenados, no criterios de apto/no apto (Faigenbaum et al., 2009).

### Fuerza: ejercicios, progresión y dosis por edad Sub12, Sub15, Sub18 y Senior
<!-- subpilares: fuerza -->

Progresión del club por fase biológica, alineada con la ventana 10–12 años (Vinueza, doc. interno) y con la posición NSCA de fuerza juvenil: 2–3 sesiones semanales en días no consecutivos, 1–3 series de 6–15 repeticiones e incrementos de carga del 5–10 % solo cuando la técnica es estable (Faigenbaum et al., 2009).

- Sub12 (fase PSICOMOTRIZ — Premini y Mini): autocarga y juegos de empuje, tracción y arrastre; sentadilla libre, zancada, plancha y puente de glúteo. 2 sesiones/semana, 1–2 series × 8–15 repeticiones. Objetivo: patrón motor, nunca la carga.
- Sub15 (fase TECNICA — Menores y Prejuvenil temprano): bandas elásticas, balón medicinal de 1–3 kg y aprendizaje de la sentadilla goblet con técnica estricta. 2 sesiones/semana, 2–3 series × 8–12 repeticiones.
- Sub18 y Senior (fase BIOMECANICA): barra y fuerza máxima progresiva: 3–4 series × 4–8 repeticiones al 70–85 % del 1RM, 2–3 sesiones/semana con supervisión directa del coach.

> [!NOTE]
> Regla del club: si la batería marca la fuerza como debilidad prioritaria (tier Debe Mejorar o Por Debajo), programar 2 sesiones semanales específicas del sub-pilar hasta la siguiente evaluación.

### Explosividad: definición, desarrollo, prueba de salto CMJ y baremos por edad
<!-- subpilares: explosividad -->

La explosividad es la capacidad de producir fuerza a alta velocidad (potencia); en baloncesto gobierna el salto, el primer paso y el sprint corto. Es el rasgo distintivo del biotipo Black Gold: estatura media compensada con potencia.

Pruebas (`baremos.js`):

- `cmj_salto` — salto con contramovimiento, manos en la cadera, mejor de 3 intentos; medición con plataforma de contacto o app validada tipo MyJump (tren inferior).
- `pushups_30s` — flexiones en 30 segundos: potencia-resistencia del tren superior.
- `dominadas` — dominadas estrictas desde suspensión completa hasta barbilla sobre la barra (tren superior).

Umbrales del CMJ por bucket: Promedio Sub12 28–32 cm, Sub15 35–41 cm, Sub18 44–51 cm, Senior 50–59 cm; Excelente Senior ≥70 cm (baremos_cientificos.md §2.1; NBA Combine). En `dominadas`, un Sub12 Promedio hace 1–3 repeticiones y el tier Excelente exige ≥9 (baremos_cientificos.md §2.3); si el atleta no logra ninguna, usar suspensión con brazos flexionados como alternativa.

La mayor ganancia de potencia llega después del pico de velocidad de crecimiento (PHV): interpretar el CMJ junto al estado madurativo del atleta y no solo contra el baremo (Lloyd & Oliver, 2012; baremos_cientificos.md).

### Explosividad: pliometría, ejercicios y dosis de contactos por edad
<!-- subpilares: explosividad -->

La pliometría es el método central para desarrollar la explosividad. La dosis se controla por contactos (apoyos de salto) por sesión:

- Sub12: multisaltos horizontales, comba y juegos de saltar; 50–60 contactos de baja intensidad por sesión, superficies amables, 1–2 sesiones/semana integradas al calentamiento.
- Sub15: pliometría baja (cajas <30 cm, saltos verticales y laterales con recepción estable); 80–100 contactos por sesión para principiantes (Potach & Chu, 2008), 2 sesiones/semana con 48–72 h entre ellas.
- Sub18 y Senior: contrastes fuerza-velocidad (sentadilla + salto), drop jumps moderados y saltos con balón; hasta 100–120 contactos por sesión en atletas avanzados (Potach & Chu, 2008).

> [!NOTE]
> La calidad manda: se corta la serie cuando la altura de salto o la técnica de recepción caen. Durante el estirón (alrededor del PHV) se reduce el volumen de saltos para proteger las estructuras en crecimiento (Lloyd & Oliver, 2012).

### Resistencia: definición, desarrollo, prueba Course Navette y umbrales por categoría
<!-- subpilares: resistencia -->

La resistencia es la capacidad de sostener esfuerzos prolongados o repetidos sin caída del rendimiento; en baloncesto domina la resistencia intermitente (repetir esfuerzos cortos con pausas incompletas). Entró al radar como sub-pilar físico de pleno derecho en julio de 2026 (`taxonomia.js`).

Pruebas del catálogo del club (viven en el catálogo de pruebas de la base de datos, insertadas vía MCP; no están en el BAREMOS estático de `baremos.js`):

- Course Navette — test de ida y vuelta de 20 m: arranca a 8.5 km/h y sube 0.5 km/h por palier de ~1 minuto (Léger et al., 1988). Se registra el último palier completado.
- Yo-Yo IR1 — tramos de 2×20 m con 10 s de recuperación activa; se registran los metros totales (Bangsbo et al., 2008).
- Carreras de 600 m y 1000 m de la batería de detección de talentos (Vinueza, doc. interno).

Ventana de entrenabilidad 9–14 años (Vinueza, doc. interno): 9–10 resistencia aeróbica general, 11–12 aumento del volumen, 13–14 introducción de la resistencia específica. El resultado (paliers, metros o tiempo) se normaliza al tier del bucket del atleta con los umbrales del catálogo.

### Resistencia: ejercicios, métodos y dosis por edad Sub12, Sub15, Sub18 y Senior
<!-- subpilares: resistencia -->

- Sub12: juegos continuos y circuitos lúdicos de 10–20 minutos a intensidad conversacional; nada de series lácticas ni trabajo anaeróbico formal (Vinueza, doc. interno).
- Sub15: fartlek de 20–30 minutos e intervalos aeróbicos largos (3–4 × 3 min con pausa igual al trabajo), 2 sesiones/semana integradas en cancha.
- Sub18 y Senior: HIIT específico de baloncesto — 15 s de trabajo / 15 s de pausa × 8–12 repeticiones, transiciones de cancha completa y defensas continuas; 2 sesiones/semana en el período preparatorio y 1 de mantenimiento en el competitivo, coherente con el macrociclo de 20/15/17 semanas del club (Vinueza, doc. interno).

> [!NOTE]
> Clima amazónico: en Sucumbíos (calor y humedad altos) se acortan los bloques de resistencia, se añaden pausas de hidratación cada 15–20 minutos y se programan estas sesiones a primera hora o al final de la tarde.

### Movilidad: definición, desarrollo por edad en iniciación, medición sit and reach y baremos
<!-- subpilares: movilidad -->

La movilidad es el rango de movimiento útil y controlado de una articulación; sostiene la técnica (profundidad de sentadilla, mecánica de tiro) y la prevención de lesiones. Es, entre las capacidades físicas, la que abre su ventana de desarrollo más temprano: su fase sensible (flexibilidad) va de los 6 a los 12 años — en plena edad de iniciación deportiva — por la máxima plasticidad del tejido conectivo (Vinueza, doc. interno); durante el estirón (11–14) es normal una caída transitoria del rango (baremos_cientificos.md §3.1).

Pruebas (`baremos.js`): `sit_reach` (flexión de tronco en cajón estándar, 0 cm = tocar la punta de los pies, mejor de 3 intentos), `dorsiflexion` (lunge test contra pared con carga, WBLT, en cm), `cadera_ri`/`cadera_re` y `hombro_ri`/`hombro_re` (goniometría, en grados) y `pistol_single_squat` (sentadilla a una pierna, repeticiones).

Medición bilateral: estas pruebas registran lado izquierdo y derecho, promedian ambos y una asimetría >15 % dispara alerta de riesgo elevado de lesión (`baremos.js`). En dorsiflexión, una asimetría >1.5 cm ya es clínicamente significativa (baremos_cientificos.md §3.2).

Umbrales de referencia: sit and reach Promedio Sub15 de 0 a +4 cm y Sub18 de +7 a +10 cm (`baremos.js`); dorsiflexión <8–9 cm = restricción con riesgo elevado de lesión de LCA, según estudio con 693 jóvenes baloncestistas (baremos_cientificos.md §3.2).

### Movilidad: rutinas de ejercicios, progresión y dosis por edad
<!-- subpilares: movilidad -->

- Pre-sesión (todas las edades): rutina dinámica de 8–10 minutos — tobillo, cadera, columna torácica y hombro — como parte fija del calentamiento.
- Post-sesión: estiramientos estáticos de 2–4 series × 10–30 s por grupo muscular, con énfasis en isquiotibiales, flexores de cadera y gemelos (Garber et al., 2011).
- Sub12: aprovechar la ventana 6–12 años (Vinueza, doc. interno) con juegos de patrones y desplazamientos animales (animal walks); frecuencia diaria dentro de la sesión.
- Sub15: mantener el rango durante el estirón: rutina corta en casa (5–8 min, mañana o noche) más control trimestral de dorsiflexión.
- Sub18 y Senior: trabajo correctivo individualizado según los hallazgos del screening de pretemporada (WBLT, ROM de cadera y hombro, pistol squat).

> [!NOTE]
> El screening de movilidad se aplica al inicio de cada período preparatorio; cualquier asimetría >15 % genera trabajo correctivo antes de aumentar la carga de fuerza o pliometría.

## Pilar tecnico (35 por ciento): tiro y agilidad

El pilar tecnico pesa 0.35 del overall (`taxonomia.js`) y agrupa dos sub-pilares: tiro (la habilidad de anotar desde todas las distancias) y agilidad (la capacidad de cambiar de dirección con y sin balón). En la taxonomía del club la agilidad se clasifica como técnica porque se mide con balón y con desplazamientos específicos de baloncesto, aunque fisiológicamente sea una capacidad coordinativa, dependiente de procesos neuronales de aprendizaje motor (Vinueza, doc. interno). Ambos sub-pilares definen la identidad ofensiva del Sucumbíos Small Ball: tiro exterior confiable y ventaja constante en velocidad de ejecución.

### Tiro: definición, desarrollo, protocolo de prueba y umbrales por edad
<!-- subpilares: tiro -->

El tiro es la habilidad técnica de convertir lanzamientos; es el sub-pilar de mayor transferencia directa al marcador y la primera arma del small ball.

Pruebas (`baremos.js`): `tiro_libre`, `tiro_media` y `tiro_3pts`. Protocolo común: 20 intentos por prueba con balón reglamentario para la edad; en media y triple, 10 intentos desde cada una de 2 posiciones elegidas por el jugador, en catch and shoot; en Sub12 el triple se mide a distancia acortada de 5.0–5.8 m (baremos_cientificos.md §4). El score del sub-pilar pondera internamente: tiro libre 30 %, media distancia 35 %, triple 35 % (`TIRO_WEIGHTS`, `baremos.js`).

Umbrales de tiro libre por bucket: Promedio Sub12 30–41 %, Sub15 45–57 %, Sub18 60–69 %, Senior 68–74 %; Excelente Senior ≥82 % (`baremos.js`; baremos_cientificos.md §4.1).

> [!TIP]
> El porcentaje de tiro libre predice mejor el futuro acierto de triple que el propio porcentaje de triple: usarlo como indicador adelantado del toque de tiro (baremos_cientificos.md §4.3).

### Tiro: progresión técnica, ejercicios y volumen de tiros por edad
<!-- subpilares: tiro -->

Mecánica en 4 puntos de control: base (pies al ancho de hombros, orientados al aro), codo (alineado bajo el balón), extensión (completa hacia el aro) y muñeca (follow-through sostenido). Progresión y volumen diario orientativo:

- Sub12: form shooting a 1–3 m del aro, 50–100 tiros cortos al día con balón n.º 5; prioridad absoluta a la mecánica, sin triples de distancia adulta.
- Sub15: 100–150 tiros al día: form shooting de entrada, catch and shoot desde media distancia y primeras series de tiro tras bote; balón n.º 6 o 7 según la categoría.
- Sub18 y Senior: escalonar hasta los 200 tiros diarios del estándar del club (manual de entrenamiento, doc. interno): catch and shoot, tiro tras bote, spot shooting por zonas y tiro bajo fatiga (inmediatamente después de esfuerzo) para transferir al partido.

> [!NOTE]
> Registrar aciertos por bloque en cada rutina: ese dato alimenta la evaluación del sub-pilar y las misiones de la app.

### Agilidad: definición, desarrollo, prueba lane agility y baremos por edad
<!-- subpilares: agilidad -->

La agilidad es la capacidad de acelerar, frenar y cambiar de dirección manteniendo el control, con y sin balón. Su base coordinativa se construye en la ventana de la velocidad, 7–10 años (Vinueza, doc. interno).

Pruebas (`baremos.js`):

- `lane_agility` — recorrido de la botella según el protocolo del NBA Combine: sprint, desplazamiento defensivo lateral y carrera atrás; se registra en segundos (menos es mejor), mejor de 2 intentos.
- `zigzag_balon` — cambios de dirección con balón entre conos separados 2.1–2.4 m durante 60 s; se registran los cambios de dirección por minuto (COD/min, más es mejor).

Umbrales de lane agility: Promedio Sub12 14.0–14.9 s, Sub15 13.0–13.5 s, Sub18 11.6–12.0 s, Senior 11.1–11.5 s; Excelente Senior ≤10.5 s (`baremos.js`; baremos_cientificos.md §4.4). En `zigzag_balon`, Promedio Sub15 17–22 COD/min y Excelente ≥28 (baremos_cientificos.md §4.5). Como prueba complementaria de campo puede usarse el T-test (baremos_cientificos.md §5).

### Agilidad: ejercicios, progresión y dosis por edad
<!-- subpilares: agilidad -->

- Sub12 (ventana de la velocidad 7–10 años; Vinueza, doc. interno): escalera de coordinación, persecuciones, relevos y juegos de reacción; 2–3 bloques de 5–8 minutos por sesión, siempre al inicio, con el atleta fresco.
- Sub15: 5-10-5 (pro agility), T-test como ejercicio, desplazamientos defensivos con orientación y closeouts; 2 bloques de 8–10 minutos, 2 sesiones/semana.
- Sub18 y Senior: cambios de dirección con balón a máxima intensidad, reacción a estímulo visual, defensa del bloqueo directo y transiciones ofensivas; se integra al trabajo táctico del small ball.

> [!NOTE]
> Regla del club: la velocidad y la agilidad se entrenan sin fatiga; un ejercicio de agilidad ejecutado agotado entrena resistencia, no agilidad. Los bloques de calidad van siempre antes del trabajo de carga.

## Pilar mental (25 por ciento): tactica y resiliencia

El pilar mental pesa 0.25 del overall (`taxonomia.js`) y agrupa tactica (lectura del juego y toma de decisiones) y resiliencia (respuesta a la adversidad). Ambos sub-pilares se evalúan hoy con rating del coach de 0 a 100 y umbrales únicos para todas las edades: Debe Mejorar ≤20, Por Debajo 21–35, Promedio 36–55, Muy Bueno 56–75, Excelente >75 (`baremos.js`). Es el pilar donde la filosofía Mamba del club — pasión, obsesión, implacabilidad, resiliencia, intrepidez — se vuelve observable y medible (mentalidad_mamba.md, doc. interno).

### Tactica: definición, desarrollo, evaluación y umbrales
<!-- subpilares: tactica -->

La tactica (eficiencia táctica) es la capacidad de leer el juego y decidir bien: ocupar espacios, pasar a tiempo, elegir el tiro correcto, ayudar y rotar en defensa. Se registra con la prueba `eficiencia_tactica`: rating del coach de 0 a 100 tras observar al atleta en juego real o reducido (`baremos.js`).

Base metodológica de la observación: el GPAI (Game Performance Assessment Instrument), que separa la toma de decisiones de la ejecución técnica y del apoyo sin balón (Oslin et al., 1998). Recomendación operativa del club: puntuar los 3 componentes (decisión, ejecución, apoyo) en juego reducido 3c3 y promediarlos al rating 0–100.

Umbrales (idénticos en todos los buckets): Excelente >75, Muy Bueno 56–75, Promedio 36–55, Por Debajo 21–35, Debe Mejorar ≤20 (`baremos.js`). Evaluación: al inicio y al final del período preparatorio y a mitad del competitivo, siempre por el mismo observador cuando sea posible.

### Tactica: progresión por edad y ejercicios de juego reducido
<!-- subpilares: tactica -->

- Premini y Mini (bucket Sub12): sin sistemas: 1c1 y 2c2, ocupar espacios libres y decisión simple (pasar, botar o tirar); todo mediante juego.
- Menores (Sub15): spacing, pasar y cortar, lectura de ventaja en 2c1 y 3c2 continuo.
- Prejuvenil: bloqueo directo básico, ayudas defensivas y primeras rotaciones.
- Juvenil y Mayores: sistema Sucumbíos Small Ball completo: ritmo alto, transición en 5 segundos, triple liberado y cambios defensivos.

Dosis: 2–3 bloques de juegos reducidos con reglas de provocación (8–10 minutos por bloque) en cada sesión de cancha. El desarrollo completo del sistema y sus ejercicios vive en docs/tactica_small_ball.md.

### Resiliencia: definición, desarrollo, medición y umbrales
<!-- subpilares: resiliencia -->

La resiliencia es la capacidad de sostener el esfuerzo y recuperar el foco tras el error, la derrota o la adversidad; es el sub-pilar medible de la filosofía Mamba (mentalidad_mamba.md, doc. interno). Se registra con la prueba `resiliencia`: rating del coach de 0 a 100 con los mismos umbrales que la táctica: Excelente >75, Muy Bueno 56–75, Promedio 36–55, Por Debajo 21–35, Debe Mejorar ≤20 (`baremos.js`).

Qué observa el coach para puntuar: la respuesta inmediata al error (¿siguiente jugada o protesta?), el lenguaje corporal tras una canasta rival, el esfuerzo defensivo con marcador adverso, la tolerancia a la fatiga en finales apretados y la aceptación del rol dentro del equipo.

Evolución por fase biológica del club: en PSICOMOTRIZ (Sub12) se construye tolerancia al error mediante juego; en TECNICA (Sub15) se introduce presión simulada — marcadores adversos, tiempo límite —; en BIOMECANICA (Sub18 y Senior) se gestiona la competición real: suplencias, lesiones y derrotas.

### Resiliencia: progresión por edad y ejercicios de entrenamiento mental
<!-- subpilares: resiliencia -->

- Sub12: rutina simple post-error ("borrar y siguiente"), refuerzo del esfuerzo por encima del resultado (mentalidad de crecimiento) y 5 minutos de respiración guiada al cerrar sesiones intensas.
- Sub15: pressure training: tiros libres con consecuencia para el grupo, marcadores simulados en contra y tiempo límite; rutina de reinicio de 3 pasos (respirar, palabra clave, siguiente acción); visualización guiada de 5 minutos, 2–3 veces por semana.
- Sub18 y Senior: autodiálogo estructurado, rutina pre tiro libre estable, diario de errores semanal (qué pasó, qué controlo, qué haré) y roles de liderazgo rotativos; mindfulness de 5–10 minutos diarios.

La progresión completa de ejercicios mentales, con su dosificación, vive en docs/mentalidad_mamba.md; los 5 pilares Mamba se traducen ahí en hábitos y misiones diarias.

## Monitoreo: recuperacion y composicion corporal

recuperacion y composicion_corporal son sub-pilares de MONITOREO: se miden con regularidad pero NO entran al radar ni al overall (`taxonomia.js`, SUB_PILARES_MONITOREO). Son señales de disponibilidad y de salud del proceso, no notas de rendimiento: sirven para modular la carga del día, recomendar hábitos y detectar riesgo, nunca para "subir de nivel". Un atleta con overall All-Star y readiness bajo entrena suave ese día; un atleta Rookie con readiness alto puede absorber más carga.

### Recuperacion: check-in diario de sueño, fatiga, hidratación y score de readiness
<!-- subpilares: recuperacion -->

El check-in diario del atleta registra tres métricas (tabla `atleta_readiness`; `readiness.js`):

- sueno_calidad 1–10 (más es mejor),
- fatiga_fisica 1–10 (10 = "al 100 %", 1 = agotado; más es mejor),
- color_orina 1–8 según la escala de colores de Armstrong, donde menos es mejor (Armstrong et al., 1994).

El score compuesto de readiness (0–100) pondera sueño 40 %, fatiga 40 % e hidratación 20 %, y solo promedia las métricas presentes ese día (`readiness.js`). Alertas automáticas con sus condiciones (nombres literales del motor): color_orina ≥5 → deshidratado_extremo (crítica); color_orina ≥4 → hidratacion_baja (media); sueno_calidad ≤3 → sueno_deficiente (alta); fatiga_fisica ≤3 → fatiga_alta (alta) (`readiness.js`).

> [!NOTE]
> Uso operativo: con alerta crítica no se entrena carga alta — primero reponer líquidos y descanso. Con alertas altas se reduce volumen e intensidad y se prioriza movilidad y técnica. Los protocolos completos de carga, descanso, sueño e hidratación viven en recuperacion_carga_descanso.md.

### Composicion corporal: antropometría, detección y seguimiento del crecimiento
<!-- subpilares: composicion_corporal -->

La composición corporal agrupa la antropometría del atleta: peso, estatura, estatura sentada y envergadura; son también los indicadores antropométricos de la detección preliminar de talentos de 9–12 años de la batería del club (Vinueza, doc. interno). No puntúa en el radar ni en el overall: es contexto biológico para interpretar el resto de las pruebas.

Protocolo del club: medir al inicio de cada macrociclo y cada 3 meses en etapas de crecimiento. La estatura trimestral permite estimar la velocidad de crecimiento y ubicar el pico (PHV), referencia clave para interpretar el CMJ, la fuerza y el riesgo de sobrecarga durante el estirón (Lloyd & Oliver, 2012; baremos_cientificos.md).

> [!NOTE]
> Con menores no se usan metas de peso ni de porcentaje graso como objetivos: el seguimiento es descriptivo, lo interpreta el cuerpo técnico y cualquier señal de alarma se conversa con la familia.

## Buckets de baremos: Sub12, Sub15, Sub18 y Senior

Los baremos del motor se organizan en 4 buckets de edad (`baremos.js`; baremos_cientificos.md):

| Bucket | Edad de referencia | Descripción |
|---|---|---|
| Sub12 | 10–12 años | Iniciación; también barema a Premini y Mini por mapeo de techo |
| Sub15 | 13–15 años | Desarrollo; estirón y máxima variabilidad madurativa |
| Sub18 | 16–18 años | Consolidación; se habilitan pruebas con carga externa (press de banca) |
| Senior | 18+ años | Rendimiento adulto |

Cada prueba define 4 cortes [t1, t2, t3, t4] por bucket que separan los 5 tiers, con tipo mas_es_mejor o menos_es_mejor (`baremos.js`). Si la categoría del atleta no mapea a ningún bucket, el motor cae al comodín Sub15 (`normalizarValor`, `baremos.js`); si la prueba no define umbrales para su bucket, devuelve "no aplica" sin penalizar el promedio del pilar.

### Tiers de puntuación y rangos del overall: escala de medición de la evaluación

Cada resultado de prueba cae en uno de 5 tiers, y cada tier aporta una puntuación normalizada fija al promedio del sub-pilar y del pilar (`baremos.js`):

| Tier | Etiqueta en la app | Puntuación normalizada |
|---|---|---|
| poor | Debe Mejorar | 15 |
| below_avg | Por Debajo | 35 |
| average | Promedio | 55 |
| above_avg | Muy Bueno | 75 |
| excellent | Excelente | 95 |

El overall pondera los promedios de pilar por 0.40/0.35/0.25 (fisico/tecnico/mental); si al atleta le falta un pilar completo por evaluar, el cálculo se renormaliza sobre los pilares presentes en vez de castigar con cero (`calcularOverall`, `baremos.js`). El overall determina el rango del atleta:

| Rango | Overall |
|---|---|
| Rookie | 0–39 |
| Prospect | 40–59 |
| Starter | 60–74 |
| All-Star | 75–89 |
| Legend | 90–100 |

Los rangos Prospect en adelante desbloquean recompensas del club (reconocimientos, sesiones de video-análisis, entrenamiento 1 a 1) definidas en `baremos.js`.

## Categorías FEB y equivalencia con buckets: Premini, Mini, Menores, Prejuvenil, Juvenil, Mayores

La categoría se deriva de la fecha de nacimiento con `calcularCategoriaFEB()` (`categoriaFEB.js`) y se traduce a bucket de baremos con el mapeo por techo `CATEGORIA_FEB_A_BUCKET_BAREMO` (`baremos.js`):

| Edad (años) | Categoría FEB | Bucket de baremos | Fase biológica del club |
|---|---|---|---|
| ≤9 | Premini (Sub-9) | Sub12 | PSICOMOTRIZ |
| 10–11 | Mini (Sub-11) | Sub12 | PSICOMOTRIZ |
| 12–14 | Menores (Sub-14) | Sub15 | TECNICA |
| 15–16 | Prejuvenil (Sub-16) | Sub18 | BIOMECANICA |
| 17–18 | Juvenil (Sub-18) | Sub18 | BIOMECANICA |
| >18 | Mayores | Senior | BIOMECANICA |

> [!NOTE]
> El mapeo es "por techo": se usa el bucket más chico cuyo rango cubre la edad máxima de la categoría. Dos consecuencias prácticas: un Premini de 8 años se compara contra baremos pensados para 10–12 (interpretar sus tiers con cautela y priorizar su evolución individual), y un prejuvenil temprano de 15 años barema como Sub18 aunque fisiológicamente esté más cerca de Sub15. Esta correspondencia está pendiente de validación por el cuerpo técnico (`baremos.js`).

## Niveles Micro, Desarrollo y Elite: criterios de clasificación

Los umbrales de las pruebas del catálogo pueden segmentarse, además de por bucket de edad, por nivel de desarrollo — Micro, Desarrollo y Elite — y por género (Masculino/Femenino, por el dimorfismo sexual documentado en la investigación de base del club; Vinueza, doc. interno). El motor resuelve en cascada: nivel del atleta → si no existe, Desarrollo → el que haya definido la prueba (`resolverUmbrales`, `baremos.js`); en género, si falta el del atleta se usa el del otro sexo como aproximación antes que dejar la prueba sin baremo.

> [!NOTE]
> Criterios operativos del club para asignar el nivel:
> - **Micro**: primer año de entrenamiento sistemático o incorporación reciente al club, a cualquier edad.
> - **Desarrollo**: entre 1 y 3 años de entrenamiento estructurado; es el nivel por defecto del motor.
> - **Elite**: 3 o más años de entrenamiento, más convocatoria a selección provincial o rango All-Star/Legend sostenido en dos evaluaciones consecutivas.
>
> El coach puede reclasificar el nivel en cualquier evaluación. El nivel modula el baremo (la exigencia de los umbrales), no el plan de enseñanza, que sigue dependiendo de la categoría FEB y la fase biológica.

## Fuentes

### Fuentes internas del club Black Gold

- Vinueza (doc. interno). *Fundamentos técnico-metodológicos de la planificación del entrenamiento en la iniciación deportiva*. blackgold-mcp/knowledge/fundamentos_iniciacion_vinueza.md.
- Black Gold (2026). *Baremos científicos — Physical testing normative values for youth basketball*. docs/baremos_cientificos.md (documento interno; compila NSCA, FitnessGram, NBA Combine, ACSM, NIH/PubMed).
- Black Gold (2026). Código fuente de analytics-core: `taxonomia.js`, `baremos.js`, `categoriaFEB.js`, `readiness.js` (packages/analytics-core).
- Black Gold (docs internos): docs/manual_entrenamiento.md, docs/mentalidad_mamba.md, docs/tactica_small_ball.md.

### Fuentes científicas: fuerza, explosividad, resistencia, movilidad y evaluación

- Faigenbaum, A. D., Kraemer, W. J., Blimkie, C. J., et al. (2009). Youth resistance training: updated position statement paper from the National Strength and Conditioning Association. *Journal of Strength and Conditioning Research*, 23(5 Suppl), S60–S79. DOI: 10.1519/JSC.0b013e31819df407.
- Léger, L. A., Mercier, D., Gadoury, C., & Lambert, J. (1988). The multistage 20 metre shuttle run test for aerobic fitness. *Journal of Sports Sciences*, 6(2), 93–101. DOI: 10.1080/02640418808729800.
- Bangsbo, J., Iaia, F. M., & Krustrup, P. (2008). The Yo-Yo intermittent recovery test: a useful tool for evaluation of physical performance in intermittent sports. *Sports Medicine*, 38(1), 37–51. DOI: 10.2165/00007256-200838010-00004.
- Lloyd, R. S., & Oliver, J. L. (2012). The Youth Physical Development model: a new approach to long-term athletic development. *Strength and Conditioning Journal*, 34(3), 61–72. DOI: 10.1519/SSC.0b013e31825760ea.
- Garber, C. E., Blissmer, B., Deschenes, M. R., et al. (2011). ACSM position stand: quantity and quality of exercise for developing and maintaining fitness in apparently healthy adults. *Medicine & Science in Sports & Exercise*, 43(7), 1334–1359.
- Potach, D. H., & Chu, D. A. (2008). Plyometric training. En T. R. Baechle & R. W. Earle (Eds.), *Essentials of Strength Training and Conditioning* (3.ª ed.). Human Kinetics.

### Fuentes sobre recuperación, evaluación táctica y normas de referencia

- Armstrong, L. E., Maresh, C. M., Castellani, J. W., et al. (1994). Urinary indices of hydration status. *International Journal of Sport Nutrition*, 4(3), 265–279.
- Oslin, J. L., Mitchell, S. A., & Griffin, L. L. (1998). The Game Performance Assessment Instrument (GPAI): development and preliminary validation. *Journal of Teaching in Physical Education*, 17(2), 231–243.
- Cooper Institute. *FitnessGram / Healthy Fitness Zone* — normas de aptitud física escolar de EE. UU.
- NBA Draft Combine (2000–presente). Datos históricos de lane agility, salto vertical y press de banca.
