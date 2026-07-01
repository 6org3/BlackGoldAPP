-- Migración consolidada desde poblar_atleta_grupo.sql (raíz del repo) (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
-- ============================================================
-- POBLAR atleta_grupo — pertenencia atleta ↔ grupo de entrenamiento
-- Modo: POR CATEGORÍA (tu roster está agrupado exactamente por categoría)
-- Ejecutar en: Supabase → SQL Editor
-- Requisito: haber aplicado antes supabase_migration_v18 (crea la
-- tabla atleta_grupo y la función calcular_categoria_feb()).
-- ============================================================


-- ------------------------------------------------------------
-- PASO 0: ver los nombres EXACTOS de tus grupos de entrenamiento
-- ------------------------------------------------------------
SELECT id, nombre, horario FROM grupos_entrenamiento ORDER BY nombre;


-- ------------------------------------------------------------
-- PASO 1 (opcional): crear los 6 grupos por categoría si NO existen
-- ------------------------------------------------------------
-- Si en el PASO 0 no tienes un grupo por cada categoría, descomenta
-- este bloque para crearlos. Si ya los tienes (con otros nombres),
-- sáltalo y ajusta el mapeo del PASO 2.

-- Nota: grupos_entrenamiento.horario es NOT NULL → se le da un valor
-- provisional ('Por definir') que luego editas en la app.
-- INSERT INTO grupos_entrenamiento (nombre, horario)
-- SELECT v.nombre, 'Por definir'
-- FROM (VALUES
--   ('Premini (Sub-9)'), ('Mini (Sub-11)'), ('Menores (Sub-14)'),
--   ('Prejuvenil (Sub-16)'), ('Juvenil (Sub-18)'), ('Mayores')
-- ) AS v(nombre)
-- WHERE NOT EXISTS (SELECT 1 FROM grupos_entrenamiento g WHERE g.nombre = v.nombre);


-- ------------------------------------------------------------
-- PASO 2: asignar cada atleta al grupo de su categoría
-- ------------------------------------------------------------
-- El mapeo asume que el nombre del grupo == el nombre de la categoría.
-- Si tus grupos se llaman distinto, cambia SOLO la 2ª columna
-- ('grupo_nombre') por el nombre EXACTO que viste en el PASO 0.

WITH mapeo (categoria, grupo_nombre) AS (
  VALUES
    ('Premini (Sub-9)',     'Premini (Sub-9)'),
    ('Mini (Sub-11)',       'Mini (Sub-11)'),
    ('Menores (Sub-14)',    'Menores (Sub-14)'),
    ('Prejuvenil (Sub-16)', 'Prejuvenil (Sub-16)'),
    ('Juvenil (Sub-18)',    'Juvenil (Sub-18)'),
    ('Mayores',             'Mayores')
)
INSERT INTO atleta_grupo (atleta_id, grupo_id)
SELECT a.id, g.id
FROM atletas a
JOIN usuarios u  ON u.id = a.usuario_id
JOIN mapeo m     ON m.categoria = calcular_categoria_feb(u.fecha_nacimiento)
JOIN grupos_entrenamiento g ON g.nombre = m.grupo_nombre
ON CONFLICT (atleta_id, grupo_id) DO NOTHING;


-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- Cuántos atletas quedaron en cada grupo:
SELECT g.nombre, COUNT(ag.atleta_id) AS atletas
FROM grupos_entrenamiento g
LEFT JOIN atleta_grupo ag ON ag.grupo_id = g.id
GROUP BY g.nombre
ORDER BY g.nombre;

-- Atletas que quedaron SIN grupo (revisar; deberían ser 0):
SELECT u.nombre, calcular_categoria_feb(u.fecha_nacimiento) AS categoria
FROM atletas a
JOIN usuarios u ON u.id = a.usuario_id
WHERE a.id NOT IN (SELECT atleta_id FROM atleta_grupo)
ORDER BY categoria, u.nombre;


-- ------------------------------------------------------------
-- LIMPIEZA DE DUPLICADOS detectados en el roster (revisar antes de borrar)
-- ------------------------------------------------------------
-- Hay nombres repetidos que conviene revisar (¿dos personas distintas o
-- un registro duplicado?). Esta consulta lista cualquier nombre repetido:
SELECT u.nombre, COUNT(*) AS veces
FROM atletas a
JOIN usuarios u ON u.id = a.usuario_id
GROUP BY u.nombre
HAVING COUNT(*) > 1
ORDER BY u.nombre;
-- Casos vistos en tu lista: "Bety Baquero Ango" (Mayores) y
-- "Arturo Kevin  Muñoz Mena" (Prejuvenil). Si son duplicados reales,
-- elimínalos desde la app antes de seguir, para no inflar conteos.

-- ============================================================
-- FIN
-- ============================================================
