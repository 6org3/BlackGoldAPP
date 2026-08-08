-- v65 — Las evaluaciones y el perfil deportivo deben refrescarse entre sesiones.
-- La publicación no otorga permisos: Realtime evalúa las políticas RLS de la
-- tabla para cada JWT suscrito.

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
