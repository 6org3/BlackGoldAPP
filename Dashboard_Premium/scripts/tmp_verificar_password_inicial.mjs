// Verificación E2E de la entrega 1: la contraseña inicial ya no es la cédula.
// Corre contra la función desplegada y limpia todo lo que crea (prefijo QAPWD).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

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
  const { data: ints } = await admin.from('registro_intentos').select('id').order('id', { ascending: false }).limit(50);
  if (ints?.length) await admin.from('registro_intentos').delete().in('id', ints.map((r) => r.id));
};

await limpiar();

const { data: clubes } = await admin.rpc('listar_clubes_publicos');
const CLUB = clubes?.[0]?.club;
console.log(`club de prueba: ${CLUB}\n`);

const cedula = `${PREFIJO}-1`;
const telPadre = '09' + String(Date.now()).slice(-8);

const r = await fetch(`${URL}/functions/v1/registro-publico`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({
    atleta: { cedula, nombre: 'QA Password', fecha_nacimiento: '2012-05-15', club: CLUB, genero: 'Masculino' },
    padre: { nombre: 'QA Representante', telefono: telPadre, correo: null },
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

console.log('\n=== Limpieza ===');
await limpiar();
const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).like('cedula', `${PREFIJO}%`);
if ((count ?? 0) === 0) ok('no queda nada de la prueba');
else mal(`quedaron ${count} filas`);

console.log(`\n${fallos === 0 ? 'TODO OK' : `${fallos} COMPROBACIÓN(ES) FALLIDA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
