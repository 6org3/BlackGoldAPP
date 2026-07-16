// Rotación de las contraseñas del staff (v41).
//
// POR QUÉ EXISTE: hasta v41, `crear-acceso-usuario` fijaba la contraseña de
// TODA cuenta —incluidos coach y dueño— como su cédula. La cédula no es un
// secreto: `usuarios_select` (v24) deja a cualquier staff leer la fila completa
// de todo su club, y `resolver_email_login` (v19) está concedida a `anon` y
// traduce cédula → email sin sesión. O sea que la cédula del dueño era, ella
// sola, el par de credenciales completo:
//     SELECT cedula FROM usuarios WHERE club = <mi club> AND rol = 'owner'
//     → signInWithPassword(email, cedula) → eres el dueño de tu club.
// v41 corta esa derivación para las cuentas NUEVAS, pero las que ya existen
// siguen teniendo la cédula por contraseña — no caducan solas. Este script las
// rota. Sin correrlo, el fix no protege a nadie que ya esté dado de alta.
//
// QUÉ HACE: a cada usuario con rol coach/owner/superadmin y cuenta de Auth le
// pone una contraseña aleatoria nueva y la IMPRIME. Es la única vez que se
// puede ver: no se guarda en ningún lado. Hay que repartirlas a mano.
//
// ESCRIBE EN LA BASE REAL. Por eso pide confirmación explícita:
//   node scripts/rotar_passwords_staff.mjs               → simulacro (no cambia nada)
//   node scripts/rotar_passwords_staff.mjs --ejecutar    → rota de verdad
//   node scripts/rotar_passwords_staff.mjs --ejecutar --club "Black Gold"
//
// Después de rotar, cada quien puede poner la suya desde su perfil (v41).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const url = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error('❌ Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const admin = createClient(url, service, { auth: { persistSession: false } });

const ROLES_STAFF = ['coach', 'owner', 'superadmin'];
const args = process.argv.slice(2);
const EJECUTAR = args.includes('--ejecutar');
const iClub = args.indexOf('--club');
const CLUB = iClub !== -1 ? args[iClub + 1] : null;

// Mismo alfabeto y mismo largo que la Edge Function: sin caracteres ambiguos
// (O/0, l/1/I), porque estas contraseñas se dictan por teléfono o WhatsApp.
const generarPassword = (largo = 14) => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const limite = Math.floor(256 / abc.length) * abc.length;
  const salida = [];
  while (salida.length < largo) {
    const bytes = new Uint8Array(largo * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limite) continue;   // sesgo de módulo: se descarta
      salida.push(abc[b % abc.length]);
      if (salida.length === largo) break;
    }
  }
  return salida.join('');
};

(async () => {
  let q = admin.from('usuarios')
    .select('id, nombre, cedula, correo, rol, club, estado, auth_user_id')
    .in('rol', ROLES_STAFF)
    .not('auth_user_id', 'is', null)
    .order('club')
    .order('rol');
  if (CLUB) q = q.eq('club', CLUB);
  const { data: staff, error } = await q;
  if (error) { console.error('❌ No se pudo leer el staff:', error.message); process.exit(1); }

  if (!staff?.length) {
    console.log('No hay cuentas de staff con acceso que rotar.');
    return;
  }

  console.log(`\n${EJECUTAR ? '🔑 ROTANDO' : '👀 SIMULACRO (nada se cambia — usa --ejecutar para rotar de verdad)'}`);
  console.log(`${staff.length} cuenta(s) de staff${CLUB ? ` en "${CLUB}"` : ' en toda la plataforma'}\n`);

  if (!EJECUTAR) {
    for (const u of staff) {
      console.log(`  · ${u.rol.padEnd(10)} ${u.club || '(sin club)'} — ${u.nombre}${u.estado !== 'activo' ? ' [inactivo]' : ''}`);
    }
    console.log('\nNingún cambio aplicado.');
    return;
  }

  const nuevas = [];
  let fallos = 0;
  for (const u of staff) {
    const password = generarPassword();
    const { error: eRot } = await admin.auth.admin.updateUserById(u.auth_user_id, { password });
    if (eRot) {
      console.error(`  ❌ ${u.nombre} (${u.rol}): ${eRot.message}`);
      fallos++;
      continue;
    }
    nuevas.push({ club: u.club || '(sin club)', rol: u.rol, nombre: u.nombre, usuario: u.correo || u.cedula, password });
  }

  console.log('\n═══════════ CONTRASEÑAS NUEVAS — CÓPIALAS AHORA ═══════════');
  console.log('No se guardan en ningún lado. Si cierras esto sin copiarlas, hay');
  console.log('que volver a rotar (o regenerar el acceso desde /admin/equipo).\n');
  console.table(nuevas);
  console.log(`\n${nuevas.length} rotada(s)${fallos ? `, ${fallos} con error` : ''}.`);
  console.log('Cada quien puede cambiarla luego desde su perfil.');
  if (fallos) process.exit(1);
})();
