-- ============================================================================
-- fk_grupo_on_delete_historial — declara explícito el ON DELETE que faltaba en
-- dos FKs de grupos_entrenamiento(id): comunicaciones.grupo_id (baseline.sql:1086)
-- y sesiones_control.grupo_id (baseline.sql:1236). Sin cláusula, Postgres usa
-- NO ACTION por defecto: hoy ya bloquean el DELETE de un grupo con historial de
-- comunicaciones o sesiones, pero el esquema no lo dice — lee como un olvido,
-- no como una decisión.
--
-- Tentación evaluada (y descartada): ON DELETE SET NULL, para que un grupo con
-- historial pero SIN atletas hoy (inscritos=0, la condición que enciende el
-- botón "Eliminar" en AdminGrupos.jsx) se pueda borrar sin fallar.
--
-- Se descarta por el mismo motivo que v37 §4 ya descartó SET NULL para
-- atletas.grupo_id: sería un cambio de comportamiento SILENCIOSO. Hoy borrar
-- un grupo "usado" FALLA con 23503, gruposService.js lo traduce a un mensaje
-- claro ("Archívalo en vez de borrarlo") y el propio comentario de
-- eliminarGrupo() ya documenta la regla: "en cuanto tenga atletas, sesiones,
-- comunicaciones o tarifas, la base lo impide (y ese rechazo es deseable)".
-- eliminarGrupo() solo tiene sentido para un grupo recién creado por error,
-- sin ningún historial todavía — no para "vaciar" uno que sí lo tuvo.
--
-- Con SET NULL ese DELETE tendría éxito: la fila de comunicaciones/sesiones_
-- control sobrevive, pero pierde en silencio de qué grupo era (sesiones_control
-- además carga es_pago_extra/monto_extra — datos con lectura de facturación,
-- no solo bitácora). grupos_write (v29:364-371) es FOR ALL, así que cualquier
-- staff del club ya puede mandar ese DELETE por PostgREST sin pasar por el
-- gate de la UI. Ninguna de las dos tablas tiene NOT NULL en grupo_id (serían
-- candidatas técnicamente válidas para SET NULL), pero "técnicamente posible"
-- no es "coherente con lo que el resto del código ya decidió": se prefiere
-- seguir fallando fuerte y mandar a archivar, que es exactamente lo que ya
-- pasa hoy.
--
-- Este archivo NO cambia comportamiento en producción (NO ACTION implícito →
-- NO ACTION explícito). Lo que cambia es que el esquema ahora dice la decisión
-- en vez de dejarla a la lectura del default de Postgres, y dos futuras
-- lecturas del baseline dump ya no la vuelven a poner en duda.
-- ============================================================================

ALTER TABLE public.comunicaciones
  DROP CONSTRAINT comunicaciones_grupo_id_fkey;
ALTER TABLE public.comunicaciones
  ADD CONSTRAINT comunicaciones_grupo_id_fkey
  FOREIGN KEY (grupo_id) REFERENCES public.grupos_entrenamiento(id) ON DELETE NO ACTION;

ALTER TABLE public.sesiones_control
  DROP CONSTRAINT sesiones_control_grupo_id_fkey;
ALTER TABLE public.sesiones_control
  ADD CONSTRAINT sesiones_control_grupo_id_fkey
  FOREIGN KEY (grupo_id) REFERENCES public.grupos_entrenamiento(id) ON DELETE NO ACTION;
