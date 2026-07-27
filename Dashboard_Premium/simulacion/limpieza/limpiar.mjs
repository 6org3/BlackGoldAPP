// limpieza/limpiar.mjs — Borra TODO el club de simulación de forma segura.
// Solo toca filas cuyo prefijo/club es el de simulación (SIMLOOP- / "SIM Loop
// Diario"), nunca los clubes DEMO/QA ni datos reales.
//
// Uso:
//   node simulacion/limpieza/limpiar.mjs            # DRY-RUN: lista qué borraría
//   SIM_REAL=1 node simulacion/limpieza/limpiar.mjs # borra de verdad
//
// Modelado sobre scripts/limpiar_simulacion_club_demo.mjs (mismo enfoque).

import { admin, REAL } from '../core/supa.mjs';
import { CLUB, PREFIJO } from '../core/estado.mjs';

async function main() {
  console.log(`🧹 Limpieza club "${CLUB}" (prefijo ${PREFIJO}) — ${REAL ? 'REAL' : 'DRY-RUN'}`);

  const { data: usuarios = [] } = await admin.from('usuarios').select('id, auth_user_id, cedula').eq('club', CLUB);
  const usuarioIds = usuarios.map((u) => u.id);
  const { data: atletas = [] } = usuarioIds.length
    ? await admin.from('atletas').select('id').in('usuario_id', usuarioIds)
    : { data: [] };
  const atletaIds = atletas.map((a) => a.id);

  console.log(`  usuarios: ${usuarios.length} · atletas: ${atletaIds.length}`);

  if (!REAL) {
    console.log('  (dry-run) Borraría, en orden hijo→padre: asistencia, evaluaciones_pruebas,');
    console.log('  progreso_misiones, xp_eventos, pago_transacciones, pagos, atleta_grupo,');
    console.log('  evento_convocados, eventos, comunicacion_destinatarios, comunicaciones,');
    console.log('  atletas, usuarios (+ cuentas Auth), grupos de simulación.');
    return;
  }

  const delIn = async (tabla, col, ids) => {
    if (!ids.length) return;
    const { error } = await admin.from(tabla).delete().in(col, ids);
    if (error) console.warn(`  ⚠️ ${tabla}: ${error.message}`);
    else console.log(`  ✔ ${tabla} limpiada`);
  };

  // hijos por atleta
  await delIn('asistencia', 'atleta_id', atletaIds);
  await delIn('evaluaciones_pruebas', 'atleta_id', atletaIds);
  await delIn('progreso_misiones', 'atleta_id', atletaIds);
  await delIn('xp_eventos', 'atleta_id', atletaIds);
  await delIn('atleta_grupo', 'atleta_id', atletaIds);
  // pagos y sus transacciones
  const { data: pagos = [] } = atletaIds.length ? await admin.from('pagos').select('id').in('atleta_id', atletaIds) : { data: [] };
  await delIn('pago_transacciones', 'pago_id', pagos.map((p) => p.id));
  await delIn('pagos', 'atleta_id', atletaIds);
  // atletas y usuarios
  await delIn('atletas', 'usuario_id', usuarioIds);
  // Auth
  for (const u of usuarios) if (u.auth_user_id) await admin.auth.admin.deleteUser(u.auth_user_id).catch(() => {});
  await delIn('usuarios', 'id', usuarioIds);
  // grupos, eventos y comunicaciones del club
  await admin.from('eventos').delete().eq('club', CLUB).then(() => console.log('  ✔ eventos'));
  await admin.from('comunicaciones').delete().eq('club', CLUB).then(() => console.log('  ✔ comunicaciones')).catch(() => {});
  await admin.from('grupos_entrenamiento').delete().ilike('descripcion', '%simulación (loop diario)%').then(() => console.log('  ✔ grupos'));
  console.log('✅ Limpieza completa.');
}

main().catch((e) => { console.error(e); process.exit(1); });
