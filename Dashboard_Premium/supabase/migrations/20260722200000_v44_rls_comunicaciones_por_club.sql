-- ============================================================================
-- v44 — CIERRA LA FUGA CROSS-CLUB DE LECTURA EN comunicaciones
-- ============================================================================
-- Hallazgo de la auditoría RLS de los 5 clubes simulados (2026-07-22,
-- scripts/tmp_probe_rls_5clubes.mjs): cualquier authenticated —un owner de
-- otro club, o un simple atleta— leía TODAS las comunicaciones broadcast de
-- la plataforma (título + mensaje de los anuncios de los 5 clubes).
--
-- Mecanismo: comunicaciones_select_audiencia (v24:646) concede SELECT cuando
-- segmento_tipo='general' OR tipo='Anuncio' SIN scope de club. v29 §7 re-scopeó
-- solo comunicaciones_staff ("se scopea por el club de quien la autoró"), pero
-- nunca tocó la política de audiencia; y como las políticas permisivas de
-- Postgres se combinan con OR, la rama sin scope anulaba el aislamiento.
--
-- Fix: las ramas broadcast (general/Anuncio) exigen ahora que el AUTOR sea del
-- club del lector — el mismo criterio de v29 para staff (club_de_usuario(autor_id)).
-- Un anuncio sin autor (autor_id NULL, no existe en datos vivos) deja de ser
-- visible por estas ramas para no-staff: mejor cerrado que broadcast global.
-- Las ramas por identidad (mi atleta, grupo de mi atleta, destinatarios
-- congelados) quedan intactas: ya estaban scopeadas por construcción.
--
-- Validación: node scripts/tmp_probe_rls_5clubes.mjs (la sonda que encontró
-- la fuga) debe pasar 29/29 tras aplicar esto.
-- ============================================================================

DROP POLICY IF EXISTS comunicaciones_select_audiencia ON public.comunicaciones;
CREATE POLICY comunicaciones_select_audiencia ON public.comunicaciones FOR SELECT TO authenticated
  USING (
    (
      (segmento_tipo = 'general' OR tipo = 'Anuncio')
      AND autor_id IS NOT NULL
      AND club_de_usuario(autor_id) = (select current_user_club())
    )
    OR atleta_id IN (SELECT unnest(mis_atletas()))
    OR (grupo_id IS NOT NULL AND grupo_id IN (
      SELECT ag.grupo_id FROM atleta_grupo ag WHERE ag.atleta_id IN (SELECT unnest(mis_atletas()))
      UNION
      SELECT a.grupo_id FROM atletas a WHERE a.id IN (SELECT unnest(mis_atletas())) AND a.grupo_id IS NOT NULL
    ))
    OR EXISTS (
      SELECT 1 FROM comunicacion_destinatarios cd
      WHERE cd.comunicacion_id = comunicaciones.id
        AND cd.usuario_id = (select current_usuario_id())
    )
  );
