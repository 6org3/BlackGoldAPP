// Verificación E2E de la entrega 3: la recuperación por correo es posible.
// Corre contra lo desplegado y limpia lo que crea (prefijo QAREC).
//
//   node scripts/tmp_verificar_recuperacion.mjs
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
const ANON = env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(URL_SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PREFIJO = 'QAREC';
let fallos = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => { fallos++; console.log(`  FALLA ${m}`); };
const nuevoCliente = () => createClient(URL_SB, ANON, { auth: { persistSession: false } });

const limpiar = async () => {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of (data?.users ?? []).filter((x) => (x.email || '').includes(PREFIJO.toLowerCase()))) {
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: filas } = await admin.from('usuarios').select('id').like('cedula', `${PREFIJO}%`);
  for (const f of filas ?? []) await admin.from('atletas').delete().eq('usuario_id', f.id);
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
  // `registro_intentos` no se toca: es el estado del control de abuso.
};

await limpiar();

// ── 1. El agujero que cerró v55 ──────────────────────────────────────────────
// Todo el control de abuso del registro (5 altas por IP/hora, 20 por club/día,
// captcha) vive en la Edge Function. Mientras `anon` pudo llamar la RPC por
// PostgREST, bastaba saltarse la función para quemar cédulas sin freno.
console.log('=== 1. El registro público solo entra por la Edge Function ===');
const rpcDirecta = await fetch(`${URL_SB}/rest/v1/rpc/registrar_publico`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ p_atleta: { cedula: `${PREFIJO}-DIRECTA`, nombre: 'QA', fecha_nacimiento: '2012-01-01', club: 'x' } }),
});
const cuerpoRpc = await rpcDirecta.json().catch(() => ({}));
if (rpcDirecta.status === 404 || cuerpoRpc?.code === '42501' || /permission denied/i.test(cuerpoRpc?.message || '')) {
  ok(`anon ya no puede llamar registrar_publico (${rpcDirecta.status} ${cuerpoRpc?.code || ''})`);
} else {
  mal(`¡anon SIGUE pudiendo saltarse el control de abuso! (${rpcDirecta.status} ${JSON.stringify(cuerpoRpc).slice(0, 120)})`);
}

// ── 2. El correo del representante es obligatorio ────────────────────────────
console.log('\n=== 2. Sin correo del representante no hay alta ===');
const { data: clubes } = await admin.rpc('listar_clubes_publicos');
const CLUB = clubes?.[0]?.club;

const registrar = async (padre, sufijo) => {
  const r = await fetch(`${URL_SB}/functions/v1/registro-publico`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      atleta: { cedula: `${PREFIJO}-${sufijo}`, nombre: 'QA Recuperacion', fecha_nacimiento: '2012-05-15', club: CLUB, genero: 'Masculino' },
      padre,
    }),
  });
  return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
};

const telPadre = '77' + String(Date.now()).slice(-8);
const sinCorreo = await registrar({ nombre: 'QA Rep', telefono: telPadre, correo: null }, 'A');
if (sinCorreo.status === 400 && /correo del representante/i.test(sinCorreo.cuerpo.error || '')) {
  ok('rechaza el alta sin correo del representante');
} else {
  mal(`aceptó un alta sin correo: ${sinCorreo.status} ${JSON.stringify(sinCorreo.cuerpo).slice(0, 120)}`);
}

const correoMalo = await registrar({ nombre: 'QA Rep', telefono: telPadre, correo: 'esto-no-es-un-correo' }, 'A');
if (correoMalo.status === 400) ok('rechaza un correo con forma inválida');
else mal(`aceptó "esto-no-es-un-correo": ${correoMalo.status}`);

const correoPadre = `${PREFIJO.toLowerCase()}-rep-${Date.now()}@ejemplo.com`;
const conCorreo = await registrar({ nombre: 'QA Rep', telefono: telPadre, correo: correoPadre }, 'A');
if (conCorreo.status === 200) ok('acepta el alta con correo del representante');
else mal(`el alta buena falló: ${conCorreo.status} ${JSON.stringify(conCorreo.cuerpo).slice(0, 150)}`);

