-- ============================================================
-- MIGRACIÓN v43 — octavo pilar (resistencia): cierre de reproducibilidad P1.5
-- ============================================================
-- Las 4 pruebas de resistencia (Course Navette, 600 m, 1000 m, Yo-Yo IR1)
-- existían en prod SOLO por inserción manual vía MCP — ninguna migración las
-- creaba, así que una DB recreada desde baseline+migraciones quedaba sin el
-- 8º sub-pilar medible. Esta migración cierra esa deuda:
--
--   1. Siembra las 4 pruebas en catalogo_ejercicios con los valores exactos
--      de prod (idempotente: en prod donde ya existen es no-op).
--   2. Backfill de baremo_key (en prod quedó NULL): enlaza cada prueba con su
--      entrada del BAREMOS estático de packages/analytics-core/baremos.js,
--      que incorpora estas keys en este mismo PR.
--   3. Cierra el sub_pilar NULL que v21 dejó pendiente a propósito en la
--      plantilla 'Físico - Resistencia' de catalogo_sesiones ("pendiente de
--      P1.5"); en prod ya se corrigió a mano → no-op.
--   4. Tres misiones nuevas enlazadas a los déficits del motor didáctico
--      (decisión de producto: cobertura de los 8 sub-pilares). Existían
--      triggers para resiliencia_baja, tactica_baja, explosividad_baja,
--      fuerza_movilidad_baja, etc., pero resistencia, tiro y agilidad no
--      tenían NINGUNA misión de déficit — se agregan resistencia_baja,
--      tiro_bajo y agilidad_baja siguiendo el patrón de las existentes.
--
-- Todo es aditivo e idempotente: puede correr sobre prod (filas ya presentes)
-- o sobre una DB recreada (las crea desde cero).

-- ------------------------------------------------------------
-- 1. Las 4 pruebas de resistencia en catalogo_ejercicios.
--    Valores exactos de prod. Se excluyen id/fecha_creacion (defaults) y
--    baremo_key (NULL en prod; lo setea el backfill del paso 2, que así
--    cubre por igual la fila recién insertada y la ya existente en prod).
-- ------------------------------------------------------------

INSERT INTO catalogo_ejercicios
  (nombre, descripcion, pilar, sub_pilar, tren, unidad, invertido,
   thresholds, inputs_requeridos, creado_por, club_id, tipo,
   descripcion_ejecucion, autor_id)
SELECT
  'Course Navette (Léger 20m)',
  $txt$Capacidad aeróbica (VO2max estimado) mediante carrera de ida y vuelta de 20 m con ritmo progresivo por audio. Base de la resistencia intermitente que exige el baloncesto.

Fundamento: Test de campo aeróbico más validado en población pediátrica: Léger et al. 1988 (J Sports Sci); normas internacionales 9-17 años de Tomkinson et al. 2017 (Br J Sports Med, n≈1.14M). Fase sensible de resistencia aeróbica desde 9-10 años (Vinueza, Cap. II). Dimorfismo sexual documentado → capa por género. Capa de nivel: Desarrollo = norma poblacional; Micro -10% / Elite +10% de exigencia (regla metodológica interna del club, alineada al marco de percentiles de Vinueza; recalibrar con datos propios).$txt$,
  'fisico',
  'resistencia',
  NULL,
  'paliers',
  false,
  $json$
  {
    "Femenino": {
      "Sub12":  {"Elite": [3, 4, 5, 6],          "Micro": [2.5, 3, 4, 5],       "Desarrollo": [2.5, 3.5, 4.5, 5.5]},
      "Sub15":  {"Elite": [4, 5, 6, 7.5],        "Micro": [3, 4, 5, 6.5],       "Desarrollo": [3.5, 4.5, 5.5, 7]},
      "Sub18":  {"Elite": [4.5, 5.5, 6.5, 8.5],  "Micro": [3.5, 4.5, 5.5, 7],   "Desarrollo": [4, 5, 6, 7.5]},
      "Senior": {"Elite": [4.5, 6, 7, 9],        "Micro": [3.5, 5, 6, 7],       "Desarrollo": [4, 5.5, 6.5, 8]}
    },
    "Masculino": {
      "Sub12":  {"Elite": [4, 5, 6, 7],          "Micro": [3, 4, 5, 6],         "Desarrollo": [3.5, 4.5, 5.5, 6.5]},
      "Sub15":  {"Elite": [5.5, 7, 9, 10.5],     "Micro": [4.5, 6, 7, 8.5],     "Desarrollo": [5, 6.5, 8, 9.5]},
      "Sub18":  {"Elite": [6.5, 8.5, 10, 11.5],  "Micro": [5.5, 7, 8, 9.5],     "Desarrollo": [6, 7.5, 9, 10.5]},
      "Senior": {"Elite": [7, 9, 10.5, 12],      "Micro": [6, 7, 8.5, 10],      "Desarrollo": [6.5, 8, 9.5, 11]}
    }
  }
  $json$::jsonb,
  '[{"id": "unico", "label": "Medida en paliers"}]'::jsonb,
  NULL,
  NULL,
  'mas_es_mejor',
  $txt$Ida y vuelta entre dos líneas a 20 m al ritmo del audio (la velocidad sube por palier). Termina cuando el atleta no pisa la línea al beep dos veces seguidas. Registrar el último palier completado (admite medios paliers, ej. 5.5).$txt$,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM catalogo_ejercicios c WHERE c.nombre = 'Course Navette (Léger 20m)'
);

