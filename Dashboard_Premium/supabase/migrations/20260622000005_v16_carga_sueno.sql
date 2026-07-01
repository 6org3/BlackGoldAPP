-- Migración consolidada desde Dashboard_Premium/supabase_migration_v16_carga_sueno.sql (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
-- Insertar el test de recuperación en la tabla catalogo_ejercicios si no existe
INSERT INTO catalogo_ejercicios (
  nombre, 
  descripcion, 
  unidad, 
  pilar, 
  sub_pilar, 
  invertido, 
  thresholds
)
SELECT 
  'Carga Subjetiva y Sueño',
  'Evaluación rápida del atleta de 0 (Agotamiento extremo) a 10 (Óptimo) combinando dolor muscular y calidad de sueño.',
  'pts',
  'fisico',
  'recuperacion',
  false,
  '{ "Todas": { "tier_1": 8, "tier_2": 6, "tier_3": 4, "tier_4": 2 } }'
WHERE NOT EXISTS (
  SELECT 1 FROM catalogo_ejercicios WHERE nombre = 'Carga Subjetiva y Sueño'
);