// ── 3. Ese correo es el que Auth reconoce ────────────────────────────────────
// Si Auth se hubiera quedado con el sintético, el enlace de recuperación
// llegaría a un dominio que no existe y la familia esperaría para siempre.
console.log('\n=== 3. El correo real llega a Auth, no solo a la tabla ===');
const { data: usuarios } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const cuentaPadre = (usuarios?.users ?? []).find((u) => u.email === correoPadre);
if (cuentaPadre) ok('la cuenta del representante usa su correo real en Auth');
else mal('la cuenta de Auth del representante NO quedó con su correo real');

// ── 4. Cambiar el correo mueve las dos mitades a la vez ──────────────────────
console.log('\n=== 4. Cambiar el correo no rompe el login ===');
const passRep = conCorreo.cuerpo?.credenciales?.padre?.password;
// El representante nace 'pendiente' como su hijo; la Edge Function exige
// cuenta activa (igual que PrivateRoute), así que se aprueba para la prueba.
await admin.from('usuarios').update({ estado: 'activo' }).eq('cedula', `PADRE_${telPadre}`);

const cliRep = nuevoCliente();
const sesionRep = await cliRep.auth.signInWithPassword({ email: correoPadre, password: passRep ?? 'x' });
if (sesionRep.error) {
  mal(`no se pudo entrar como representante: ${sesionRep.error.message}`);
} else {
  const token = sesionRep.data.session.access_token;
  const correoOtro = `${PREFIJO.toLowerCase()}-otro-${Date.now()}@ejemplo.com`;
  const cambio = await fetch(`${URL_SB}/functions/v1/actualizar-correo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ correo: correoOtro }),
  });
  if (cambio.status === 200) ok('el representante puede cambiar su correo');
  else mal(`el cambio de correo falló: ${cambio.status} ${(await cambio.text()).slice(0, 150)}`);

  const { data: filaTras } = await admin.from('usuarios').select('correo').eq('cedula', `PADRE_${telPadre}`).single();
  const { data: authTras } = await admin.auth.admin.getUserById(cuentaPadre.id);
  if (filaTras?.correo === correoOtro && authTras?.user?.email === correoOtro) {
    ok('la tabla y Auth quedaron con el MISMO correo');
  } else {
    mal(`divergieron — tabla: ${filaTras?.correo} · auth: ${authTras?.user?.email}`);
  }

  // Lo que de verdad importa: que después se pueda seguir entrando.
  const reentrada = await nuevoCliente().auth.signInWithPassword({ email: correoOtro, password: passRep });
  if (!reentrada.error) ok('sigue pudiendo entrar con el correo nuevo');
  else mal(`quedó fuera tras cambiar su correo: ${reentrada.error.message}`);

  // Y que el identificador que usa la app (resolver_email_login) apunte ahí.
  const { data: resuelto } = await nuevoCliente().rpc('resolver_email_login', { p_identificador: telPadre });
  if (resuelto === correoOtro) ok('resolver_email_login devuelve el correo nuevo');
  else mal(`resolver_email_login devuelve ${resuelto}`);
}

// ── 5. Pedir el enlace no delata qué correos existen ─────────────────────────
console.log('\n=== 5. Pedir el enlace no es un oráculo ===');
const pedir = async (correo) => {
  const r = await fetch(`${URL_SB}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: correo }),
  });
  return r.status;
};
const existente = await pedir(correoPadre);
const inventado = await pedir(`${PREFIJO.toLowerCase()}-no-existe-${Date.now()}@ejemplo.com`);
if (existente === inventado) ok(`un correo real y uno inventado responden igual (${existente})`);
else mal(`respuestas distintas: real ${existente} vs inventado ${inventado}`);

console.log('\n=== Limpieza ===');
await limpiar();
const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).like('cedula', `${PREFIJO}%`);
if ((count ?? 0) === 0) ok('no queda nada de la prueba');
else mal(`quedaron ${count} filas`);

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} COMPROBACIÓN(ES) FALLIDA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
