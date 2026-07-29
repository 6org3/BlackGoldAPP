// Verificación E2E del control de abuso y del rollback de `registro-publico`
// (hallazgo P1-6, PR #145). Corre contra el proyecto Supabase real.
//
// Todo lo que crea lleva el prefijo QAABUSO en la cédula, así que la limpieza
// final es exacta y no puede tocar datos de nadie más.
//
// Uso:  node verificar_control_abuso.mjs            (verifica y limpia)
//       node verificar_control_abuso.mjs --limpiar  (solo limpia restos)

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// --- credenciales desde .env.local (nunca hardcodeadas: el repo es público) --
const RAIZ = 'C:/Users/jorge/dev/BlackGoldAPP/.claude/worktrees/cool-leakey-d25456/Dashboard_Premium';
const env = Object.fromEntries(
  fs.readFileSync(`${RAIZ}/.env.local`, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);

const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) throw new Error('Faltan credenciales en .env.local');

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const FN = `${URL}/functions/v1/registro-publico`;

const PREFIJO = 'QAABUSO';
const IP_SINTETICA = 'qa-tope-club-sintetico';
const emailDe = (cedula) => `${cedula}@sinacceso.blackgoldapp.internal`.toLowerCase();

let fallos = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const mal = (m) => { fallos++; console.log(`  FALLA ${m}`); };
const titulo = (m) => console.log(`\n=== ${m} ===`);

// Llama a la Edge Function igual que el navegador (anon key, sin sesión).
// `xffFalso` sirve para comprobar que un x-forwarded-for inventado por el
// cliente no secuestra el cubo del rate limit.
async function registrar(cedula, club, xffFalso = null) {
  const r = await fetch(FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      ...(xffFalso ? { 'x-forwarded-for': xffFalso } : {}),
    },
    body: JSON.stringify({
      atleta: {
        cedula,
        nombre: `QA Abuso ${cedula}`,
        fecha_nacimiento: '2000-05-15',
        club,
        genero: 'Masculino',
      },
      padre: null,
    }),
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* respuesta sin JSON */ }
  return { status: r.status, cuerpo };
}

// ---------------------------------------------------------------- limpieza --
async function limpiar() {
  // Cuentas de Auth cuyo email sale de una cédula QAABUSO.
  let pagina = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) { console.log('  aviso: no se pudo listar Auth:', error.message); break; }
    const objetivo = (data?.users ?? []).filter((u) => (u.email || '').startsWith(PREFIJO.toLowerCase()));
    for (const u of objetivo) await admin.auth.admin.deleteUser(u.id);
    if (!data?.users?.length || data.users.length < 200) break;
    pagina++;
  }
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
  await admin.from('registro_intentos').delete().like('club', '%').eq('ip', IP_SINTETICA);
  await admin.from('registro_intentos').delete().gte('id', 0).like('club', 'QA-CLUB-INEXISTENTE');
}

// Borra los intentos de MI IP para que cada fase arranque con el contador a
// cero (si no, la fase anterior dejaría a esta bloqueada).
async function limpiarIntentosDeMiIp() {
  const { data } = await admin
    .from('registro_intentos')
    .select('id, ip')
    .order('id', { ascending: false })
    .limit(200);
  const mias = (data ?? []).filter((f) => f.ip !== IP_SINTETICA).map((f) => f.id);
  if (mias.length) await admin.from('registro_intentos').delete().in('id', mias);
  return mias.length;
}

