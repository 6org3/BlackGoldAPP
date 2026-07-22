// Verificación funcional de v42 contra la BD real (mes futuro 8/2026, datos
// que el reset va a borrar): un club cuyos atletas NO tienen grupo debe generar
// 0 mensualidades (antes: $30 c/u); un club con grupos con precio debe generar
// >0 y NINGUNA con base 30 inventada. Uso: node scripts/tmp_verificar_v42.mjs
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MES = 8, ANIO = 2026;

async function generar(club) {
  const { data, error } = await supabase.rpc('generar_pagos_mes', { p_mes: MES, p_anio: ANIO, p_club: club });
  if (error) throw new Error(`generar_pagos_mes(${club}): ${error.message}`);
  return data;
}

async function run() {
  // Caso A: atletas sin grupo → 0 pagos (antes de v42: 1 × $30)
  const a = await generar('PUTUMAYO');
  console.log(`A) PUTUMAYO (1 atleta sin grupo)      → ${a} pagos creados ${a === 0 ? '✅ (fallback muerto)' : '❌ ESPERABA 0'}`);

  // Caso B: atletas con grupo con precio → >0 pagos, ninguno de base 30
  const b = await generar('DEMO QA Compacto');
  const { data: pagosB } = await supabase
    .from('pagos').select('monto_base, tipo')
    .eq('mes', MES).eq('anio', ANIO);
  const con30 = (pagosB || []).filter((p) => Number(p.monto_base) === 30);
  console.log(`B) DEMO QA Compacto (grupos $28/$34)  → ${b} pagos creados ${b > 0 ? '✅' : '❌ ESPERABA >0'}`);
  console.log(`   bases generadas: ${[...new Set((pagosB || []).map((p) => p.monto_base))].join(', ')} — con base $30: ${con30.length} ${con30.length === 0 ? '✅' : '❌'}`);

  // Idempotencia: repetir no duplica
  const b2 = await generar('DEMO QA Compacto');
  console.log(`C) Reejecución                        → ${b2} pagos nuevos ${b2 === 0 ? '✅ (idempotente)' : '❌ ESPERABA 0'}`);

  // Limpieza del rastro de prueba (mes 8/2026)
  const { error: eDel, count } = await supabase.from('pagos').delete({ count: 'exact' }).eq('mes', MES).eq('anio', ANIO);
  console.log(`\nLimpieza de los pagos de prueba 8/2026: ${eDel ? `ERR ${eDel.message}` : `${count} borrados`}`);
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
