// Verificación E2E de la entrega 4 contra lo DESPLEGADO: una familia inscribe a
// dos hermanos pasando por la Edge Function real, con sus cuentas de Auth.
//
// El caso elegido es el que fallaba y el que más cosas ejerce a la vez: la mamá
// inscribe al primer hijo con su teléfono, y al segundo desde OTRO número (el del
// papá) con el MISMO correo familiar. Antes: 409 de la Edge Function. Ahora:
// v57 reconoce al representante por el correo y lo reutiliza.
//
// Cada alta consume una unidad del límite de abuso (5 por IP/hora, v52/v54), así
// que el script gasta 2 y no más. `registro_intentos` no se toca.
//
//   node scripts/tmp_verificar_familia_e2e.mjs
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
const anon = createClient(URL_SB, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const PREFIJO = 'QAE4';
const CORREO_FAMILIA = 'qae4.familia@ejemplo-inexistente.test';
const TEL_MAMA = `0900${PREFIJO}01`;
const TEL_PAPA = `0900${PREFIJO}02`;

let fallos = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => { fallos++; console.log(`  FALLA ${m}`); };

const limpiar = async () => {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of (users?.users ?? []).filter((x) => {
    const e = (x.email || '').toLowerCase();
    return e.includes(PREFIJO.toLowerCase()) || e === CORREO_FAMILIA;
  })) {
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: filas } = await admin.from('usuarios').select('id')
    .or(`cedula.like.${PREFIJO}%,cedula.like.PADRE_0900${PREFIJO}%`);
  for (const f of filas ?? []) await admin.from('atletas').delete().eq('usuario_id', f.id);
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
  await admin.from('usuarios').delete().like('cedula', `PADRE_0900${PREFIJO}%`);
};

await limpiar();

const { data: owners } = await admin.from('usuarios')
  .select('club').eq('rol', 'owner').eq('estado', 'activo').limit(1);
const CLUB = owners?.[0]?.club;
if (!CLUB) { console.log('sin club con owner activo'); process.exit(1); }

const inscribir = async (cedula, nombre, telefonoRep, nombreRep) => {
  const { data, error } = await anon.functions.invoke('registro-publico', {
    body: {
      atleta: {
        cedula, nombre, fecha_nacimiento: '2013-04-20',
        genero: 'Masculino', club: CLUB, posicion: 'Guard',
        // La familia escribe su correo también aquí, que es lo que el formulario
        // ofrecía y lo que rompía el alta. Se manda a propósito: v57 tiene que
        // descartarlo, no atragantarse con él.
        correo: CORREO_FAMILIA, telefono: telefonoRep,
      },
      padre: { nombre: nombreRep, telefono: telefonoRep, correo: CORREO_FAMILIA },
    },
  });
  if (error) {
    let msg = error.message;
    try { const c = await error.context?.json(); if (c?.error) msg = c.error; } catch { /* sin JSON */ }
    return { error: msg };
  }
  return { data };
};

console.log(`\n=== E2E entrega 4 · club ${CLUB} ===\n`);

// ── 1. Primer hijo: la mamá, con su número ──────────────────────────────────
const r1 = await inscribir(`${PREFIJO}H1`, 'Hermano Uno QAE4', TEL_MAMA, 'Mama QAE4');
if (r1.error) {
  mal(`el primer hijo no se pudo inscribir: ${r1.error}`);
} else {
  ok('primer hijo inscrito');
  if (r1.data?.credenciales?.padre_estado === 'emitida') ok('al representante se le emitió contraseña');
  else mal(`padre_estado inesperado: ${r1.data?.credenciales?.padre_estado}`);
  if (r1.data?.credenciales?.padre?.usuario === TEL_MAMA) ok(`el representante entra con ${TEL_MAMA}`);
  else mal(`usuario del representante: ${r1.data?.credenciales?.padre?.usuario}`);
}

