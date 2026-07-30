// Verificación E2E de la entrega 2: nadie sigue operando con la contraseña que
// le repartió el club. Corre contra las funciones desplegadas y limpia todo lo
// que crea (prefijo QAPWD2).
//
//   node scripts/tmp_verificar_cambio_obligatorio.mjs
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

const PREFIJO = 'QAPWD2';
const PASSWORD_ELEGIDA = 'una canasta de tres puntos';
let fallos = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => { fallos++; console.log(`  FALLA ${m}`); };

const nuevoCliente = () => createClient(URL_SB, ANON, { auth: { persistSession: false } });

const limpiar = async () => {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of (data?.users ?? []).filter((x) => (x.email || '').startsWith(PREFIJO.toLowerCase()))) {
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: padres } = await admin.from('usuarios').select('id, auth_user_id').like('cedula', 'PADRE_88%');
  for (const p of padres ?? []) {
    if (p.auth_user_id) await admin.auth.admin.deleteUser(p.auth_user_id);
  }
  if (padres?.length) await admin.from('usuarios').delete().in('id', padres.map((p) => p.id));
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
  // `registro_intentos` no se toca: es el estado del control de abuso del
  // registro público, no telemetría. Ver tmp_verificar_password_inicial.mjs.
};

// Llama a la Edge Function con el JWT de una sesión concreta.
const cambiar = async (accessToken, passwordNueva) => {
  const r = await fetch(`${URL_SB}/functions/v1/cambiar-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ password_nueva: passwordNueva }),
  });
  return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
};

await limpiar();

const { data: clubes } = await admin.rpc('listar_clubes_publicos');
const CLUB = clubes?.[0]?.club;
// Cédula de al menos 12 caracteres a propósito: así se puede comprobar que
// ponerla TAL CUAL como contraseña se rechaza por ser un dato conocido, y no
// por quedarse corta (que es otra regla y saltaría antes).
const cedula = `${PREFIJO}-1234567`;
const emailSint = `${cedula}@sinacceso.blackgoldapp.internal`.toLowerCase();
console.log(`club de prueba: ${CLUB}\n`);

// ── 1. Alta: llega con la contraseña del club y la marca puesta ────────────
console.log('=== 1. La cuenta nace marcada ===');
const alta = await fetch(`${URL_SB}/functions/v1/registro-publico`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({
    atleta: { cedula, nombre: 'QA Cambio Obligatorio', fecha_nacimiento: '2012-05-15', club: CLUB, genero: 'Masculino' },
    // El correo del representante es obligatorio desde la entrega 3.
    padre: { nombre: 'QA Representante', telefono: '88' + String(Date.now()).slice(-8), correo: `${PREFIJO.toLowerCase()}-rep-${Date.now()}@ejemplo.com` },
  }),
});
const cuerpoAlta = await alta.json();
const passwordDelClub = cuerpoAlta?.credenciales?.atleta?.password;
if (alta.status !== 200 || !passwordDelClub) {
  console.log(`  FALLA no se pudo dar el alta de prueba: ${alta.status} ${JSON.stringify(cuerpoAlta)}`);
  process.exit(1);
}
// El registro público deja la cuenta 'pendiente'; la Edge Function exige cuenta
// activa (igual que PrivateRoute manda antes a "solicitud en revisión"), así
// que se aprueba para poder probar el cambio.
await admin.from('usuarios').update({ estado: 'activo' }).eq('cedula', cedula);

const cli = nuevoCliente();
const entrada = await cli.auth.signInWithPassword({ email: emailSint, password: passwordDelClub });
if (entrada.error) { console.log(`  FALLA no se pudo entrar con la contraseña del club: ${entrada.error.message}`); process.exit(1); }
if (entrada.data.user.app_metadata?.debe_cambiar_password === true) ok('el JWT trae debe_cambiar_password = true');
else mal(`el JWT no trae la marca (llegó: ${JSON.stringify(entrada.data.user.app_metadata)})`);
let token = entrada.data.session.access_token;

// Segunda sesión con la MISMA contraseña: simula a quien recibió la clave
// dictada por WhatsApp y entró por su cuenta.
const intruso = nuevoCliente();
const sesionIntruso = await intruso.auth.signInWithPassword({ email: emailSint, password: passwordDelClub });
if (sesionIntruso.error) mal(`no se pudo abrir la segunda sesión de prueba: ${sesionIntruso.error.message}`);

// ── 2. Lo que la función tiene que rechazar ───────────────────────────────
console.log('\n=== 2. Contraseñas que no valen ===');
const corta = await cambiar(token, 'corta');
if (corta.status === 400 && /12 caracteres/.test(corta.cuerpo.error || '')) ok('rechaza una contraseña corta, con el mínimo en el mensaje');
else mal(`no rechazó la corta como debía: ${corta.status} ${JSON.stringify(corta.cuerpo)}`);

const suCedula = await cambiar(token, cedula);
if (suCedula.status === 400 && /cédula/.test(suCedula.cuerpo.error || '')) ok('rechaza su propia cédula como contraseña');
else mal(`aceptó la cédula como contraseña: ${suCedula.status} ${JSON.stringify(suCedula.cuerpo)}`);

const trivial = await cambiar(token, '123456789012');
if (trivial.status === 400 && /adivinar/.test(trivial.cuerpo.error || '')) ok('rechaza una corrida de teclado');
else mal(`aceptó 123456789012: ${trivial.status} ${JSON.stringify(trivial.cuerpo)}`);

const repetida = await cambiar(token, passwordDelClub);
if (repetida.status === 400 && /te dio el club/.test(repetida.cuerpo.error || '')) ok('rechaza volver a poner la contraseña del club');
else mal(`dejó poner de nuevo la contraseña del club: ${repetida.status} ${JSON.stringify(repetida.cuerpo)}`);

console.log('\n=== 3. Sin sesión no se cambia nada ===');
const sinSesion = await fetch(`${URL_SB}/functions/v1/cambiar-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ password_nueva: PASSWORD_ELEGIDA }),
});
if (sinSesion.status === 401 || sinSesion.status === 403) ok(`solo con la anon key responde ${sinSesion.status}`);
else mal(`¡cambió la contraseña sin sesión de usuario! (${sinSesion.status})`);

