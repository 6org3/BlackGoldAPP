-- Agrega la columna is_ai_generated a la tabla de misiones
ALTER TABLE public.misiones 
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;
