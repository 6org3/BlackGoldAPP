// Borra TODOS los atletas, padres y sus vínculos (padres_atletas) del proyecto
// Supabase apuntado por .env. Pensado para resetear un entorno de desarrollo o
// staging; nunca contra producción con datos reales de familias.
//
// GUARDARRAÍLES (mismo patrón que Dashboard_Premium/simulacion/, ver
// simulacion/core/supa.mjs):
//   · DRY-RUN POR DEFECTO. Sin `LIMPIAR_REAL=1` cuenta lo que borraría y sale
//     sin tocar nada.
//   · ANCLA ANTI-PRODUCCIÓN. Con `LIMPIAR_REAL=1` exige además que
//     `LIMPIAR_STAGING_URL` coincida con `VITE_SUPABASE_URL`. Apuntar sin
//     querer al proyecto real aborta en vez de vaciarlo.
//
// Por qué importa aunque hoy "no funcione": el script usa la anon key, y con la
// RLS de v24 esos DELETE no pasan. Eso lo vuelve inofensivo por accidente, no
// por diseño: el día que alguien lo "arregle" pasándole la service_role key —el
// paso natural al ver que no borra nada— se convierte en un botón de vaciar la
// base sin confirmación. Los guardarraíles tienen que estar antes de ese día.
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// process.loadEnvFile (nativo de Node), como el resto de scripts/. Antes usaba
// `dotenv`, que no está declarado en package.json ni instalado: en un checkout
// limpio este script reventaba en el import antes de llegar a ninguna lógica.
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan las variables de entorno de Supabase.');
  process.exit(1);
}

const REAL = process.env.LIMPIAR_REAL === '1';
const STAGING = process.env.LIMPIAR_STAGING_URL;

if (REAL && (!STAGING || STAGING !== supabaseUrl)) {
  console.error('❌ LIMPIAR_REAL=1 pero LIMPIAR_STAGING_URL no coincide con VITE_SUPABASE_URL.');
  console.error(`   VITE_SUPABASE_URL   = ${supabaseUrl}`);
  console.error(`   LIMPIAR_STAGING_URL = ${STAGING || '(sin definir)'}`);
  console.error('   Abortando por seguridad: define LIMPIAR_STAGING_URL con la URL del proyecto que SÍ quieres vaciar.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Qué se borraría, en orden de dependencia (vínculos → atletas → usuarios).
const OBJETIVOS = [
  { tabla: 'padres_atletas', etiqueta: 'relaciones padre-atleta', filtro: (q) => q.neq('id', '00000000-0000-0000-0000-000000000000') },
  { tabla: 'atletas', etiqueta: 'fichas de atleta', filtro: (q) => q.neq('id', '00000000-0000-0000-0000-000000000000') },
  { tabla: 'usuarios', etiqueta: "usuarios con rol 'atleta'", filtro: (q) => q.eq('rol', 'atleta') },
  { tabla: 'usuarios', etiqueta: "usuarios con rol 'padre'", filtro: (q) => q.eq('rol', 'padre') },
];

async function limpiarBaseDatos() {
  console.log(`=== LIMPIEZA DE BASE DE DATOS — modo ${REAL ? '🚀 REAL' : '🔍 DRY-RUN'} ===`);
  console.log(`   proyecto: ${supabaseUrl}\n`);

  if (!REAL) {
    // Dry-run: solo contar. `head: true` pide el total sin traer las filas.
    let total = 0;
    for (const o of OBJETIVOS) {
      const { count, error } = await o.filtro(
        supabase.from(o.tabla).select('*', { count: 'exact', head: true })
      );
      if (error) {
        console.log(`   [?] ${o.etiqueta}: no se pudo contar (${error.message})`);
        continue;
      }
      total += count || 0;
      console.log(`   [dry] borraría ${count ?? 0} — ${o.etiqueta}`);
    }
    console.log(`\n   TOTAL que se borraría: ${total} filas.`);
    console.log('   Para ejecutarlo de verdad:');
    console.log('   LIMPIAR_REAL=1 LIMPIAR_STAGING_URL=<url> node scripts/limpiar_base_datos.js');
    return;
  }

  try {
    for (const o of OBJETIVOS) {
      console.log(`Borrando ${o.etiqueta}...`);
      const { error } = await o.filtro(supabase.from(o.tabla).delete());
      if (error) throw new Error(`${o.tabla} (${o.etiqueta}): ${error.message}`);
    }
    console.log('\n✅ BASE DE DATOS LIMPIA CON ÉXITO.');
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error.message || error);
    process.exitCode = 1;
  }
}

limpiarBaseDatos();
