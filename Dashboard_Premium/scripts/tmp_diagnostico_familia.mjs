// Diagnóstico de la entrega 4: qué pasa EXACTAMENTE cuando una familia real
// intenta inscribir a dos hermanos. Llama a registrar_publico() con
// service_role, que es la misma transacción que ejecuta la Edge Function, para
// leer los mensajes de error tal cual los recibe la familia.
//
// Solo diagnostica: no arregla nada. Limpia lo que crea (prefijo QAFAM).
//
//   node scripts/tmp_diagnostico_familia.mjs
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

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PREFIJO = 'QAFAM';
const CORREO_MAMA = 'qafam.mama@ejemplo-inexistente.test';
const TEL_MAMA = '0900QAFAM01';
const TEL_PAPA = '0900QAFAM02';

const limpiar = async () => {
  const { data: filas } = await admin.from('usuarios').select('id')
    .or(`cedula.like.${PREFIJO}%,cedula.like.PADRE_0900QAFAM%`);
  for (const f of filas ?? []) await admin.from('atletas').delete().eq('usuario_id', f.id);
  await admin.from('usuarios').delete().like('cedula', `${PREFIJO}%`);
  await admin.from('usuarios').delete().like('cedula', 'PADRE_0900QAFAM%');
};

const registrar = (atleta, padre) => admin.rpc('registrar_publico', {
  p_atleta: atleta, p_padre: padre,
});

const hijo = (n, extra = {}) => ({
  cedula: `${PREFIJO}${n}`,
  nombre: `Hermano ${n} QAFAM`,
  fecha_nacimiento: '2014-05-10',
  genero: 'Masculino',
  ...extra,
});
const rep = (telefono, correo, nombre = 'Mama QAFAM') => ({ nombre, telefono, correo });

console.log('=== DIAGNÓSTICO ENTREGA 4: una familia con dos hermanos ===\n');

await limpiar();

// El club tiene que existir con un owner activo o la RPC corta antes de llegar
// a lo que interesa medir.
const { data: owners } = await admin.from('usuarios')
  .select('club').eq('rol', 'owner').eq('estado', 'activo').limit(1);
const CLUB = owners?.[0]?.club;
if (!CLUB) {
  console.log('No hay ningún club con owner activo: no se puede diagnosticar.');
  process.exit(1);
}
console.log(`Club de prueba: ${CLUB}\n`);

const conClub = (a) => ({ ...a, club: CLUB });

// ── A. El correo de la familia en el campo "correo" del ATLETA ───────────────
// El formulario público lo ofrece como opcional, así que es lo primero que hace
// una madre que rellena todo lo que ve.
console.log('A. Primer hijo con el correo de la mamá en SU campo, y el mismo en el del representante');
{
  const { data, error } = await registrar(
    conClub(hijo('A1', { correo: CORREO_MAMA })),
    rep(TEL_MAMA, CORREO_MAMA),
  );
  console.log(error ? `   ERROR: ${error.message}` : `   OK: ${JSON.stringify(data)}`);
}

await limpiar();

// ── B. Segundo hermano: mismo correo en el campo del atleta ─────────────────
console.log('\nB. Dos hermanos, cada uno con el correo de la mamá en SU campo');
{
  const r1 = await registrar(conClub(hijo('B1', { correo: CORREO_MAMA })), null);
  console.log(r1.error ? `   hermano 1 ERROR: ${r1.error.message}` : '   hermano 1 OK');
  const r2 = await registrar(conClub(hijo('B2', { correo: CORREO_MAMA })), null);
  console.log(r2.error ? `   hermano 2 ERROR: ${r2.error.message}` : '   hermano 2 OK');
}

await limpiar();

// ── C. Segundo hermano: mismo TELÉFONO en el campo del atleta ───────────────
console.log('\nC. Dos hermanos, cada uno con el teléfono de casa en SU campo');
{
  const r1 = await registrar(conClub(hijo('C1', { telefono: TEL_MAMA })), null);
  console.log(r1.error ? `   hermano 1 ERROR: ${r1.error.message}` : '   hermano 1 OK');
  const r2 = await registrar(conClub(hijo('C2', { telefono: TEL_MAMA })), null);
  console.log(r2.error ? `   hermano 2 ERROR: ${r2.error.message}` : '   hermano 2 OK');
}

await limpiar();

// ── D. El camino que SÍ debería funcionar: representante idéntico ───────────
console.log('\nD. Dos hermanos con el MISMO representante (teléfono y correo idénticos)');
{
  const r1 = await registrar(conClub(hijo('D1')), rep(TEL_MAMA, CORREO_MAMA));
  console.log(r1.error ? `   hermano 1 ERROR: ${r1.error.message}`
    : `   hermano 1 OK — padre_existente=${r1.data.padre_existente}`);
  const r2 = await registrar(conClub(hijo('D2')), rep(TEL_MAMA, CORREO_MAMA));
  console.log(r2.error ? `   hermano 2 ERROR: ${r2.error.message}`
    : `   hermano 2 OK — padre_existente=${r2.data.padre_existente} (reutiliza al mismo)`);
  if (!r2.error) {
    const { count } = await admin.from('padres_atletas')
      .select('atleta_id', { count: 'exact', head: true })
      .eq('padre_id', r2.data.padre_id);
    console.log(`   hijos vinculados al representante: ${count}`);
  }
}

await limpiar();

