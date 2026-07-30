// ¿Puede una cuenta de representante en estado 'pendiente' leer los datos de su
// hijo por PostgREST, saltándose la pantalla de "cuenta en revisión"?
//
// De esto depende la gravedad del vector de squat de correo: si el gate de
// `estado` es solo de UI, quien consiga vincularse a un menor lo lee con solo
// tener el JWT. Si la RLS también lo corta, hace falta además que el dueño del
// club apruebe la cuenta.
//
//   node scripts/tmp_verificar_padre_pendiente.mjs
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

const PREFIJO = 'QAPEND';
const PASS = 'Sonda-Padre-Pendiente-2026';
const correoPadre = `${PREFIJO.toLowerCase()}padre@ejemplo-inexistente.test`;

const limpiar = async () => {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of (users?.users ?? []).filter((x) => (x.email || '').includes(PREFIJO.toLowerCase()))) {
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: filas } = await admin.from('usuarios').select('id').like('cedula', `${PREFIJO}%`);
  for (const f of filas ?? []) await admin.from('atletas').delete().eq('usuario_id', f.id);
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
};

await limpiar();

const { data: owners } = await admin.from('usuarios')
  .select('club').eq('rol', 'owner').eq('estado', 'activo').limit(1);
const CLUB = owners?.[0]?.club;

// Un menor ACTIVO (como el hijo real de una familia ya aprobada) y un
// representante PENDIENTE vinculado a él: exactamente el estado en que quedaría
// el atacante del vector de squat mientras el club no ha aprobado nada.
const { data: uHijo } = await admin.from('usuarios').insert({
  cedula: `${PREFIJO}HIJO`, nombre: 'Menor real QAPEND', rol: 'atleta',
  club: CLUB, estado: 'activo', fecha_nacimiento: '2013-06-01', genero: 'Masculino',
}).select('id').single();
const { data: aHijo } = await admin.from('atletas').insert({
  usuario_id: uHijo.id, edad: 13, posicion: 'Guard',
}).select('id').single();

const { data: uPadre } = await admin.from('usuarios').insert({
  cedula: `${PREFIJO}PADRE`, nombre: 'Representante pendiente QAPEND', rol: 'padre',
  club: CLUB, estado: 'pendiente', correo: correoPadre,
}).select('id').single();
const { data: authPadre, error: eAuth } = await admin.auth.admin.createUser({
  email: correoPadre, password: PASS, email_confirm: true,
});
if (eAuth || !authPadre?.user) {
  console.log(`no se pudo crear la cuenta de Auth: ${eAuth?.message ?? 'sin usuario'}`);
  await limpiar();
  process.exit(1);
}
// El trigger trg_vincular_auth_usuario (v24/v40) ya la vincula por correo; el
// UPDATE es por si acaso y es idempotente.
await admin.from('usuarios').update({ auth_user_id: authPadre.user.id }).eq('id', uPadre.id);
await admin.from('padres_atletas').insert({ padre_id: uPadre.id, atleta_id: aHijo.id });

// Datos del menor que el representante NO debería ver estando pendiente.
const { error: eRead } = await admin.from('atleta_readiness').insert({
  atleta_id: aHijo.id, fecha: '2026-07-29', sueno_calidad: 2, fatiga_fisica: 8,
});
if (eRead) console.log(`   (readiness no sembrado: ${eRead.message})`);

const padre = createClient(URL_SB, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sesion, error: eLogin } = await padre.auth.signInWithPassword({ email: correoPadre, password: PASS });
if (eLogin) { console.log(`no se pudo abrir sesión: ${eLogin.message}`); await limpiar(); process.exit(1); }

console.log(`\n=== Representante en estado 'pendiente' con sesión válida ===`);
console.log(`   JWT emitido: ${sesion?.session?.access_token ? 'sí' : 'no'}\n`);

const sondear = async (tabla, consulta) => {
  const { data, error } = await consulta;
  const n = data?.length ?? 0;
  console.log(`   ${tabla}: ${error ? `bloqueado (${error.code} ${error.message})` : `${n} fila(s) legibles`}`);
  return n;
};

let leidas = 0;
leidas += await sondear('usuarios (la fila del menor)', padre.from('usuarios').select('id, nombre, cedula, fecha_nacimiento').eq('id', uHijo.id));
leidas += await sondear('atletas (su ficha)', padre.from('atletas').select('id, xp_total, nivel_desarrollo').eq('id', aHijo.id));
leidas += await sondear('atleta_readiness (sueño y fatiga)', padre.from('atleta_readiness').select('fecha, sueno_calidad, fatiga_fisica, readiness_score').eq('atleta_id', aHijo.id));
leidas += await sondear('asistencia', padre.from('asistencia').select('fecha, estado').eq('atleta_id', aHijo.id));
leidas += await sondear('pagos', padre.from('pagos').select('id, monto_final, estado').eq('atleta_id', aHijo.id));

console.log('');
if (leidas > 0) {
  console.log(`   CONCLUSIÓN: el gate de 'estado' es SOLO de UI — la cuenta pendiente leyó ${leidas} fila(s) del menor por API.`);
} else {
  console.log('   CONCLUSIÓN: la RLS también corta a la cuenta pendiente; no basta con tener el JWT.');
}

await padre.auth.signOut({ scope: 'local' }).catch(() => {});
await limpiar();
