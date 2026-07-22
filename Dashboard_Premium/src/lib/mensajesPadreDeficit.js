// src/lib/mensajesPadreDeficit.js
// Traducción a lenguaje llano de los déficits que devuelve evaluarDeficits()
// (packages/analytics-core/didactica.js) — SOLO para la vista del padre.
//
// evaluarDeficits() es una función pura compartida con blackgold-mcp (ver
// CLAUDE.md: analytics-core es capa compartida): su `mensaje` está escrito
// para el coach ("Protocolo Milo Rebuilding", "Fase biológica: PSICOMOTRIZ"),
// deliberadamente. No se toca esa función — mismo patrón que `tono="simple"`
// en CardDiagnosticoIA/CardReadinessIA: la traducción vive en la capa de
// presentación, indexada por `condicion` (la clave estable del déficit, no
// el texto técnico que puede cambiar).

const MENSAJES_POR_CONDICION = {
  // didactica.js — recuperación
  sobreentrenamiento_activo: 'Necesita descansar más de lo normal esta semana. Prioriza que duerma 10-12 horas y tenga tiempo libre para relajarse; evita entrenamientos extra por ahora.',
  fatiga_silenciosa: 'Está mostrando señales de cansancio acumulado. Vale la pena bajar un poco el ritmo esta semana y prestar atención a cómo duerme.',

  // readiness.js — check-in diario
  deshidratado_extremo: 'Llegó muy deshidratado a entrenar hoy. Asegúrate de que tome agua durante todo el día, no solo antes de la sesión.',
  hidratacion_baja: 'Podría estar tomando menos agua de la que necesita. Un vaso extra antes de entrenar ayuda mucho.',
  sueno_deficiente: 'No está durmiendo lo suficiente. El descanso es tan importante como el entrenamiento para que rinda bien.',
  fatiga_alta: 'Reportó sentirse muy cansado/a hoy. Un día de descanso activo (caminar, jugar, sin exigir de más) le vendría bien.',

  // didactica.js — pilares de desarrollo
  resiliencia_baja: 'Está aprendiendo a manejar mejor la frustración durante el juego. Es normal a su edad — anímalo/a a seguir intentando sin presionar por el resultado.',
  tactica_baja: 'Está aprendiendo los fundamentos del básquet: leer la cancha, encontrar espacios, la mecánica del tiro. Con práctica constante mejora rápido.',
  explosividad_baja: 'Está trabajando su salto y velocidad de reacción. Estos ejercicios toman tiempo — la constancia es lo que cuenta.',
  fuerza_movilidad_baja: 'El coach está reforzando su fuerza y flexibilidad con ejercicios adaptados a su edad. Es parte normal de su desarrollo.',
  resistencia_baja: 'Está construyendo su tanque de energía para aguantar el partido completo. El juego activo fuera de la cancha (bici, natación, correr jugando) le ayuda muchísimo.',
  tiro_bajo: 'Está puliendo la mecánica de su tiro. Mejora con repeticiones cortas y alguien que le diga cómo va — la paciencia cuenta más que la cantidad.',
  agilidad_baja: 'Está trabajando su juego de pies y los cambios de dirección. Jugar a atrapadas o a esquivar en casa es una forma divertida de reforzarlo.',
  baja_dorsiflexion: 'El coach está dando seguimiento a la movilidad de su tobillo para prevenir molestias al saltar y caer. Nada de qué preocuparse, solo seguimiento.',
  asimetria_imtp: 'El coach notó que un lado de su cuerpo trabaja algo más que el otro y lo está equilibrando con ejercicios específicos.',

  // didactica.js — RPE / percepción de esfuerzo
  rpe_extremo: 'Sintió que el entrenamiento de hoy fue muy exigente. Un día de recuperación activa (estiramiento, movilidad suave) le ayudará a recuperarse.',
  percepcion_alterada: 'Sintió el entrenamiento más duro de lo que esperaba el coach. Puede ser cansancio acumulado — vale la pena revisar cómo está durmiendo y comiendo.',
  sobrerrendimiento_percibido: 'El entrenamiento fue exigente pero lo sintió manejable — buena señal de que está respondiendo bien a la carga.',
};

// Si aparece una `condicion` nueva que aún no tiene traducción, nunca se
// muestra el mensaje técnico — se cae a un aviso genérico honesto por
// prioridad, para no filtrar jerga clínica por accidente.
const FALLBACK_POR_PRIORIDAD = {
  critica: 'El coach está dándole seguimiento cercano a un aspecto de su desarrollo esta semana — pregúntale en la próxima sesión si hay algo que cuidar en casa.',
  alta: 'El coach está trabajando un aspecto puntual de su desarrollo esta semana.',
  media: 'El coach está afinando un detalle de su desarrollo — nada que requiera atención especial en casa.',
};

/** Mensaje en lenguaje llano para un déficit de evaluarDeficits(), pensado para un padre. */
export function mensajeParaPadre(deficit) {
  return MENSAJES_POR_CONDICION[deficit?.condicion]
    ?? FALLBACK_POR_PRIORIDAD[deficit?.prioridad]
    ?? FALLBACK_POR_PRIORIDAD.media;
}