// Lo que hace el club al aprobar una solicitud.
const aprobarRepresentante = (telefono) => admin.from('usuarios')
  .update({ estado: 'activo' }).eq('cedula', `PADRE_${telefono}`);

// ── E. Papá y mamá: mismo correo familiar, teléfonos distintos ──────────────
// Este es EL caso de la entrega 4, y desde v59 depende de que el club ya haya
// aprobado al representante del primer hijo: el correo que llega al registro
// público no está verificado, así que uno ajeno no puede bastar para heredar una
// cuenta (ver la cabecera de v59). Se miden las dos variantes.
console.log('\nE. Un hermano lo inscribe la mamá y el otro el papá, con el correo familiar compartido');
{
  const r1 = await registrar(conClub(hijo('E1')), rep(TEL_MAMA, CORREO_MAMA, 'Mama QAFAM'));
  console.log(r1.error ? `   hermano 1 ERROR: ${r1.error.message}` : '   hermano 1 OK (representante queda pendiente)');
  const rMismoDia = await registrar(conClub(hijo('E2')), rep(TEL_PAPA, CORREO_MAMA, 'Papa QAFAM'));
  console.log(rMismoDia.error
    ? `   el MISMO DÍA, sin aprobar aún: bloqueado — "${rMismoDia.error.message}"`
    : '   el MISMO DÍA, sin aprobar aún: OK');
  await aprobarRepresentante(TEL_MAMA);
  const rAprobado = await registrar(conClub(hijo('E3')), rep(TEL_PAPA, CORREO_MAMA, 'Papa QAFAM'));
  console.log(rAprobado.error
    ? `   con el representante YA APROBADO: ERROR ${rAprobado.error.message}`
    : `   con el representante YA APROBADO: OK — padre_existente=${rAprobado.data.padre_existente}`);
}

await limpiar();

// ── F. El mismo representante que la segunda vez escribe otro número ────────
console.log('\nF. La misma mamá inscribe al segundo hijo desde otro número (mismo correo)');
{
  const r1 = await registrar(conClub(hijo('F1')), rep(TEL_MAMA, CORREO_MAMA));
  console.log(r1.error ? `   hermano 1 ERROR: ${r1.error.message}` : '   hermano 1 OK');
  await aprobarRepresentante(TEL_MAMA);
  const r2 = await registrar(conClub(hijo('F2')), rep(TEL_PAPA, CORREO_MAMA));
  console.log(r2.error
    ? `   hermano 2 ERROR: ${r2.error.message}`
    : `   hermano 2 OK — padre_existente=${r2.data.padre_existente}`);
}

await limpiar();

// ── G. ¿El representante se reutiliza CRUZANDO clubes? ──────────────────────
// `SELECT id FROM usuarios WHERE cedula = 'PADRE_<tel>'` no filtra por club.
console.log('\nG. Representante ya existente en un club, inscribiendo en OTRO club');
{
  const { data: clubes } = await admin.from('usuarios')
    .select('club').eq('rol', 'owner').eq('estado', 'activo');
  const distintos = [...new Set((clubes ?? []).map((c) => c.club))];
  if (distintos.length < 2) {
    console.log('   omitido: hace falta más de un club con owner activo');
  } else {
    const [c1, c2] = distintos;
    const r1 = await registrar({ ...hijo('G1'), club: c1 }, rep(TEL_MAMA, CORREO_MAMA));
    console.log(r1.error ? `   en ${c1} ERROR: ${r1.error.message}` : `   en ${c1} OK`);
    const r2 = await registrar({ ...hijo('G2'), club: c2 }, rep(TEL_MAMA, CORREO_MAMA));
    if (r2.error) {
      console.log(`   en ${c2} ERROR: ${r2.error.message}`);
    } else {
      const { data: p } = await admin.from('usuarios').select('club').eq('id', r2.data.padre_id).single();
      console.log(`   en ${c2} OK — padre_existente=${r2.data.padre_existente}, `
        + `el representante sigue en club="${p?.club}" pero ahora ve un atleta de "${c2}"`);
    }
  }
}

await limpiar();

// ── H. El límite que NO se puede cerrar: dos TITULARES con un solo correo ───
// El hermano de 18 se inscribe solo (es su propio titular, correo obligatorio
// desde la entrega 3) y luego la madre inscribe al de 12 poniendo el mismo correo
// familiar como representante. No hay salida técnica: cada uno necesita su cuenta
// de Auth y GoTrue exige que el email sea único, así que el correo solo puede
// pertenecer a uno. Lo que v57 arregla es que UN representante cubra a varios
// hijos; esto es distinto. Se mide para saber qué mensaje recibe la familia.
console.log('\nH. Hermano mayor de edad con el correo familiar, y luego el menor con ese mismo correo');
{
  const r1 = await registrar(
    conClub({ ...hijo('H1', { correo: CORREO_MAMA }), fecha_nacimiento: '2005-01-10' }),
    null,
  );
  console.log(r1.error ? `   mayor de edad ERROR: ${r1.error.message}` : '   mayor de edad OK (se queda con el correo)');
  const r2 = await registrar(conClub(hijo('H2')), rep(TEL_MAMA, CORREO_MAMA));
  console.log(r2.error ? `   hermano menor ERROR: ${r2.error.message}` : '   hermano menor OK');
}

await limpiar();
console.log('\n=== fin del diagnóstico (todo lo creado quedó borrado) ===');