INSERT INTO catalogo_ejercicios
  (nombre, descripcion, pilar, sub_pilar, tren, unidad, invertido,
   thresholds, inputs_requeridos, creado_por, club_id, tipo,
   descripcion_ejecucion, autor_id)
SELECT
  'Carrera 600 m (Vinueza)',
  $txt$Resistencia aeróbica de la batería ecuatoriana de detección para 9-10 años (bucket Sub12). Complemento de campo del Course Navette cuando no hay audio disponible.

Fundamento: Prueba nº5 de la batería de detección física de Vinueza (9-10 años, normas de población ecuatoriana — ver guía del club). CORTES PROVISIONALES estimados de literatura de atletismo escolar: el resumen disponible no incluye las tablas de segundos originales; calibrar con los primeros datos del club. Capa de nivel: Desarrollo = norma poblacional; Micro -10% / Elite +10% de exigencia (regla metodológica interna del club, alineada al marco de percentiles de Vinueza; recalibrar con datos propios).$txt$,
  'fisico',
  'resistencia',
  NULL,
  'segundos',
  true,
  $json$
  {
    "Femenino": {
      "Sub12": {"Elite": [135, 149, 162, 180], "Micro": [165, 182, 198, 220], "Desarrollo": [150, 165, 180, 200]}
    },
    "Masculino": {
      "Sub12": {"Elite": [126, 140, 153, 171], "Micro": [154, 171, 187, 209], "Desarrollo": [140, 155, 170, 190]}
    }
  }
  $json$::jsonb,
  '[{"id": "unico", "label": "Medida en segundos"}]'::jsonb,
  NULL,
  NULL,
  'menos_es_mejor',
  $txt$En pista o cancha con distancia medida, correr 600 m en el menor tiempo posible. Salida de pie, cronómetro manual. Registrar el tiempo total en segundos.$txt$,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM catalogo_ejercicios c WHERE c.nombre = 'Carrera 600 m (Vinueza)'
);

INSERT INTO catalogo_ejercicios
  (nombre, descripcion, pilar, sub_pilar, tren, unidad, invertido,
   thresholds, inputs_requeridos, creado_por, club_id, tipo,
   descripcion_ejecucion, autor_id)
SELECT
  'Carrera 1000 m (Vinueza)',
  $txt$Resistencia aeróbica de la batería ecuatoriana de detección para 11-12 años (bucket Sub15).

Fundamento: Prueba nº5 de la batería de detección física de Vinueza (11-12 años, normas de población ecuatoriana — ver guía del club). CORTES PROVISIONALES estimados de literatura de atletismo escolar: el resumen disponible no incluye las tablas de segundos originales; calibrar con los primeros datos del club. Capa de nivel: Desarrollo = norma poblacional; Micro -10% / Elite +10% de exigencia (regla metodológica interna del club, alineada al marco de percentiles de Vinueza; recalibrar con datos propios).$txt$,
  'fisico',
  'resistencia',
  NULL,
  'segundos',
  true,
  $json$
  {
    "Femenino": {
      "Sub15": {"Elite": [239, 261, 284, 311], "Micro": [292, 319, 347, 380], "Desarrollo": [265, 290, 315, 345]}
    },
    "Masculino": {
      "Sub15": {"Elite": [216, 239, 261, 288], "Micro": [264, 292, 319, 352], "Desarrollo": [240, 265, 290, 320]}
    }
  }
  $json$::jsonb,
  '[{"id": "unico", "label": "Medida en segundos"}]'::jsonb,
  NULL,
  NULL,
  'menos_es_mejor',
  $txt$En pista o cancha con distancia medida, correr 1000 m en el menor tiempo posible. Salida de pie, cronómetro manual. Registrar el tiempo total en segundos.$txt$,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM catalogo_ejercicios c WHERE c.nombre = 'Carrera 1000 m (Vinueza)'
);

