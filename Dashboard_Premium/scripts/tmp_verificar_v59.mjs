// Verificación de v59, los tres arreglos que salieron de la revisión adversarial
// de v57. Corre contra lo desplegado y llama a la RPC con service_role, que es la
// misma transacción que ejecuta la Edge Function.
//
//   node scripts/tmp_verificar_v59.mjs
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

const PREFIJO = 'QAV59';
const CORREO_FAMILIA = 'qav59.familia@ejemplo-inexistente.test';
const TEL_MAMA = `0900${PREFIJO}01`;
const TEL_PAPA = `0900${PREFIJO}02`;
const TEL_ATACANTE = `0900${PREFIJO}99`;

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

const registrar = (atleta, padre) => admin.rpc('registrar_publico', { p_atleta: atleta, p_padre: padre });
const hijo = (n, extra = {}) => ({
  cedula: `${PREFIJO}${n}`, nombre: `Atleta ${n} QAV59`,
  fecha_nacimiento: '2014-05-10', genero: 'Masculino', club: CLUB, ...extra,
});

console.log(`\n=== v59 · club ${CLUB} ===\n`);

// ── 1. La regresión del login: correo guardado en minúsculas, tecleado como se
//       escribió la primera vez. Antes de v59 devolvía el señuelo y no se podía
//       entrar por correo.
console.log('1. Login por correo con la capitalización que escribió la persona');
{
  const CORREO_MAYUS = `QAV59.Adulto@Ejemplo-Inexistente.test`;
  const { error } = await registrar(hijo('ADULTO', { correo: CORREO_MAYUS, fecha_nacimiento: '2000-03-15' }), null);
  if (error) {
    mal(`no se pudo registrar al adulto: ${error.message}`);
  } else {
    const { data: fila } = await admin.from('usuarios').select('correo').eq('cedula', `${PREFIJO}ADULTO`).single();
    if (fila.correo === CORREO_MAYUS.toLowerCase()) ok('la fila guarda el correo en minúsculas');
    else mal(`la fila guardó "${fila.correo}"`);

    // Lo que hace el login: resolver identificador → email de Auth.
    const { data: resuelto } = await anon.rpc('resolver_email_login', { p_identificador: CORREO_MAYUS });
    if (resuelto === CORREO_MAYUS.toLowerCase()) {
      ok('resolver_email_login lo encuentra escribiéndolo con mayúsculas');
    } else {
      mal(`devolvió "${resuelto}" (señuelo: no podría entrar por correo)`);
    }
    // Y el caso simétrico, para las filas viejas que sí tienen mayúsculas.
    const { data: resuelto2 } = await anon.rpc('resolver_email_login', { p_identificador: CORREO_MAYUS.toLowerCase() });
    if (resuelto2 === CORREO_MAYUS.toLowerCase()) ok('y también escribiéndolo en minúsculas');
    else mal(`en minúsculas devolvió "${resuelto2}"`);
  }
}

await limpiar();

// ── 2. El squat de correo: una fila PENDIENTE con el correo de otra familia ya
//       no se reutiliza, así que el atacante no hereda al menor.
console.log('\n2. Squat de correo: el atacante registra un atleta falso con el correo de una familia real');
{
  const r1 = await registrar(hijo('FALSO'), { nombre: 'Atacante', telefono: TEL_ATACANTE, correo: CORREO_FAMILIA });
  if (r1.error) {
    mal(`el squat falló por otra razón: ${r1.error.message}`);
  } else {
    ok('el squat crea su fila (queda pendiente, como cualquier alta pública)');
    const { data: p } = await admin.from('usuarios').select('id, estado').eq('id', r1.data.padre_id).single();
    if (p.estado === 'pendiente') ok(`y su estado es "${p.estado}"`);

    // Ahora la familia real, con SU teléfono y SU correo.
    const r2 = await registrar(hijo('REAL'), { nombre: 'Mama real', telefono: TEL_MAMA, correo: CORREO_FAMILIA });
    if (r2.error) {
      ok(`la familia real NO hereda la cuenta del atacante — se la corta con: "${r2.error.message}"`);
    } else {
      const heredado = r2.data.padre_id === r1.data.padre_id;
      if (heredado) mal('la familia real quedó VINCULADA a la cuenta del atacante (squat sigue abierto)');
      else mal('la familia real pasó pero con otro representante: revisar, no debería poder por el UNIQUE del correo');
    }
  }
}

await limpiar();

// ── 3. El caso legítimo de la entrega 4 sigue funcionando: el representante ya
//       APROBADO se reutiliza aunque el segundo hijo llegue desde otro número.
console.log('\n3. El caso real: el primer hijo ya está aprobado y el papá inscribe al segundo desde su número');
{
  const r1 = await registrar(hijo('H1'), { nombre: 'Mama QAV59', telefono: TEL_MAMA, correo: CORREO_FAMILIA });
  if (r1.error) { mal(`primer hijo: ${r1.error.message}`); }
  else {
    // Lo que hace el club al aprobar la solicitud.
    await admin.from('usuarios').update({ estado: 'activo' }).eq('id', r1.data.padre_id);
    ok('primer hijo inscrito y su representante aprobado por el club');

    const r2 = await registrar(hijo('H2'), { nombre: 'Papa QAV59', telefono: TEL_PAPA, correo: CORREO_FAMILIA });
    if (r2.error) {
      mal(`el segundo hermano sigue bloqueado: ${r2.error.message}`);
    } else if (r2.data.padre_existente && r2.data.padre_id === r1.data.padre_id) {
      ok('el segundo hermano se vincula al MISMO representante, reconocido por el correo');
    } else {
      mal(`padre_existente=${r2.data.padre_existente}, padre_id distinto`);
    }
    // La fuga que se cerró: la respuesta ya no trae el teléfono almacenado.
    if (r2.data && !('padre_telefono' in r2.data)) {
      ok('la respuesta ya no devuelve el teléfono del representante (no hay dato ajeno que filtrar)');
    } else {
      mal(`la respuesta sigue trayendo padre_telefono="${r2.data.padre_telefono}"`);
    }
  }
}

await limpiar();

// ── 4. Un representante `rechazado` no se reutiliza por ninguna vía ─────────
console.log('\n4. Un representante rechazado no se reutiliza (su cuenta ya no puede entrar)');
{
  const r1 = await registrar(hijo('R1'), { nombre: 'Mama rechazada', telefono: TEL_MAMA, correo: CORREO_FAMILIA });
  if (r1.error) { mal(`alta previa: ${r1.error.message}`); }
  else {
    await admin.from('usuarios').update({ estado: 'rechazado' }).eq('id', r1.data.padre_id);
    const r2 = await registrar(hijo('R2'), { nombre: 'Mama otra vez', telefono: TEL_MAMA, correo: CORREO_FAMILIA });
    if (r2.error) {
      ok(`no se reutiliza la cuenta rechazada — "${r2.error.message}"`);
    } else if (r2.data.padre_id === r1.data.padre_id) {
      mal('se reutilizó una cuenta rechazada: la familia entraría a una cuenta que no abre');
    } else {
      ok('se creó un representante nuevo en vez de reutilizar el rechazado');
    }
  }
}

await limpiar();
console.log(fallos ? `\n${fallos} fallo(s).` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
