-- ============================================================================
-- v54 — Índice para el tope de inscripciones por club (cierra P1-6 con v52 §5)
-- ============================================================================
-- v52 §5 creó `registro_intentos` con el índice (ip, created_at DESC), que es
-- el que sirve al límite por IP. La Edge Function `registro-publico` aplica
-- además un tope diario POR CLUB, y ese control hace DOS conteos que filtran
-- por otra combinación de columnas:
--
--   -- altas efectivas del día (las que gastan cuota de verdad)
--   SELECT count(*) FROM registro_intentos
--    WHERE club = $1 AND exito = true  AND created_at >= now() - interval '24 h';
--
--   -- peticiones todavía en vuelo (reservan cupo mientras corren, para que N
--   -- simultáneas no lean todas el mismo contador y pasen todas)
--   SELECT count(*) FROM registro_intentos
--    WHERE club = $1 AND exito = false AND created_at >= now() - interval '2 min';
--
-- Sin índice eso son dos seq scans sobre la única tabla del esquema cuyo
-- tamaño puede inflar un desconocido sin autenticarse: cada intento de abuso
-- deja fila, así que el costo del control de abuso crecería con el abuso
-- mismo. El índice lleva las tres columnas en el orden que usan ambas
-- consultas —las dos igualdades primero, el rango al final— así que sirve a
-- las dos sin necesidad de un índice por cada una.
--
-- NO es parcial (`WHERE exito`): eso solo cubriría el primer conteo y dejaría
-- el segundo —el que cierra la carrera— sin índice.
--
-- Retención: la tabla no se purga sola. Si algún día pesa, es seguro borrar lo
-- anterior a 24 h — ninguna ventana de control mira más atrás.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_registro_intentos_club_fecha
  ON public.registro_intentos (club, exito, created_at DESC);

COMMENT ON INDEX public.idx_registro_intentos_club_fecha IS
  'Tope diario de altas por club en registro-publico (v54): sirve al conteo de altas exitosas y al de peticiones en vuelo.';
