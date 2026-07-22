// Verificación funcional de purgar_usuario_rechazado (v45).
//
// NO SE EJECUTÓ TODAVÍA: la migración 20260722210000_v45_purgar_usuario_
// rechazado.sql no se pudo aplicar (npx supabase db push --dry-run reporta
// un desfase de historial de migraciones remoto/local preexistente, ajeno a
// esta migración — ver el reporte de la tarea). Este script queda listo para
// correr en cuanto la migración esté aplicada en el proyecto remoto.
//
// Ciclo probado, calcado del mismo patrón que scripts/validar_rls_por_rol.js
// (suiteRegistroPublico + suiteSolicitudes):
//   1. Crea un atleta QA vía la Edge Function registro-publico (misma vía que
//      RegistroPage: RPC registrar_publico + cuenta de Auth real).
//   2. El owner de un club real lo rechaza con resolver_solicitud_registro.
//   3. El superadmin real llama purgar_usuario_rechazado: confirma que la
//      fila desaparece y que devuelve el auth_user_id que tenía.
//   4. Confirma que llamar purgar_usuario_rechazado sobre un usuario
//      estado='activo' real (sin tocarlo: el guard debe frenar ANTES de
//      cualquier DELETE) lanza excepción.
// Limpia todo lo que crea (usuario QA + su cuenta de Auth) en el finally,
// pase o falle.
//
// Uso: node scripts/tmp_verificar_purga_rechazado.mjs   (desde Dashboard_Premium/)
// Requiere en .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const URL_ = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const svc = createClient(URL_, SERVICE, opts);
const anon = () => createClient(URL_, ANON, opts);

// Club real ya sembrado (credenciales_5clubes.json) — evita crear un owner
// QA de usar y tirar solo para esta verificación puntual.
const CLUB = 'Nueva Loja Basket';
const OWNER = { cedula: 'NLB-OWNER', password: 'NLB-OWNER#2026' };
const SUPERADMIN = { cedula: 'BG-SUPERADMIN', password: 'BG-SUPERADMIN#2026' };
const QA_ATLETA = { cedula: 'QA_PURGA_REJ1', nombre: 'QA Purga Rechazado', nac: '2013-04-12' };

const resultados = [];
const check = (nombre, ok, detalle = '') => {
  resultados.push({ nombre, ok });
  console.log(`${ok ? '  [OK]' : '  [FALLA]'} ${nombre}${detalle && !ok ? ` — ${detalle}` : ''}`);
};

async function loginComo(cedula, password) {
  const cli = anon();
  const { data: email } = await cli.rpc('resolver_email_login', { p_identificador: cedula });
  const { data, error } = await cli.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${cedula}: ${error?.message}`);
  return cli;
}

async function main() {
  console.log('=== Verificación funcional: purgar_usuario_rechazado (v45) ===\n');
  let usuarioId = null;
  let authUserId = null;

  try {
    // 1. Alta pública real (RPC registrar_publico + cuenta de Auth), igual
    //    que RegistroPage.
    const res = await fetch(`${URL_}/functions/v1/registro-publico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({
        atleta: { cedula: QA_ATLETA.cedula, nombre: QA_ATLETA.nombre, fecha_nacimiento: QA_ATLETA.nac, club: CLUB },
      }),
    });
    const cuerpo = await res.json().catch(() => ({}));
    check('alta pública del atleta QA (HTTP 200)', res.status === 200 && cuerpo?.success, `HTTP ${res.status} ${cuerpo?.error || ''}`);

    const { data: fila } = await svc.from('usuarios')
      .select('id, estado, auth_user_id, cedula').eq('cedula', QA_ATLETA.cedula).single();
    usuarioId = fila?.id ?? null;
    authUserId = fila?.auth_user_id ?? null;
    check('nace pendiente con cuenta de Auth vinculada', fila?.estado === 'pendiente' && !!fila?.auth_user_id);

    // 2. El owner del club lo rechaza.
    const cliOwner = await loginComo(OWNER.cedula, OWNER.password);
    const { error: eRech } = await cliOwner.rpc('resolver_solicitud_registro',
      { p_usuario_id: usuarioId, p_accion: 'rechazar' });
    check('owner rechaza la solicitud', !eRech, eRech?.message);
    await cliOwner.auth.signOut();

    const { data: filaRech } = await svc.from('usuarios').select('estado').eq('id', usuarioId).single();
    check('estado queda en rechazado', filaRech?.estado === 'rechazado', `estado=${filaRech?.estado}`);

    // 3. El superadmin purga: la fila desaparece y devuelve el auth_user_id.
    const cliSuper = await loginComo(SUPERADMIN.cedula, SUPERADMIN.password);
    const { data: purga, error: ePurga } = await cliSuper.rpc('purgar_usuario_rechazado',
      { p_usuario_id: usuarioId });
    check('superadmin purga la cuenta rechazada sin error', !ePurga, ePurga?.message);
    check('la purga devuelve el auth_user_id que tenía', purga?.auth_user_id === authUserId,
      `esperado=${authUserId} recibido=${purga?.auth_user_id}`);
    check('la purga devuelve la cédula liberada', purga?.cedula === QA_ATLETA.cedula, `recibido=${purga?.cedula}`);

    const { data: filaBorrada } = await svc.from('usuarios').select('id').eq('id', usuarioId).maybeSingle();
    check('la fila usuarios ya no existe', !filaBorrada);
    const { data: atletaBorrado } = await svc.from('atletas').select('id').eq('usuario_id', usuarioId).maybeSingle();
    check('la fila atletas ya no existe', !atletaBorrado);
    usuarioId = null; // ya no hace falta limpiarlo en el finally

    // 4. Guard: sobre un usuario activo real (sin tocarlo) debe lanzar.
    const { data: activoReal } = await svc.from('usuarios')
      .select('id, estado').eq('cedula', OWNER.cedula).single();
    const { error: eGuard } = await cliSuper.rpc('purgar_usuario_rechazado',
      { p_usuario_id: activoReal.id });
    check('purgar sobre un usuario activo lanza excepción (guard)', !!eGuard, eGuard ? '' : 'no lanzó excepción');
    const { data: siguenActivo } = await svc.from('usuarios').select('estado').eq('id', activoReal.id).single();
    check('el usuario activo real sigue intacto tras el intento', siguenActivo?.estado === 'activo');

    await cliSuper.auth.signOut();
  } finally {
    // Cleanup: si algo falló a medias, no dejar al QA huérfano.
    if (usuarioId) {
      await svc.from('atletas').delete().eq('usuario_id', usuarioId);
      await svc.from('usuarios').delete().eq('id', usuarioId);
    }
    if (authUserId) {
      await svc.auth.admin.deleteUser(authUserId).catch(() => {});
    }
  }

  const fallidos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallidos.length}/${resultados.length} checks OK`);
  if (fallidos.length > 0) {
    console.log('Fallidos:', fallidos.map((f) => f.nombre).join(', '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Error inesperado:', e);
  process.exit(1);
});
