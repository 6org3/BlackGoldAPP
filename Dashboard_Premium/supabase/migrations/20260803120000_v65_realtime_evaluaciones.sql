-- v65 — `evaluaciones_pruebas` y `atletas` empiezan a emitir por Realtime.
--
-- Hallazgo del QA de propagación multi-dispositivo (2026-08-03). Cuando un
-- coach guarda una evaluación física, el dato queda visible para los cuatro
-- roles en 227–361 ms: la escritura y la RLS no son el problema. El problema
-- es que NADIE vuelve a preguntar. La app no tiene polling, no refresca al
-- volver el foco, y las dos suscripciones Realtime que existen en el cliente
-- apuntan a tablas que la publicación no incluye:
--
--     select tablename from pg_publication_tables
--      where pubname = 'supabase_realtime' and schemaname = 'public';
--     -- `evaluaciones_pruebas` NO aparece.
--
-- Comprobado que el transporte sí funciona (un `broadcast` de prueba llegó en
-- 149 ms), así que lo único que falta es que la tabla entre en la publicación:
-- sin eso, `postgres_changes` se suscribe sin error y no recibe nada nunca.
-- Ese silencio es lo que hacía ver datos congelados hasta recargar a mano.
--
-- Por qué también `atletas`: al guardar una evaluación el cliente encadena
-- `recalcularOverall()`, que ESCRIBE en `atletas` (overall_score, rango, xp).
-- Publicar solo `evaluaciones_pruebas` dejaría una carrera visible — el
-- refetch disparado por la evaluación puede llegar antes de que el overall se
-- haya recalculado, y la pantalla se quedaría con el número viejo hasta el
-- siguiente evento. Con las dos publicadas, el segundo evento cierra el hueco.
-- De paso revive `useMisionesPanelXPWatch`, que lleva desde su PR suscrito a
-- UPDATE de `atletas` sin recibir un solo evento (el level-up nunca saltaba).
--
-- SEGURIDAD — esto NO abre datos de otros clubes. Realtime evalúa la RLS de la
-- tabla contra el JWT del suscriptor antes de entregarle cada fila de
-- `postgres_changes`; publicar una tabla no es concederle SELECT a nadie. Las
-- policies vigentes siguen siendo las que filtran, sin cambio alguno aquí:
--   · `evaluaciones_staff` (v64) — staff acotado por `club_de_atleta()`.
--   · `evaluaciones_select_propio` (v24) — atleta y padre por `mis_atletas()`.
--   · las de `atletas` (v24/v29) — mismo criterio de club y de familia.
-- Un cliente ANÓNIMO no recibe nada por el mismo motivo por el que hoy no
-- puede leer estas tablas por PostgREST. Lo que sí conviene saber: el filtro
-- es por fila, no por columna — quien ya puede leer la fila la recibe entera.
-- En estas dos tablas eso no añade nada que la app no le muestre ya.
--
-- Qué NO se toca:
--   · Ninguna policy, ningún GRANT, ningún privilegio por defecto.
--   · La REPLICA IDENTITY sigue en DEFAULT: el payload de UPDATE/DELETE trae
--     solo la clave primaria en `old`. La app no la usa — reacciona al evento
--     volviendo a consultar por su vía normal (con RLS), no leyendo el
--     payload. Ponerla en FULL replicaría la fila entera en el WAL sin que
--     nadie lo aproveche.
--   · Las demás tablas siguen fuera de la publicación. `sesiones_programadas`
--     (a la que se suscribe `Sidebar.jsx`) tampoco está, y por tanto ese
--     contador tampoco se refresca solo — se deja anotado, no se arrastra
--     aquí: cada tabla publicada es carga permanente de WAL y merece su
--     propia justificación medida.
--
-- Forma idempotente a propósito: `ALTER PUBLICATION ... ADD TABLE` falla si la
-- tabla ya está, y estas migraciones se reaplican en entornos nuevos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'evaluaciones_pruebas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluaciones_pruebas;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'atletas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atletas;
  END IF;
END $$;
