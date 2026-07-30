// ¿Sigue vigente el guard de v40 sobre `usuarios.telefono`?
//
// v40 protegía el correo Y el teléfono de un miembro del staff que todavía no
// tiene acceso: ambos son su identidad futura y `resolver_email_login` acepta
// los dos como identificador. v56 (entrega 3) reescribió
// proteger_columnas_usuarios() completa para meter `correo` y no reprodujo la
// mitad del teléfono. Esto lo comprueba conductualmente, con una sesión de coach
// real, en vez de deducirlo del SQL.
//
//   node scripts/tmp_verificar_guard_telefono.mjs
//
// La comprobación 3 (que el DUEÑO sí puede, o el guard rompería el alta de staff)
// necesita una sesión de dueño, y para abrirla hay que ponerle una contraseña
// conocida — que NO se puede devolver a la que tenía, y que además revoca todas
// sus sesiones. Por eso va detrás de un guardarraíl explícito, como SEED_REAL en
// los scripts de siembra:
//
//   SONDA_TOCAR_OWNER=1 node scripts/tmp_verificar_guard_telefono.mjs
//
// Sin esa variable las comprobaciones 1 y 2 corren igual y no tocan ninguna
// cuenta existente. No usar nunca contra un club con personas reales.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);

const URL_SB = env.VITE_SUPABASE_URL;
const admin = createClient(URL_SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PREFIJO = 'QAV57';
const PASS = 'Sonda-Guard-Telefono-2026';
let fallos = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => { fallos++; console.log(`  FALLA ${m}`); };

const limpiar = async () => {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of (users?.users ?? []).filter((x) => (x.email || '').includes(PREFIJO.toLowerCase()))) {
    await admin.auth.admin.deleteUser(u.id);
  }
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
};

await limpiar();

const { data: owners } = await admin.from('usuarios')
  .select('club').eq('rol', 'owner').eq('estado', 'activo').limit(1);
const CLUB = owners?.[0]?.club;
if (!CLUB) { console.log('sin club con owner activo'); process.exit(1); }

// El coach atacante: staff activo del club, con sesión real.
const correoCoach = `${PREFIJO.toLowerCase()}coach@ejemplo-inexistente.test`;
const { data: filaCoach } = await admin.from('usuarios').insert({
  cedula: `${PREFIJO}COACH`, nombre: 'Coach Sonda V57', rol: 'coach',
  club: CLUB, estado: 'activo', correo: correoCoach,
}).select('id').single();
const { data: authCoach } = await admin.auth.admin.createUser({
  email: correoCoach, password: PASS, email_confirm: true,
});
await admin.from('usuarios').update({ auth_user_id: authCoach.user.id }).eq('id', filaCoach.id);

// El objetivo: staff del MISMO club que aún no tiene acceso creado. Es
// exactamente la fila que v40 blindó — su contacto decide a qué cuenta se le
// emitirá el acceso cuando el dueño lo cree.
const { data: objetivo } = await admin.from('usuarios').insert({
  cedula: `${PREFIJO}OBJETIVO`, nombre: 'Coach sin acceso', rol: 'coach',
  club: CLUB, estado: 'activo', telefono: `0900${PREFIJO}9`, correo: null,
}).select('id, telefono').single();

console.log(`\nClub: ${CLUB} · objetivo sin acceso: ${objetivo.id}\n`);

const coach = createClient(URL_SB, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: eLogin } = await coach.auth.signInWithPassword({ email: correoCoach, password: PASS });
if (eLogin) { console.log(`no se pudo abrir sesión de coach: ${eLogin.message}`); await limpiar(); process.exit(1); }

// ── 1. El teléfono (lo que v40 protegía y v56 dejó caer) ────────────────────
const { data: dTel, error: eTel } = await coach.from('usuarios')
  .update({ telefono: `0999${PREFIJO}0` }).eq('id', objetivo.id).select('id, telefono');
