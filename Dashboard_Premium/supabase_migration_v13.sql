-- Añadir columnas para medidas antropométricas avanzadas
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS talla_sentado_cm NUMERIC;
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS envergadura_cm NUMERIC;
