// Verificación E2E de la entrega 1: la contraseña inicial ya no es la cédula.
// Corre contra la función desplegada y limpia todo lo que crea (prefijo QAPWD).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Relativo al propio script (la convención del resto de scripts/): con la ruta
// absoluta incrustada, esto solo corría en el worktree donde se escribió.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);

const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PREFIJO = 'QAPWD';
let fallos = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const mal = (m) => { fallos++; console.log(`  FALLA ${m}`); };

const limpiar = async () => {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of (data?.users ?? []).filter((x) => (x.email || '').startsWith(PREFIJO.toLowerCase()))) {
    await admin.auth.admin.deleteUser(u.id);
  }
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
  // `registro_intentos` NO se toca. Antes se borraban las 50 filas más
  // recientes sin filtrar por la prueba, y esa tabla no es telemetría: es el
  // estado del control de abuso del registro público (v52 §5 + v54, 5 altas por
  // IP a la hora y 20 por club al día). Vaciarla le devuelve la cuota entera a
  // quien estuviera abusando y borra el único rastro. La prueba deja una fila
  // suya, que es exactamente lo que la tabla existe para anotar; el precio es
  // que esta verificación entra en el mismo cupo: cinco corridas por hora desde
  // la misma salida a internet.
};

await limpiar();

const { data: clubes } = await admin.rpc('listar_clubes_publicos');
const CLUB = clubes?.[0]?.club;
console.log(`club de prueba: ${CLUB}\n`);

const cedula = `${PREFIJO}-1`;
const telPadre = '09' + String(Date.now()).slice(-8);
const correoPadre = `${PREFIJO.toLowerCase()}-rep-${Date.now()}@ejemplo.com`;

const r = await fetch(`${URL}/functions/v1/registro-publico`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({
    atleta: { cedula, nombre: 'QA Password', fecha_nacimiento: '2012-05-15', club: CLUB, genero: 'Masculino' },
    // El correo del representante es obligatorio desde la entrega 3.
    padre: { nombre: 'QA Representante', telefono: telPadre, correo: correoPadre },
  }),
});
const cuerpo = await r.json();
console.log('=== 1. Registro público ===');
console.log(`  respuesta ${r.status}`);

const cred = cuerpo?.credenciales;
if (r.status !== 200) { mal(`el registro debía funcionar: ${cuerpo?.error}`); }
else {
  if (cred?.atleta?.password) ok(`devuelve la contraseña del atleta (${cred.atleta.password.length} caracteres)`);
  else mal('no devolvió la contraseña del atleta');

  if (cred?.atleta?.password !== cedula) ok('la contraseña del atleta NO es su cédula');
  else mal('la contraseña del atleta sigue siendo su cédula');

  if (cred?.padre?.password) ok('devuelve también la del representante');
  else mal('no devolvió la del representante');

  if (cred?.padre?.password !== cedula) ok('la del representante NO es la cédula del hijo');
  else mal('la del representante sigue siendo la cédula del hijo');

  if (cred?.atleta?.password !== cred?.padre?.password) ok('atleta y representante reciben contraseñas distintas');
  else mal('atleta y representante comparten contraseña');

  if (!/[O0lI1]/.test(cred?.atleta?.password ?? '')) ok('sin caracteres confundibles al dictarla');
}

console.log('\n=== 2. La cédula ya no sirve para entrar ===');
const emailSint = `${cedula}@sinacceso.blackgoldapp.internal`.toLowerCase();
const anonCli = createClient(URL, ANON, { auth: { persistSession: false } });
const conCedula = await anonCli.auth.signInWithPassword({ email: emailSint, password: cedula });
if (conCedula.error) ok(`entrar con (cédula, cédula) es rechazado: ${conCedula.error.message}`);
else mal('¡SE PUDO ENTRAR usando la cédula como contraseña!');

console.log('\n=== 3. La contraseña emitida SÍ sirve ===');
const conEmitida = await anonCli.auth.signInWithPassword({ email: emailSint, password: cred?.atleta?.password ?? 'x' });
if (!conEmitida.error && conEmitida.data?.user) {
  ok('el atleta entra con la contraseña que se le mostró');
  const marca = conEmitida.data.user.app_metadata?.debe_cambiar_password;
  if (marca === true) ok('la cuenta queda marcada con debe_cambiar_password (la usará la entrega 2)');
  else mal(`falta la marca debe_cambiar_password (llegó: ${JSON.stringify(marca)})`);
  await anonCli.auth.signOut();
} else {
  mal(`no se pudo entrar con la contraseña emitida: ${conEmitida.error?.message}`);
}