if (eTel) {
  ok(`el coach NO puede cambiar el teléfono de un staff sin acceso — ${eTel.message}`);
} else if ((dTel?.length ?? 0) === 0) {
  ok('el coach no alcanza la fila (RLS la filtra), el UPDATE no toca nada');
} else {
  mal(`el coach CAMBIÓ el teléfono de un staff sin acceso a "${dTel[0].telefono}" (guard de v40 perdido en v56)`);
}

// ── 2. El correo, para contrastar: v56 sí lo cubre ──────────────────────────
const { data: dCor, error: eCor } = await coach.from('usuarios')
  .update({ correo: `${PREFIJO.toLowerCase()}robado@ejemplo-inexistente.test` })
  .eq('id', objetivo.id).select('id, correo');
if (eCor) {
  ok(`el correo sigue blindado — ${eCor.message}`);
} else if ((dCor?.length ?? 0) === 0) {
  ok('el correo no se pudo tocar (RLS)');
} else {
  mal(`el coach cambió el CORREO a "${dCor[0].correo}" — v56 no está aplicada`);
}

await coach.auth.signOut({ scope: 'local' }).catch(() => {});

// ── 3. La otra mitad del guard: el DUEÑO sí puede ───────────────────────────
// Un guard que bloqueara también al dueño rompería el alta de staff — corregir el
// teléfono de un coach recién invitado, antes de emitirle el acceso, es
// justamente parte de ese flujo.
const { data: filaOwner } = await admin.from('usuarios')
  .select('id, correo, cedula, auth_user_id').eq('rol', 'owner').eq('club', CLUB)
  .eq('estado', 'activo').not('auth_user_id', 'is', null).limit(1).maybeSingle();
// El email se lee de la cuenta de Auth, no de `usuarios.correo`: la mayoría del
// staff sembrado no tiene correo propio y entra por el sintético
// `<cédula>@sinacceso…`. Pedir `correo` dejaba esta comprobación siempre omitida.
let emailOwner = null;
if (filaOwner?.auth_user_id) {
  const { data: cuentaOwner } = await admin.auth.admin.getUserById(filaOwner.auth_user_id);
  emailOwner = cuentaOwner?.user?.email ?? null;
}
if (process.env.SONDA_TOCAR_OWNER !== '1') {
  console.log('  omitido  el camino permitido (dueño) necesita SONDA_TOCAR_OWNER=1 — le cambia la contraseña y no se puede deshacer');
} else if (!emailOwner) {
  console.log('  omitido  no hay dueño con acceso en este club para probar el camino permitido');
} else {
  // Cambiar la contraseña por la Admin API revoca TODAS sus sesiones y la
  // original no se puede recuperar. De ahí el guardarraíl de arriba.
  const passOwner = 'Sonda-Guard-Owner-2026';
  await admin.auth.admin.updateUserById(filaOwner.auth_user_id, { password: passOwner });
  const dueno = createClient(URL_SB, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: eLoginO } = await dueno.auth.signInWithPassword({ email: emailOwner, password: passOwner });
  if (eLoginO) {
    console.log(`  omitido  no se pudo abrir sesión de dueño: ${eLoginO.message}`);
  } else {
    const { data: objetivo2 } = await admin.from('usuarios').insert({
      cedula: `${PREFIJO}OBJETIVO2`, nombre: 'Coach sin acceso 2', rol: 'coach',
      club: CLUB, estado: 'activo', telefono: `0900${PREFIJO}8`, correo: null,
    }).select('id').single();
    const { data: dOk, error: eOk } = await dueno.from('usuarios')
      .update({ telefono: `0999${PREFIJO}8` }).eq('id', objetivo2.id).select('id, telefono');
    if (!eOk && dOk?.[0]?.telefono === `0999${PREFIJO}8`) {
      ok('el DUEÑO sí puede corregir el teléfono de un staff sin acceso (el alta no se rompe)');
    } else {
      mal(`el dueño no pudo: ${eOk?.message ?? 'la fila no cambió'}`);
    }
    await dueno.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}

await limpiar();
console.log(fallos ? `\n${fallos} fallo(s).` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
