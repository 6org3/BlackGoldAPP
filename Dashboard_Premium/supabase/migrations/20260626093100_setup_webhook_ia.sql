-- Migración consolidada desde Dashboard_Premium/supabase/migrations/setup_webhook_ia.sql (ya versionado, solo renombrado) (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
-- 1. Asegurarnos que la extensión pg_net esté habilitada para hacer peticiones HTTP
create extension if not exists pg_net;

-- 2. Crear la función del trigger que llamará a la Edge Function
create or replace function public.invoke_ai_mission_generator()
returns trigger as $$
begin
  perform net.http_post(
      -- Reemplaza este URL por el URL de despliegue de tu Edge Function
      -- Estará en tu Dashboard > Edge Functions
      url:='https://rpacqduboxkhetdlcgxb.supabase.co/functions/v1/generar-misiones-ia',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body:=json_build_object(
        'type', TG_OP,
        'record', row_to_json(NEW)
      )::jsonb
  );
  return NEW;
end;
$$ language plpgsql security definer;

-- 3. Crear el Trigger en la tabla evaluaciones_pruebas
drop trigger if exists on_new_evaluation_generate_mission on public.evaluaciones_pruebas;
create trigger on_new_evaluation_generate_mission
  after insert on public.evaluaciones_pruebas
  for each row execute function public.invoke_ai_mission_generator();
