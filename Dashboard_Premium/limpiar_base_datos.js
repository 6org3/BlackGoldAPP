import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Faltan las variables de entorno de Supabase.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function limpiarBaseDatos() {
  console.log("⚠️ INICIANDO LIMPIEZA DE BASE DE DATOS...");

  try {
    // 1. Borrar tabla padres_atletas (relaciones)
    console.log("Borrando relaciones en padres_atletas...");
    const { error: errPadresAtletas } = await supabase
      .from('padres_atletas')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything
    if (errPadresAtletas) throw new Error(`Error en padres_atletas: ${errPadresAtletas.message}`);

    // 2. Borrar tabla atletas
    console.log("Borrando registros en atletas...");
    const { error: errAtletas } = await supabase
      .from('atletas')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything
    if (errAtletas) throw new Error(`Error en atletas: ${errAtletas.message}`);

    // 3. Borrar usuarios (SÓLO atletas y padres)
    console.log("Borrando usuarios (sólo roles 'atleta' y 'padre')...");
    const { error: errUsuariosAtletas } = await supabase
      .from('usuarios')
      .delete()
      .eq('rol', 'atleta');
    if (errUsuariosAtletas) throw new Error(`Error borrando usuarios atletas: ${errUsuariosAtletas.message}`);

    const { error: errUsuariosPadres } = await supabase
      .from('usuarios')
      .delete()
      .eq('rol', 'padre');
    if (errUsuariosPadres) throw new Error(`Error borrando usuarios padres: ${errUsuariosPadres.message}`);

    console.log("✅ BASE DE DATOS LIMPIA CON ÉXITO.");
  } catch (error) {
    console.error("❌ Error durante la limpieza:", error);
  }
}

limpiarBaseDatos();
