-- ============================================================
-- MIGRACIÓN v19 — Autenticación real con Supabase Auth
-- Ejecutar en: Supabase → SQL Editor
-- Diseño: docs/plan_remediacion_seguridad.md (Fase 1)
-- ============================================================
-- Sustituye el login propio (comparación directa de contraseña
-- contra `usuarios.contrasena_hash`/`cedula`, sesión sin firmar en
-- localStorage) por Supabase Auth. Cada fila de `usuarios` queda
-- vinculada a su fila real en `auth.users` vía `auth_user_id`.
--
-- Como el login histórico acepta correo, teléfono O cédula como
-- identificador (ver src/api/authService.js), y muchos atletas no
-- tienen correo real (es opcional en el registro público), Supabase
-- Auth necesita igualmente un email por cuenta. Regla: se usa el
-- correo real si existe; si no, se sintetiza uno interno e
-- inalcanzable a partir de la cédula (para padres, `cedula` ya es el
-- valor sintético `PADRE_<telefono>` que usa registroPublicoService.js,
-- así que la regla es uniforme para todos los roles).
-- ============================================================


-- ------------------------------------------------------------
-- 1. VÍNCULO usuarios ↔ auth.users
-- ------------------------------------------------------------

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_user_id_key
  ON usuarios (auth_user_id)
  WHERE auth_user_id IS NOT NULL;


-- ------------------------------------------------------------
-- 2. RESOLVER DE EMAIL PARA LOGIN
-- ------------------------------------------------------------
-- Recibe lo que el usuario escribe en el campo "correo, teléfono o
-- cédula" del login y devuelve el email real que hay que usar con
-- supabase.auth.signInWithPassword(). Debe ser invocable por `anon`
-- ANTES de autenticar (es la única forma de traducir "cédula" a un
-- email de Auth), por eso es SECURITY DEFINER — pero solo expone el
-- email resuelto, nunca otras columnas de `usuarios`.

CREATE OR REPLACE FUNCTION resolver_email_login(p_identificador TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(correo, cedula || '@sinacceso.blackgoldapp.internal')
  FROM usuarios
  WHERE correo = p_identificador
     OR telefono = p_identificador
     OR cedula = p_identificador
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolver_email_login(TEXT) TO anon, authenticated;


-- ------------------------------------------------------------
-- 3. NOTAS PARA LAS FASES SIGUIENTES (no ejecutable, referencia)
-- ------------------------------------------------------------
-- - `usuarios.contrasena_hash` queda obsoleta tras completar la
--   migración de usuarios existentes (scripts/migrar_usuarios_a_auth.js)
--   y debe eliminarse en una migración v20 posterior, junto con el
--   endurecimiento real de RLS (ver Fase 2 del plan de remediación).
-- - Mientras `auth_user_id` sea NULL para una fila de `usuarios`, ese
--   usuario todavía no fue migrado y no podrá iniciar sesión con el
--   nuevo AuthContext — de ahí que el script de migración deba correr
--   ANTES de desplegar el frontend nuevo a producción.
