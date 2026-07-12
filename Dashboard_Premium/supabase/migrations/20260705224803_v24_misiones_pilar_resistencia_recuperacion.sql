-- ============================================================
-- MIGRACIÓN v24 — pilares 'resistencia' y 'recuperacion' en misiones
-- ============================================================
-- El CHECK misiones_pilar_check (definido en v17, nunca ampliado) solo admitía los
-- 7 sub-pilares históricos + youtube/articulo. Bloqueaba todo INSERT de misiones de
-- 'resistencia' (8º sub-pilar del radar desde P1.5) y de 'recuperacion' (el pilar de
-- las misiones de readiness que insertar_misiones_recuperacion hardcodea) — por eso
-- el catálogo tenía 0 de cada una: los INSERT fallaban con el CHECK.
--
-- Ampliar un CHECK es estricto→laxo: no puede fallar con datos existentes (mismo
-- razonamiento que v22). Todos los pilares previos se conservan.

ALTER TABLE misiones DROP CONSTRAINT IF EXISTS misiones_pilar_check;
ALTER TABLE misiones
  ADD CONSTRAINT misiones_pilar_check
  CHECK (pilar IN (
    'youtube', 'articulo',
    'fuerza', 'explosividad', 'resistencia', 'movilidad',
    'tiro', 'agilidad',
    'tactica', 'resiliencia',
    'recuperacion'
  ));
