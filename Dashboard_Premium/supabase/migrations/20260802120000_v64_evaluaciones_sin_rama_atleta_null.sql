-- v64 — `evaluaciones_pruebas` deja de tener la rama `atleta_id IS NULL`.
--
-- Hallazgo del QA de propagación multi-dispositivo (2026-08-02). La policy
-- `evaluaciones_staff` viene de v29 y su USING/WITH CHECK dice, literalmente:
--
--     es_superadmin()
--     OR (es_staff() AND (atleta_id IS NULL OR club_de_atleta(atleta_id) = current_user_club()))
--                        ^^^^^^^^^^^^^^^^^^^^
--
-- Esa primera rama no menciona el club: una fila con `atleta_id` nulo queda
-- al alcance de CUALQUIER staff de CUALQUIER club. Es el único resquicio
-- cross-club que le queda a esta tabla.
--
-- Por qué ahora: v53 §3.4 cerró EXACTAMENTE esta rama en la tabla hermana
-- `progreso_misiones`, razonando que ninguna ruta viva inserta con atleta nulo.
-- El mismo razonamiento aplica aquí; `evaluaciones_pruebas` simplemente se
-- quedó fuera de aquel PR, así que esto es cerrar una asimetría, no un diseño.
--
-- Impacto real hoy: BAJO, y conviene decirlo sin inflarlo. No expone ninguna
-- fila existente — ninguna ruta de la app inserta con atleta nulo
-- (`EvaluacionModal.jsx`, `AntropometriaModal.jsx` y las tres inserciones de
-- `generar-misiones-ia` pasan siempre un atleta real). Lo que cierra es un
-- canal LATENTE, del tipo que esta base ya decidió no dejar abierto.
--
-- Qué NO se toca:
--   · `evaluaciones_select_propio` (v24) — atleta y padre siguen viendo lo suyo
--     por `mis_atletas()`; esa policy nunca tuvo rama de atleta nulo.
--   · La columna sigue siendo nullable. Ponerla NOT NULL es otra decisión, con
--     otro riesgo, y no hace falta para cerrar esto.
--
-- Verificación tras aplicar: `npm run test:rls` debe seguir en verde. Ojo: esa
-- suite NO cubre este caso — no hay ningún assert de aislamiento cross-club
-- sobre `evaluaciones_pruebas` (se ejercita sobre `pagos` y `progreso_misiones`).

DROP POLICY IF EXISTS evaluaciones_staff ON public.evaluaciones_pruebas;
CREATE POLICY evaluaciones_staff ON public.evaluaciones_pruebas FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

COMMENT ON POLICY evaluaciones_staff ON public.evaluaciones_pruebas IS
  'Staff activo, acotado a su club por club_de_atleta(). v64 quitó la rama de '
  'atleta nulo, que quedaba al alcance de otro club (misma corrección que v53 '
  'aplicó a progreso_misiones). Si una ruta nueva necesitara filas sin atleta, '
  'el club debe viajar en una columna propia, no reabrir esa rama.';
