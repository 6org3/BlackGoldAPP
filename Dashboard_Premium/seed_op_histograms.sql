-- SEED HISTOGRAMAS ONE PIECE (3 MESES) (CORREGIDO 2)
DO $$
DECLARE
  v_atleta_id UUID;
  v_date TIMESTAMP;
BEGIN
  SELECT a.id INTO v_atleta_id FROM atletas a JOIN usuarios u ON a.usuario_id = u.id WHERE u.nombre = 'Monkey D. Luffy' LIMIT 1;
  IF FOUND THEN
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 40.0, 'cm', 'fisico', 'explosividad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 12.5, 's', 'fisico', 'velocidad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 20.0, 'reps', 'fisico', 'fuerza', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 66.1, 'cm', 'fisico', 'explosividad', 52, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 10.9, 's', 'fisico', 'velocidad', 46, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 39.1, 'reps', 'fisico', 'fuerza', 48, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 90.0, 'cm', 'fisico', 'explosividad', 100, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 9.1, 's', 'fisico', 'velocidad', 98, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 58.5, 'reps', 'fisico', 'fuerza', 96, '2026-05-01 10:00:00');
  END IF;

  SELECT a.id INTO v_atleta_id FROM atletas a JOIN usuarios u ON a.usuario_id = u.id WHERE u.nombre = 'Roronoa Zoro' LIMIT 1;
  IF FOUND THEN
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 40.0, 'cm', 'fisico', 'explosividad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 12.5, 's', 'fisico', 'velocidad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 20.0, 'reps', 'fisico', 'fuerza', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 63.3, 'cm', 'fisico', 'explosividad', 47, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 10.9, 's', 'fisico', 'velocidad', 46, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 39.9, 'reps', 'fisico', 'fuerza', 50, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 90.0, 'cm', 'fisico', 'explosividad', 100, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 9.0, 's', 'fisico', 'velocidad', 100, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 60.0, 'reps', 'fisico', 'fuerza', 100, '2026-05-01 10:00:00');
  END IF;

  SELECT a.id INTO v_atleta_id FROM atletas a JOIN usuarios u ON a.usuario_id = u.id WHERE u.nombre = 'Sanji' LIMIT 1;
  IF FOUND THEN
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 40.7, 'cm', 'fisico', 'explosividad', 1, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 12.5, 's', 'fisico', 'velocidad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 20.0, 'reps', 'fisico', 'fuerza', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 66.4, 'cm', 'fisico', 'explosividad', 53, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 10.7, 's', 'fisico', 'velocidad', 51, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 38.3, 'reps', 'fisico', 'fuerza', 46, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 90.0, 'cm', 'fisico', 'explosividad', 100, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 9.1, 's', 'fisico', 'velocidad', 97, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 60.0, 'reps', 'fisico', 'fuerza', 100, '2026-05-01 10:00:00');
  END IF;

  SELECT a.id INTO v_atleta_id FROM atletas a JOIN usuarios u ON a.usuario_id = u.id WHERE u.nombre = 'Trafalgar Law' LIMIT 1;
  IF FOUND THEN
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 42.0, 'cm', 'fisico', 'explosividad', 4, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 12.5, 's', 'fisico', 'velocidad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 21.4, 'reps', 'fisico', 'fuerza', 4, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 65.5, 'cm', 'fisico', 'explosividad', 51, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 10.8, 's', 'fisico', 'velocidad', 49, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 39.4, 'reps', 'fisico', 'fuerza', 48, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 88.4, 'cm', 'fisico', 'explosividad', 97, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 9.0, 's', 'fisico', 'velocidad', 100, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 60.0, 'reps', 'fisico', 'fuerza', 100, '2026-05-01 10:00:00');
  END IF;

  SELECT a.id INTO v_atleta_id FROM atletas a JOIN usuarios u ON a.usuario_id = u.id WHERE u.nombre = 'Katakuri' LIMIT 1;
  IF FOUND THEN
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 40.0, 'cm', 'fisico', 'explosividad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 12.5, 's', 'fisico', 'velocidad', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 20.2, 'reps', 'fisico', 'fuerza', 0, '2026-03-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 66.8, 'cm', 'fisico', 'explosividad', 54, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 10.7, 's', 'fisico', 'velocidad', 51, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 41.4, 'reps', 'fisico', 'fuerza', 54, '2026-04-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Salto Vertical', 90.0, 'cm', 'fisico', 'explosividad', 100, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Agilidad T', 9.1, 's', 'fisico', 'velocidad', 96, '2026-05-01 10:00:00');
    INSERT INTO evaluaciones_pruebas (atleta_id, prueba_tipo, valor_crudo, unidad, pilar, sub_pilar, puntuacion_normalizada, created_at)
    VALUES (v_atleta_id, 'Flexiones en 30s', 58.8, 'reps', 'fisico', 'fuerza', 97, '2026-05-01 10:00:00');
  END IF;

END $$;