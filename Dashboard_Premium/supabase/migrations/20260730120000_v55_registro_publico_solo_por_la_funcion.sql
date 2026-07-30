-- ============================================================================
-- v55 — El registro público solo entra por la Edge Function.
--
-- HALLAZGO (2026-07-30, entrega 3 del arranque con datos reales).
-- Todo el control de abuso que montó el PR #145 —límite de 5 altas por IP y
-- hora, tope de 20 por club y día, captcha Turnstile, compensación del alta
-- cuando falla `admin.createUser`— vive DENTRO de la Edge Function
-- `registro-publico`. Pero `registrar_publico()` seguía concedida a `anon`
-- desde v24, así que cualquiera podía llamarla por PostgREST y saltárselo todo:
--
--     POST /rest/v1/rpc/registrar_publico  (apikey: la anon key, que es pública)
--
-- Comprobado contra producción: responde `P0001 Cédula, nombre y fecha de
-- nacimiento del atleta son obligatorios`. Es la validación de negocio de la
-- propia función, o sea que la llamada ENTRA — no hay `42501`.
--
-- Lo que eso permite, sin ningún freno ni rastro en `registro_intentos`:
--   · Insertar filas en `usuarios`/`atletas` en bucle.
--   · Y sobre todo QUEMAR CÉDULAS. La fila que crea la RPC nace sin
--     `auth_user_id` (la cuenta de Auth la crea después la Edge Function), y
--     `usuarios.cedula` es UNIQUE: barrer un rango de cédulas reales deja a
--     esas personas sin poder inscribirse nunca, y deshacerlo exige que el
--     dueño rechace una por una y el superadmin las purgue.
--
-- La Edge Function usa `service_role`, así que quitarle el permiso a `anon` no
-- le afecta: solo cierra la puerta de atrás. `authenticated` tampoco la
-- necesita — quien ya tiene sesión no se registra.
--
-- Esto además convierte a la Edge Function en el único sitio donde validar el
-- alta, que es lo que permite exigir ahí el correo del representante (entrega 3)
-- sin tener que recrear la función entera.
-- ============================================================================

REVOKE ALL ON FUNCTION public.registrar_publico(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_publico(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.registrar_publico(jsonb, jsonb) IS
  'Alta pública transaccional (v24/v33). Desde v55 SOLO la llama la Edge Function registro-publico con service_role: por PostgREST se saltaba el control de abuso y permitía quemar cédulas.';
