-- Los índices compuestos existentes sirven al pipeline y a la cola de Lily,
-- pero no cubren por sí solos las llaves foráneas en operaciones de borrado o
-- actualización del padre.
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_etapa_codigo
  ON public.crm_oportunidades (etapa_codigo);

CREATE INDEX IF NOT EXISTS idx_crm_actividades_oportunidad
  ON public.crm_actividades (oportunidad_id);
