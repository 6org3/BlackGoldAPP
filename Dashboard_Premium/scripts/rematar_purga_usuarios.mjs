// Remate de la purga pre-producción (2026-08-03).
//
// purgar_pre_produccion.mjs vació todo lo que CUELGA de usuarios pero nunca
// borró la tabla `usuarios` en sí — y por eso 64 cuentas de Auth quedaron
// imborrables: usuarios.auth_user_id las referencia y Auth se niega a borrar
// una cuenta mientras una fila la apunte. Este script hace lo que faltó, en
// el orden que exigen los triggers de v36:
//
//   1. usuarios que NO son dueños (atletas, padres, coaches, superadmins).
//   2. dueños INVITADOS (creado_por NOT NULL) — antes que los originales,
//      para no despertar la sucesión de v36 con medio club borrado.
//   3. dueños originales.
//   4. reintenta las cuentas de Auth que quedaron, ya sin filas que las agarren.
//
// DRY-RUN por defecto. Para ejecutar: REMATE_REAL=1 y PURGA_URL con la URL
// del proyecto escrita a mano (la misma confirmación consciente de la purga).
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const URL_ = process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error('❌ Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const REAL = process.env.REMATE_REAL === '1';
if (REAL && process.env.PURGA_URL !== URL_) {
  console.error('❌ REMATE_REAL=1 exige PURGA_URL idéntica a VITE_SUPABASE_URL (confirmación consciente).');
  process.exit(1);
}

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const modo = REAL ? '🚀 REAL' : '🔍 DRY-RUN';
console.log(`=== REMATE DE PURGA — modo ${modo} ===\n   proyecto: ${URL_}`);

const contar = async (filtro) => {
  let q = svc.from('usuarios').select('id', { count: 'exact', head: true });
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
};

const borrar = async (nombre, filtro) => {
  const n = await contar(filtro);
  if (!REAL) { console.log(`   [dry] borraría ${n} — ${nombre}`); return; }
  if (n === 0) { console.log(`   ✅ ${nombre}: 0 filas (nada que borrar)`); return; }
  let q = svc.from('usuarios').delete({ count: 'exact' });
  // .delete() sin filtro no está permitido; el filtro llega por parámetro y
  // siempre existe (neq/eq/not) — nunca se borra "todo" sin condición explícita.
  q = filtro(q);
  const { count, error } = await q;
  if (error) { console.error(`   ❌ ${nombre}: ${error.message}`); process.exit(1); }
  console.log(`   ✅ ${nombre}: ${count} filas borradas`);
};

// 1-3. usuarios, en el orden de los triggers de v36.
await borrar('usuarios que no son dueños', (q) => q.neq('rol', 'owner'));
await borrar('dueños invitados (creado_por NOT NULL)', (q) => q.eq('rol', 'owner').not('creado_por', 'is', null));
await borrar('dueños originales', (q) => q.eq('rol', 'owner'));

// 4. Auth: lo que haya quedado, paginado.
let paginas = 0, borradas = 0, fallos = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 100 });
  if (error) { console.error('❌ listUsers:', error.message); process.exit(1); }
  const lote = data?.users ?? [];
  if (!lote.length) break;
  paginas++;
  if (!REAL) { borradas += lote.length; continue; }
  for (const u of lote) {
    const { error: e } = await svc.auth.admin.deleteUser(u.id);
    if (e) fallos.push(`${u.email}: ${e.message || JSON.stringify(e)}`);
    else borradas++;
  }
}
if (!REAL) console.log(`   [dry] borraría ${borradas} cuentas de Auth`);
else {
  console.log(`   ✅ Auth: ${borradas} cuentas borradas`);
  if (fallos.length) { console.log(`   ⚠️  ${fallos.length} fallos:`); fallos.forEach(f => console.log(`      - ${f}`)); }
}

// Estado final.
const uFinal = await contar();
const { data: authFinal } = await svc.auth.admin.listUsers({ page: 1, perPage: 1 });
console.log('\n=== Estado final ===');
console.log(`   usuarios: ${uFinal}`);
console.log(`   Auth (muestra de la primera página): ${authFinal?.users?.length ?? '?'} — 0 significa vacío`);
if (REAL && uFinal === 0 && !(authFinal?.users?.length)) {
  console.log('✅ AHORA SÍ: base en blanco. Lista para fundar_black_gold.mjs.');
}