// ── La otra mitad: el alta por PANEL (crear-acceso-usuario) ──────────────────
// El registro público no es la única vía de alta, y la regla tiene que valer
// igual en las dos. Aquí se levantan un dueño y un coach de mentira en el mismo
// club para comprobarlo con sesiones reales, no con service_role.
console.log('\n=== 4. Alta por panel: la contraseña tampoco es la cédula ===');

const PASS_STAFF = 'clave larga de prueba qa';
const staff = async (rol, sufijo) => {
  const ced = `${PREFIJO}-${sufijo}`;
  const email = `${ced}@sinacceso.blackgoldapp.internal`.toLowerCase();
  const { data: cuenta } = await admin.auth.admin.createUser({
    email, password: PASS_STAFF, email_confirm: true,
  });
  const { data: fila } = await admin.from('usuarios').insert({
    cedula: ced, nombre: `QA ${rol}`, rol, club: CLUB, estado: 'activo',
    auth_user_id: cuenta.user.id,
  }).select().single();
  const cli = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sesion } = await cli.auth.signInWithPassword({ email, password: PASS_STAFF });
  return { fila, token: sesion?.session?.access_token };
};

const llamarCrearAcceso = async (token, cuerpo) => {
  const r = await fetch(`${URL}/functions/v1/crear-acceso-usuario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
};

const dueno = await staff('owner', 'OWNER');
const coach = await staff('coach', 'COACH');

// Atleta dado de alta "a mano", como hace el panel: fila sin cuenta de Auth.
const cedPanel = `${PREFIJO}-PANEL`;
const { data: atletaPanel } = await admin.from('usuarios').insert({
  cedula: cedPanel, nombre: 'QA Alta Panel', rol: 'atleta', club: CLUB,
  estado: 'activo', fecha_nacimiento: '2011-03-10', genero: 'Masculino',
}).select().single();

const alta = await llamarCrearAcceso(dueno.token, { usuario_id: atletaPanel.id });
if (alta.status === 200 && alta.cuerpo.password_temporal) {
  ok(`el panel emite contraseña (${alta.cuerpo.password_temporal.length} caracteres)`);
  if (alta.cuerpo.password_temporal !== cedPanel) ok('y no es la cédula');
  else mal('¡el panel sigue poniendo la cédula como contraseña!');
  const { data: cuentaNueva } = await admin.from('usuarios').select('auth_user_id').eq('id', atletaPanel.id).single();
  const { data: authNueva } = await admin.auth.admin.getUserById(cuentaNueva.auth_user_id);
  if (authNueva?.user?.app_metadata?.debe_cambiar_password === true) ok('nace marcada para el cambio obligatorio');
  else mal('el alta por panel no siembra debe_cambiar_password');
} else {
  mal(`el alta por panel falló: ${alta.status} ${JSON.stringify(alta.cuerpo)}`);
}

console.log('\n=== 5. Rotar una contraseña es cosa del dueño ===');
// Regenerar le entrega a quien lo pide la contraseña NUEVA de otra persona, en
// claro: si un coach pudiera, se quedaría con la cuenta de cualquier menor de
// su club sin pasar por ninguna pantalla.
const rotaCoach = await llamarCrearAcceso(coach.token, { usuario_id: atletaPanel.id, regenerar: true });
if (rotaCoach.status === 403) ok(`un coach NO puede rotar la contraseña de un atleta: ${rotaCoach.cuerpo.error}`);
else mal(`¡un coach pudo rotar la contraseña de un atleta! (${rotaCoach.status})`);

const rotaDueno = await llamarCrearAcceso(dueno.token, { usuario_id: atletaPanel.id, regenerar: true });
if (rotaDueno.status === 200 && rotaDueno.cuerpo.password_temporal) {
  ok('el dueño sí puede: es la vía de recuperación que la app le promete a la familia');
  if (rotaDueno.cuerpo.password_temporal !== alta.cuerpo?.password_temporal) ok('y la contraseña cambió de verdad');
  else mal('devolvió la misma contraseña de antes');
} else {
  mal(`el dueño no pudo regenerar: ${rotaDueno.status} ${JSON.stringify(rotaDueno.cuerpo)}`);
}

console.log('\n=== Limpieza ===');
await limpiar();
const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).like('cedula', `${PREFIJO}%`);
if ((count ?? 0) === 0) ok('no queda nada de la prueba');
else mal(`quedaron ${count} filas`);

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} COMPROBACIÓN(ES) FALLIDA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