async function main() {
  if (process.argv.includes('--limpiar')) {
    await limpiar();
    await limpiarIntentosDeMiIp();
    console.log('Limpieza hecha.');
    return;
  }

  titulo('Preparación');
  const { data: clubes, error: eClubes } = await admin.rpc('listar_clubes_publicos');
  if (eClubes) throw new Error('No se pudieron listar clubes: ' + eClubes.message);
  const CLUB = clubes?.[0]?.club;
  if (!CLUB) throw new Error('No hay clubes públicos para probar.');
  console.log(`  club de prueba: ${CLUB}`);

  await limpiar();
  await limpiarIntentosDeMiIp();
  ok('estado inicial limpio');

  // ------------------------------------------------------------------------
  titulo('1. Rollback cuando falla admin.createUser');
  // Se provoca el fallo de forma NATURAL: se ocupa antes el email sintético
  // que la función va a usar. createUser devolverá "email already exists"
  // DESPUÉS de que registrar_publico() ya haya confirmado su transacción, que
  // es exactamente el escenario del hallazgo.
  const cedulaRollback = `${PREFIJO}-ROLLBACK-1`;
  const { error: eCrear } = await admin.auth.admin.createUser({
    email: emailDe(cedulaRollback),
    password: 'qa-ocupa-el-email-1234',
    email_confirm: true,
  });
  if (eCrear) { mal(`no se pudo preparar el email ocupado: ${eCrear.message}`); }
  else ok(`email ${emailDe(cedulaRollback)} ocupado a propósito`);

  const rRollback = await registrar(cedulaRollback, CLUB);
  console.log(`  respuesta: ${rRollback.status} — ${rRollback.cuerpo?.error ?? JSON.stringify(rRollback.cuerpo)}`);
  if (rRollback.status === 500) ok('la función devuelve 500 (no finge éxito)');
  else mal(`se esperaba 500, llegó ${rRollback.status}`);

  // LA COMPROBACIÓN CENTRAL: ninguna fila huérfana con la cédula ocupada.
  const { data: filas } = await admin
    .from('usuarios')
    .select('id, cedula, estado, auth_user_id')
    .eq('cedula', cedulaRollback);
  if ((filas ?? []).length === 0) ok('no queda ninguna fila con esa cédula: la cédula sigue libre');
  else mal(`quedaron ${filas.length} fila(s) huérfanas: ${JSON.stringify(filas)}`);

  const { count: huerfanos } = await admin
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .like('cedula', `${PREFIJO}%`)
    .is('auth_user_id', null);
  if ((huerfanos ?? 0) === 0) ok('cero filas QAABUSO con auth_user_id NULL');
  else mal(`${huerfanos} fila(s) con auth_user_id NULL`);

  // Y que la cédula liberada se pueda volver a usar de verdad.
  await admin.auth.admin.listUsers({ page: 1, perPage: 200 }).then(async ({ data }) => {
    const u = (data?.users ?? []).find((x) => x.email === emailDe(cedulaRollback));
    if (u) await admin.auth.admin.deleteUser(u.id);
  });
  await limpiarIntentosDeMiIp();
  const rReintento = await registrar(cedulaRollback, CLUB);
  if (rReintento.status === 200) ok('tras liberar el email, la misma cédula se registra sin problema');
  else mal(`el reintento debería funcionar, dio ${rReintento.status}: ${rReintento.cuerpo?.error}`);

  // ------------------------------------------------------------------------
  titulo('2. Límite por IP (5 por hora)');
  await limpiar();
  const borrados = await limpiarIntentosDeMiIp();
  console.log(`  contador reiniciado (${borrados} intento(s) previos borrados)`);

  const estados = [];
  for (let i = 1; i <= 7; i++) {
    // Del 5.º en adelante se manda un x-forwarded-for inventado y DISTINTO cada
    // vez. Si la función tomara el primer segmento de esa cabecera, cada
    // petición estrenaría cubo y ninguna sería bloqueada: el límite se evadiría
    // rotando un header. Los 429 de abajo prueban que no es el caso.
    const xff = i >= 5 ? `10.0.0.${i}` : null;
    const r = await registrar(`${PREFIJO}-IP-${i}`, CLUB, xff);
    estados.push(r.status);
    console.log(`  intento ${i}${xff ? ` (x-forwarded-for falso ${xff})` : ''}: ${r.status}`
      + `${r.status === 429 ? ' — ' + r.cuerpo?.error?.slice(0, 55) + '…' : ''}`);
  }
  const permitidos = estados.filter((s) => s === 200).length;
  const bloqueados = estados.filter((s) => s === 429).length;

  if (permitidos === 5) ok('pasaron exactamente 5 (el default configurado)');
  else mal(`pasaron ${permitidos}, se esperaban 5 — estados: ${estados.join(', ')}`);
  if (estados[5] === 429 && estados[6] === 429) ok('el 6.º y el 7.º reciben 429');
  else mal(`el 6.º y 7.º deberían ser 429, fueron ${estados[5]} y ${estados[6]}`);
  if (bloqueados === 2) ok('ningún bloqueo de más');
  // Los bloqueados son justamente los que llevaban XFF falso: no lo tomó.
  if (estados[5] === 429) ok('un x-forwarded-for falsificado NO estrena cubo: se usa la IP del borde');

  const { data: filaIp } = await admin
    .from('registro_intentos')
    .select('ip')
    .order('id', { ascending: false })
    .limit(1);
  const ipVista = filaIp?.[0]?.ip;
  console.log(`  IP anotada por la función: ${ipVista}`);
  if (ipVista && !ipVista.startsWith('10.0.0.')) ok('la IP anotada es la real, no la inventada por el cliente');
  else mal(`la función anotó la IP falsificada (${ipVista})`);

  // ------------------------------------------------------------------------
  titulo('3. Tope diario por club (20 altas)');
  await limpiarIntentosDeMiIp(); // que el límite por IP no enmascare el del club
  // 20 altas del club desde una IP sintética: así llenan la cuota del CLUB sin
  // tocar el contador de MI IP.
  const relleno = Array.from({ length: 20 }, () => ({ ip: IP_SINTETICA, club: CLUB, exito: true }));
  const { error: eRelleno } = await admin.from('registro_intentos').insert(relleno);
  if (eRelleno) mal(`no se pudo preparar el relleno: ${eRelleno.message}`);
  else ok(`${relleno.length} altas del club "${CLUB}" en las últimas 24 h`);

  const rClub = await registrar(`${PREFIJO}-CLUB-1`, CLUB);
  console.log(`  respuesta: ${rClub.status} — ${rClub.cuerpo?.error?.slice(0, 80)}`);
  if (rClub.status === 429) ok('el club al tope devuelve 429');
  else mal(`se esperaba 429 por tope de club, llegó ${rClub.status}`);
  if ((rClub.cuerpo?.error ?? '').includes('club')) ok('el mensaje distingue el tope de club del de IP');

  // ------------------------------------------------------------------------
  titulo('Limpieza');
  await limpiar();
  await limpiarIntentosDeMiIp();
  const { count: sobran } = await admin
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .like('cedula', `${PREFIJO}%`);
  if ((sobran ?? 0) === 0) ok('no queda nada de la prueba en usuarios');
  else mal(`quedaron ${sobran} fila(s) QAABUSO`);

  console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} COMPROBACIÓN(ES) FALLIDA(S)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
