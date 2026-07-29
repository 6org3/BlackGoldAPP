---
area: metodologia
---

# Sesgo de muestra pequeña: cómo leer datos de pocos atletas y pocas pruebas

*Documento de metodología del club Black Gold (Sucumbíos, Amazonía ecuatoriana). Fundamenta la regla estadística del club para interpretar evaluaciones con pocas mediciones: cuándo una señal (una debilidad detectada, una tendencia, un promedio de grupo) es **firme** y cuándo es solo **provisional**. Es el sustento del criterio n<3 referido en `docs/spec_h1_autonomia_resultados.md` (H1-D2): ninguna decisión automática ni diagnóstico del sistema debe tratarse como firme con menos de tres mediciones del mismo sub-pilar. Aplica a coaches, al dueño leyendo KPIs y a cualquier agente de IA que consuma los datos del club.*

En un club formativo los números son pequeños por naturaleza: grupos de 5 a 15 atletas, ventanas de evaluación trimestrales, atletas nuevos con una sola prueba registrada. Esos datos valen mucho — pero se leen distinto que una muestra grande. Con pocas mediciones, el azar pesa tanto como la señal, y el error clásico es tratar una foto ruidosa como si fuera una tendencia real.

> [!NOTE]
> Regla rectora del club: **con n < 3 mediciones de un sub-pilar, toda conclusión es provisional**. Se puede usar para orientar (sugerir una misión, priorizar una re-evaluación), nunca para afirmar ("este atleta es débil en fuerza") ni para automatizar decisiones sin revisión humana. La confianza se declara junto al dato, no se esconde.

## La ley de los pequeños números: el error de intuición que corrige esta regla

Las personas — y los sistemas que las imitan — tienden a creer que una muestra chica se parece a la población de la que salió. Tversky y Kahneman (1971) llamaron a esto la "creencia en la ley de los pequeños números": esperar que 3 tiros libres reflejen el porcentaje real de tiro de un atleta, o que el promedio de un grupo de 6 niños refleje "el nivel del club". No es así: cuanto menor la muestra, mayor la probabilidad de resultados extremos por puro azar. Un grupo de 6 puede promediar tier "Bronce" hoy y "Plata" el mes que viene sin que nadie haya mejorado ni empeorado: basta que un atleta faltara el día de la prueba.

Consecuencias prácticas en el club:

- **Promedios de grupo chico saltan solos.** En un grupo de 6-10 atletas, la entrada o salida de un solo niño mueve el promedio grupal más que cualquier efecto real del entrenamiento. Antes de leer "el grupo empeoró", verificar si cambió la composición del grupo.
- **Los extremos se sobre-representan.** El mejor y el peor resultado de una tanda chica están más lejos de su valor "verdadero" que en una tanda grande. Elogiar o alarmarse por el extremo de una medición única es reaccionar al ruido.
- **Percentiles con base chica engañan.** "Está en el percentil 80 de su grupo" significa poco cuando el grupo son 7 atletas: es el segundo de siete.

## Error de medición: toda prueba de campo tiene ruido propio

Además del azar muestral, cada prueba física tiene **error típico de medición** (typical error): la variación que aparece al repetir la misma prueba al mismo atleta sin que nada real haya cambiado (Hopkins, 2000). En pruebas de campo con menores el ruido es mayor que en laboratorio: motivación del día, sueño, hora, temperatura amazónica, técnica de ejecución aún inestable (un CMJ de un Sub-12 varía por coordinación, no solo por potencia). Atkinson y Nevill (1998) sistematizan lo que esto implica: **un cambio observado solo es interpretable si supera el error típico de la prueba**.

Aplicación del club:

- **Una sola medición es una estimación con banda ancha, no un valor exacto.** El registro dice "28 cm de CMJ"; la lectura correcta es "alrededor de 28 cm, ± el ruido de la prueba".
- **Dos mediciones forman una línea, no una tendencia.** Entre dos puntos siempre hay una recta; la dirección de esa recta puede ser 100 % error de medición. El club exige **tres o más puntos** antes de hablar de tendencia de un sub-pilar — la base de la regla n<3.
- **Mejoras chicas dentro del ruido no se celebran como progreso ni se castigan como estancamiento.** Se registran y se espera el siguiente punto.

## Regresión a la media: el rebote estadístico que parece causa-efecto

Cuando un atleta rinde inusualmente mal (o bien) en una medición, lo más probable es que en la siguiente rinda más cerca de su nivel real — sin ninguna intervención de por medio. Es la **regresión a la media** (Barnett, van der Pols y Dobson, 2005), y es la trampa clásica de los ciclos "detectar debilidad → asignar misión → re-evaluar":