// ── 2. Segundo hijo: el papá, otro número, MISMO correo ─────────────────────
// Esto devolvía 409 ("ese correo ya está registrado con otra persona").
const r2 = await inscribir(`${PREFIJO}H2`, 'Hermano Dos QAE4', TEL_PAPA, 'Papa QAE4');
if (r2.error) {
  mal(`el segundo hermano sigue bloqueado: ${r2.error}`);
} else {
  ok('segundo hermano inscrito con el correo de la familia y otro teléfono');
  if (r2.data?.credenciales?.padre_estado === 'ya_existia') {
    ok('se reconoció al representante que ya existía (no se creó uno nuevo)');
  } else {
    mal(`padre_estado inesperado: ${r2.data?.credenciales?.padre_estado}`);
  }
  // Lo que evita que la familia se quede fuera creyendo que la contraseña falla.
  if (r2.data?.credenciales?.padre_usuario === TEL_MAMA) {
    ok(`la respuesta avisa de que entra con ${TEL_MAMA}, no con ${TEL_PAPA}`);
  } else {
    mal(`padre_usuario devuelto: ${r2.data?.credenciales?.padre_usuario} (esperado ${TEL_MAMA})`);
  }
}

// ── 3. Cómo quedaron las filas ─────────────────────────────────────────────
console.log('\n  — estado en la base —');
const { data: hijos } = await admin.from('usuarios')
  .select('id, cedula, correo, telefono, auth_user_id').like('cedula', `${PREFIJO}%`).order('cedula');
if (hijos?.length === 2) ok('las dos filas de deportista existen');
else mal(`filas de deportista: ${hijos?.length ?? 0}`);

for (const h of hijos ?? []) {
  if (h.correo === null && h.telefono === null) {
    ok(`${h.cedula}: sin correo ni teléfono propios (el contacto es del representante)`);
  } else {
    mal(`${h.cedula}: se quedó con correo=${h.correo} telefono=${h.telefono}`);
  }
  // El arreglo del `atleta_correo`: si la cuenta de Auth se hubiera creado con el
  // correo de la familia, el trigger de v24 no habría encontrado esta fila.
  if (h.auth_user_id) {
    ok(`${h.cedula}: vinculado a su cuenta de Auth`);
    const { data: cuenta } = await admin.auth.admin.getUserById(h.auth_user_id);
    const esperado = `${h.cedula.toLowerCase()}@sinacceso.blackgoldapp.internal`;
    if (cuenta?.user?.email === esperado) ok(`${h.cedula}: su email de Auth es el sintético`);
    else mal(`${h.cedula}: email de Auth = ${cuenta?.user?.email} (esperado ${esperado})`);
  } else {
    mal(`${h.cedula}: SIN auth_user_id — no podría entrar nunca`);
  }
}

// ── 4. El representante: uno solo, con el correo, y con los dos hijos ──────
const { data: padres } = await admin.from('usuarios')
  .select('id, cedula, correo, telefono, club, auth_user_id').eq('correo', CORREO_FAMILIA);
if (padres?.length === 1) {
  ok('hay UN representante para los dos hermanos');
  const p = padres[0];
  if (p.cedula === `PADRE_${TEL_MAMA}`) ok(`conserva su identidad original (${p.cedula})`);
  else mal(`cédula del representante: ${p.cedula}`);
  if (p.club === CLUB) ok('está en el club correcto');
  else mal(`club del representante: ${p.club}`);
  if (p.auth_user_id) {
    const { data: cuentaP } = await admin.auth.admin.getUserById(p.auth_user_id);
    if (cuentaP?.user?.email === CORREO_FAMILIA) ok('su cuenta de Auth usa el correo de la familia (podrá recuperar)');
    else mal(`email de Auth del representante: ${cuentaP?.user?.email}`);
  } else {
    mal('el representante no tiene auth_user_id');
  }
  const { data: vinculos } = await admin.from('padres_atletas').select('atleta_id').eq('padre_id', p.id);
  if ((vinculos?.length ?? 0) === 2) ok('los dos hermanos están vinculados a él');
  else mal(`hijos vinculados: ${vinculos?.length ?? 0}`);
} else {
  mal(`representantes con ese correo: ${padres?.length ?? 0} (debería ser 1)`);
}

await limpiar();
console.log(fallos ? `\n${fallos} fallo(s).` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