INSERT INTO catalogo_ejercicios
  (nombre, descripcion, pilar, sub_pilar, tren, unidad, invertido,
   thresholds, inputs_requeridos, creado_por, club_id, tipo,
   descripcion_ejecucion, autor_id)
SELECT
  'Yo-Yo Intermittent Recovery L1',
  'Evalúa capacidad aeróbica máxima (VO2Max)',
  'fisico',
  'resistencia',
  'inferior',
  'nivel',
  false,
  $json$
  {
    "Femenino":  {"Todas": [10, 12, 14, 16]},
    "Masculino": {"Todas": [12, 14, 16, 18]}
  }
  $json$::jsonb,
  '[{"id": "unico", "label": "Nivel Alcanzado"}]'::jsonb,
  NULL,
  NULL,
  'mas_es_mejor',
  $txt$Carrera intermitente de ida y vuelta (20m) con descansos de 10s, guiada por un audio que aumenta la velocidad. Anotar el último nivel completado.$txt$,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM catalogo_ejercicios c WHERE c.nombre = 'Yo-Yo Intermittent Recovery L1'
);

-- ------------------------------------------------------------
-- 2. Backfill de baremo_key (en prod las 4 filas lo tienen NULL).
--    Las keys existen en el BAREMOS estático de
--    packages/analytics-core/baremos.js a partir de este mismo PR.
--    El guard "AND baremo_key IS NULL" hace cada UPDATE idempotente y
--    respeta cualquier recalibración manual posterior.
-- ------------------------------------------------------------

-- Hardening: catalogo_ejercicios no tiene UNIQUE(nombre) (un coach puede crear
-- una prueba homónima vía NuevaPruebaModal) pero SÍ el índice único parcial
-- uniq_catalogo_baremo_key. Cada UPDATE apunta por eso a UNA sola fila
-- determinista (la más antigua con la key NULL = la canónica del MCP en prod,
-- o la recién insertada en una DB recreada) y solo si la key aún no existe.
UPDATE catalogo_ejercicios SET baremo_key = 'course_navette'
 WHERE id = (SELECT id FROM catalogo_ejercicios
              WHERE nombre = 'Course Navette (Léger 20m)' AND baremo_key IS NULL
              ORDER BY fecha_creacion ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM catalogo_ejercicios WHERE baremo_key = 'course_navette');

UPDATE catalogo_ejercicios SET baremo_key = 'carrera_600m_vinueza'
 WHERE id = (SELECT id FROM catalogo_ejercicios
              WHERE nombre = 'Carrera 600 m (Vinueza)' AND baremo_key IS NULL
              ORDER BY fecha_creacion ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM catalogo_ejercicios WHERE baremo_key = 'carrera_600m_vinueza');

UPDATE catalogo_ejercicios SET baremo_key = 'carrera_1000m_vinueza'
 WHERE id = (SELECT id FROM catalogo_ejercicios
              WHERE nombre = 'Carrera 1000 m (Vinueza)' AND baremo_key IS NULL
              ORDER BY fecha_creacion ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM catalogo_ejercicios WHERE baremo_key = 'carrera_1000m_vinueza');

UPDATE catalogo_ejercicios SET baremo_key = 'yoyo_ir1'
 WHERE id = (SELECT id FROM catalogo_ejercicios
              WHERE nombre = 'Yo-Yo Intermittent Recovery L1' AND baremo_key IS NULL
              ORDER BY fecha_creacion ASC LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM catalogo_ejercicios WHERE baremo_key = 'yoyo_ir1');

-- ------------------------------------------------------------
-- 3. catalogo_sesiones: v21 sembró 'Físico - Resistencia' con sub_pilar NULL
--    a propósito ("pendiente de P1.5"). En prod ya se corrigió a mano
--    (→ no-op); en una DB recreada desde v21 este UPDATE lo cierra.
-- ------------------------------------------------------------