// ── 4. El cambio bueno ────────────────────────────────────────────────────
console.log('\n=== 4. El cambio ===');
const bueno = await cambiar(token, PASSWORD_ELEGIDA);
if (bueno.status === 200) ok('acepta una frase larga');
else mal(`no aceptó la contraseña buena: ${bueno.status} ${JSON.stringify(bueno.cuerpo)}`);

// Cambiar la contraseña por la Admin API revoca TODAS las sesiones, también la
// de quien la está cambiando: sin una sesión de vuelta, la persona acabaría
// fuera justo después de hacer lo que le pedimos.
if (bueno.cuerpo?.session?.access_token) {
  ok('devuelve una sesión nueva (la anterior muere con el cambio)');
  const marcaEnSesion = await nuevoCliente().auth.getUser(bueno.cuerpo.session.access_token);
  if (marcaEnSesion.data?.user?.app_metadata?.debe_cambiar_password === false) ok('esa sesión ya viene sin la marca');
  else mal(`la sesión devuelta trae ${JSON.stringify(marcaEnSesion.data?.user?.app_metadata?.debe_cambiar_password)}`);
} else {
  mal('no devolvió sesión nueva: la persona se queda fuera tras cambiar la contraseña');
}

const tokenViejoTrasCambio = await nuevoCliente().auth.getUser(token);
if (tokenViejoTrasCambio.error) ok('el token anterior queda invalidado');
else mal('el token anterior sigue vivo tras el cambio');

const conVieja = await nuevoCliente().auth.signInWithPassword({ email: emailSint, password: passwordDelClub });
if (conVieja.error) ok(`la contraseña del club ya no sirve: ${conVieja.error.message}`);
else mal('¡la contraseña del club SIGUE sirviendo tras el cambio!');

const cli2 = nuevoCliente();
const conNueva = await cli2.auth.signInWithPassword({ email: emailSint, password: PASSWORD_ELEGIDA });
if (!conNueva.error && conNueva.data.user) {
  ok('entra con la contraseña que eligió');
  const marca = conNueva.data.user.app_metadata?.debe_cambiar_password;
  if (marca === false) ok('la marca quedó apagada en el JWT nuevo');
  else mal(`la marca no se apagó (llegó: ${JSON.stringify(marca)})`);
} else {
  mal(`no se pudo entrar con la contraseña elegida: ${conNueva.error?.message}`);
}

console.log('\n=== 5. Las otras sesiones se cierran ===');
const refrescoIntruso = await intruso.auth.refreshSession();
if (refrescoIntruso.error || !refrescoIntruso.data?.session) ok('la otra sesión abierta con la contraseña del club ya no se puede refrescar');
else mal('¡la otra sesión sigue viva tras el cambio!');

console.log('\n=== 6. Repetir el cambio no deja a nadie encerrado ===');
// El cambio ya se hizo; si la respuesta se hubiera perdido, la persona
// reintentaría con la MISMA contraseña que acaba de elegir. Eso no puede
// devolverle "esa es la contraseña que te dio el club".
const reintento = await cambiar(conNueva.data.session.access_token, PASSWORD_ELEGIDA);
if (reintento.status === 200 && reintento.cuerpo.ya_estaba) ok('reintentar con la contraseña ya elegida responde ok, no un error confuso');
else mal(`el reintento devolvió ${reintento.status} ${JSON.stringify(reintento.cuerpo)}`);

console.log('\n=== Limpieza ===');
await limpiar();
const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).like('cedula', `${PREFIJO}%`);
if ((count ?? 0) === 0) ok('no queda nada de la prueba');
else mal(`quedaron ${count} filas`);

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} COMPROBACIÓN(ES) FALLIDA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
