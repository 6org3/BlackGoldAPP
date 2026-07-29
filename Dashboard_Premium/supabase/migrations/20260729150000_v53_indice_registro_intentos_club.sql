-- ============================================================================
-- v53 — Índice para el tope de inscripciones por club (cierra P1-6 con v52 §5)
-- ============================================================================
-- v52 §5 creó `registro_intentos` con el índice (ip, created_at DESC), que es
-- el que sirve al límite por IP. La Edge Function `registro-publico` aplica
-- además un tope diario POR CLUB, y esa consulta filtra por otra combinación:
--
--   SELECT count(*) FROM registro_intentos
--    WHERE club = $1 AND exito = true AND created_at >= now() - interval '24 h';
--
-- Sin índice propio eso es un seq scan sobre la única tabla del esquema cuyo
-- tamaño puede inflar un desconocido sin autenticarse: cada intento de abuso
-- deja fila, así que el costo del control de abuso crecería con el abuso
-- mismo. Índice PARCIAL (solo `exito`) porque el tope por club cuenta
-- únicamente las altas efectivas — los fallos no gastan cuota de club, si no
-- bastarían peticiones inválidas para dejar a un club sin inscripciones.
--
-- Retención: la tabla no se purga sola. Si algún día pesa, es seguro borrar lo
-- anterior a 24 h — ninguna ventana de control mira más atrás.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_registro_intentos_club_fecha
  ON public.registro_intentos (club, created_at DESC)
  WHERE exito;

COMMENT ON INDEX public.idx_registro_intentos_club_fecha IS
  'Tope diario de altas por club en registro-publico (v53). Parcial: el tope solo cuenta intentos exitosos.';