UPDATE catalogo_sesiones SET sub_pilar = 'resistencia'
 WHERE titulo = 'Físico - Resistencia' AND sub_pilar IS NULL;

-- ------------------------------------------------------------
-- 4. Misiones de déficit para los 3 sub-pilares sin trigger propio.
--    Mismo patrón de columnas y flags que las misiones de déficit existentes
--    (resiliencia_baja / tactica_baja): activa, complejidad 'especifica',
--    contexto 'casa' (el motor didáctico las receta para hacer en casa),
--    sin bucket ni nivel (aplican a todos). Guard por condicion_trigger:
--    una misión por trigger, no se duplica si ya hay cobertura.
-- ------------------------------------------------------------

INSERT INTO misiones
  (titulo, descripcion, pilar, video_url, xp_recompensa, quiz,
   categoria_objetivo, created_by, condicion_trigger, autor_id,
   is_ai_generated, nivel_objetivo, categoria_bucket, justificacion,
   complejidad, activa, contexto, fase_temporada)
SELECT
  'Base aeróbica: 20 minutos de juego continuo',
  $txt$Construye tu base aeróbica sin material: muévete sin parar durante 20 minutos a ritmo de conversación (puedes hablar sin ahogarte). Si eres Sub12, que sea jugando (pilla-pilla, bici, saltar la cuerda) entre 10 y 20 minutos; Sub15, trote suave con caminatas de 30 segundos si te falta el aire; Sub18 y Senior, 20-30 minutos continuos o intervalos de 15 segundos de trabajo por 15 de pausa. Hazlo 2-3 veces por semana, con pausas de hidratación por el calor, y anota en tu diario cuántos minutos aguantaste sin parar.$txt$,
  'resistencia',
  NULL,
  50,
  '[]'::jsonb,
  NULL,
  NULL,
  'resistencia_baja',
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  'especifica',
  true,
  'casa',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM misiones WHERE condicion_trigger = 'resistencia_baja'
);

INSERT INTO misiones
  (titulo, descripcion, pilar, video_url, xp_recompensa, quiz,
   categoria_objetivo, created_by, condicion_trigger, autor_id,
   is_ai_generated, nivel_objetivo, categoria_bucket, justificacion,
   complejidad, activa, contexto, fase_temporada)
SELECT
  'Mecánica de tiro: 100 repeticiones con feedback',
  $txt$Vuelve a la base de tu tiro: 100 lanzamientos de mecánica (form shooting) en bloques de 10, contra una pared o hacia un punto fijo marcado en casa — sin canasta hace falta solo la forma. En cada bloque revisa un solo detalle (codo alineado, muñeca suelta, extensión completa del brazo) y consigue feedback: pide a alguien que te mire o grábate con el teléfono y revisa el video entre bloques. Cuenta cuántas repeticiones salieron con la forma correcta, no cuántas entraron, y registra el número en tu diario para superarlo la próxima vez.$txt$,
  'tiro',
  NULL,
  50,
  '[]'::jsonb,
  NULL,
  NULL,
  'tiro_bajo',
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  'especifica',
  true,
  'casa',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM misiones WHERE condicion_trigger = 'tiro_bajo'
);

INSERT INTO misiones
  (titulo, descripcion, pilar, video_url, xp_recompensa, quiz,
   categoria_objetivo, created_by, condicion_trigger, autor_id,
   is_ai_generated, nivel_objetivo, categoria_bucket, justificacion,
   complejidad, activa, contexto, fase_temporada)
SELECT
  'Juego de pies: cambios de dirección en casa',
  $txt$Marca un cuadrado de unos dos pasos por lado (con cinta, cuadernos o zapatos) y trabaja tu juego de pies: desplazamientos laterales, avanzar-frenar y cambios de dirección tocando cada esquina. Haz 6 rondas de 20 segundos a máxima velocidad con 40 segundos de descanso, frenando con pasos cortos y el peso bajo, sin cruzar los pies. Repítelo 3 veces por semana y mide tu tiempo en una ronda completa para ver cómo mejora.$txt$,
  'agilidad',
  NULL,
  50,
  '[]'::jsonb,
  NULL,
  NULL,
  'agilidad_baja',
  NULL,
  false,
  NULL,
  NULL,
  NULL,
  'especifica',
  true,
  'casa',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM misiones WHERE condicion_trigger = 'agilidad_baja'
);