- Se detecta "debilidad en explosividad" por **una** prueba mala (quizá el niño durmió mal).
- Se asigna una misión correctiva.
- La siguiente prueba sale mejor — y se atribuye la mejora a la misión, cuando el rebote habría ocurrido igual.

Esto no invalida el ciclo de misiones: lo obliga a ser honesto. Con n < 3, la "debilidad" es una hipótesis a confirmar, y la "mejora" posterior es evidencia débil. Con 3+ mediciones estables por debajo del umbral, la debilidad es firme y la mejora posterior sí es señal creíble.

## La regla operativa: n como señal de confianza

<!-- subpilares: recuperacion -->

El club declara la confianza de cada diagnóstico según el número de mediciones del sub-pilar en la ventana relevante:

| n (mediciones del sub-pilar) | Nivel de confianza | Qué se permite |
|---|---|---|
| 0 | sin dato | Nada: primero evaluar. |
| 1–2 | **provisional** | Orientar: sugerir misión o re-evaluación, siempre marcado como provisional. Prohibido: afirmaciones diagnósticas, decisiones automáticas sin revisión, comparaciones firmes contra el grupo. |
| ≥3 | **firme** | Diagnóstico de debilidad/fortaleza, tendencia, y automatización con auditoría por excepción (cuando el spec H1 esté ratificado). |

El umbral n≥3 es el estándar mínimo de la literatura de monitoreo para separar señal de ruido en series individuales (tres puntos permiten distinguir una dirección de un rebote; Hopkins et al., 2009), y queda abierto a ratificación del cuerpo técnico (pregunta Q1 del spec H1). La regla vive en dos lugares y solo dos: este documento (el porqué) y la capa de cálculo compartida de `packages/analytics-core` (el cómo), nunca hardcodeada en las tools del MCP.

El mismo principio gobierna el **readiness diario**: un check-in aislado de sueño/fatiga malo es un dato del día, no un estado del atleta; los umbrales de alerta de `recuperacion_carga_descanso.md` se leen sobre patrones de varios días, no sobre una mañana.

## Cómo comunicar datos provisionales

- **Al coach:** "señal provisional (1 prueba): posible déficit de fuerza — confirmar en la próxima ventana" en lugar de "débil en fuerza".
- **Al padre:** nunca reportar diagnósticos con n<3; el reporte al padre usa solo señales firmes o descripciones neutras ("completó su primera evaluación de la temporada").
- **Entre agentes de IA:** toda tool que devuelva un diagnóstico debe adjuntar n y el nivel de confianza, para que el agente consumidor no re-eleve un dato provisional a afirmación.

## Fuentes

- Tversky, A., & Kahneman, D. (1971). Belief in the law of small numbers. *Psychological Bulletin*, 76(2), 105-110. DOI: 10.1037/h0031322. (La intuición errónea de que muestras chicas representan a la población).
- Hopkins, W. G. (2000). Measures of reliability in sports medicine and science. *Sports Medicine*, 30(1), 1-15. DOI: 10.2165/00007256-200030010-00001. (Error típico de medición y su papel en la interpretación de cambios).
- Atkinson, G., & Nevill, A. M. (1998). Statistical methods for assessing measurement error (reliability) in variables relevant to sports medicine. *Sports Medicine*, 26(4), 217-238. DOI: 10.2165/00007256-199826040-00002. (Un cambio solo es interpretable si supera el error de la prueba).
- Barnett, A. G., van der Pols, J. C., & Dobson, A. J. (2005). Regression to the mean: what it is and how to deal with it. *International Journal of Epidemiology*, 34(1), 215-220. DOI: 10.1093/ije/dyh299. (El rebote estadístico tras mediciones extremas).
- Hopkins, W. G., Marshall, S. W., Batterham, A. M., & Hanin, J. (2009). Progressive statistics for studies in sports medicine and exercise science. *Medicine & Science in Sports & Exercise*, 41(1), 3-13. DOI: 10.1249/MSS.0b013e31818cb278. (Magnitudes mínimas interpretables y práctica estadística en ciencias del deporte).

### Fuentes internas del club Black Gold

- `docs/spec_h1_autonomia_resultados.md` (H1-D2: la regla n<3 como prerrequisito de toda autonomía; Q1: umbral pendiente de ratificación).
- Documentos hermanos del rack: `blackgold-mcp/knowledge/crecimiento_maduracion.md` (la maduración como otra fuente de variación no atribuible al entrenamiento), `blackgold-mcp/knowledge/deteccion_talentos.md` (no decidir con una sola batería; regla de no transponer baremos de adulto), `blackgold-mcp/knowledge/recuperacion_carga_descanso.md` (umbrales de readiness leídos sobre patrones, no sobre un día), `docs/baremos_cientificos.md` (los umbrales que estas mediciones alimentan).
