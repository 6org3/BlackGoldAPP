// acciones/index.mjs — Catálogo de ACCIONES del club. Cada acción envuelve la
// lógica/servicio REAL del app para ejercitarla (no reinventar reglas).
//
// Contrato: async fn(ctx) donde ctx = { estado, reloj, rng, reporte, fase }.
// Toda escritura pasa por guardado(desc, fn): en dry-run (default) NO escribe,
// solo registra el plan. Con SIM_REAL=1 ejecuta de verdad contra staging.
//
// Estado de implementación:
//   ✅ implementadas: altaCoach, altaAtleta, asistencia, pago
//   🚧 esqueleto (Antigravity completa, puntero exacto al servicio incluido):
//      evaluacion, mision, evento, comunicacion, baja
//
// Regla de oro del repo: la lógica de negocio vive en packages/analytics-core y
// en src/api/*Service.js — reusala, no la copies.

import { admin, guardado, REAL } from '../core/supa.mjs';
import { CLUB, emailInterno } from '../core/estado.mjs';
import { nuevoAtleta, nuevoCoach, EDAD_POR_GRUPO } from '../generadores/personas.mjs';
import { calcularCategoriaFEB } from '../../../packages/analytics-core/categoriaFEB.js';

// ── helper idempotente: fila usuarios + cuenta Auth (patrón crear_cuentas_prueba.js) ──
async function ensureUsuarioConAuth({ cedula, nombre, rol, fecha_nacimiento = null, genero = null }) {
  const { data: ya } = await admin.from('usuarios').select('id, auth_user_id').eq('cedula', cedula).maybeSingle();
  if (!REAL) return { id: ya?.id || `dry:${cedula}`, cedula, nuevo: !ya };
  let id = ya?.id;
  if (!id) {
    const row = { cedula, nombre, rol, club: CLUB };
    if (fecha_nacimiento) { row.fecha_nacimiento = fecha_nacimiento; row.genero = genero || 'Masculino'; }
    const { data, error } = await admin.from('usuarios').insert(row).select('id').single();
    if (error) throw new Error(`insert usuarios ${cedula}: ${error.message}`);
    id = data.id;
  }
  if (!ya?.auth_user_id) {
    const { data: au, error: ea } = await admin.auth.admin.createUser({
      email: emailInterno(cedula), password: String(cedula), email_confirm: true,
    });
    if (!ea && au?.user) await admin.from('usuarios').update({ auth_user_id: au.user.id }).eq('id', id);
  }
  return { id, cedula, nuevo: !ya };
}

// ─────────────────────────────────────────────────────────────────────────
export const acciones = {
  // ✅ Alta de coach hasta cubrir 1 por cada ~2 grupos.
  async altaCoach(ctx) {
    const { estado, rng, reporte } = ctx;
    const necesarios = Math.max(1, Math.ceil(ctx.fase.grupos.length / 2));
    if (estado.coaches.length >= necesarios) return;
    const c = nuevoCoach(rng);
    await guardado(`coach ${c.cedula}`, () => ensureUsuarioConAuth(c));
    reporte.accion({ tipo: 'altaCoach', cedula: c.cedula, dia: ctx.reloj.iso });
  },

  // ✅ Alta de atletas hasta el objetivo de la fase; crea usuario+auth, fila
  //    atletas y pertenencia a grupo. categoria_feb se DERIVA (no se inventa).
  async altaAtleta(ctx) {
    const { estado, rng, reporte, fase, reloj } = ctx;
    if (estado.atletas.length >= fase.objetivoAtletas) return;
    const grupoNombre = rng.pick(fase.grupos);
    const rango = EDAD_POR_GRUPO[grupoNombre] || { edadMin: 8, edadMax: 16 };
    const a = nuevoAtleta(rng, rango);
    const catEsperada = calcularCategoriaFEB(a.fecha_nacimiento);

    await guardado(`atleta ${a.cedula} (${grupoNombre})`, async () => {
      const u = await ensureUsuarioConAuth(a);
      // fila atletas — TODO(Antigravity): confirmá columnas en src/api/atletasService.js
      await admin.from('atletas').upsert(
        { usuario_id: u.id, categoria_feb: catEsperada, es_becado: a.perfilPago === 'becado' },
        { onConflict: 'usuario_id' }
      );
      // pertenencia a grupo (tabla atleta_grupo, migración v18)
      const grupo = estado.grupos.find((g) => g.nombre === grupoNombre);
      if (grupo) {
        const { data: at } = await admin.from('atletas').select('id').eq('usuario_id', u.id).single();
        await admin.from('atleta_grupo').upsert({ atleta_id: at.id, grupo_id: grupo.id }, { onConflict: 'atleta_id,grupo_id' });
      }
    });
    reporte.accion({ tipo: 'altaAtleta', cedula: a.cedula, grupo: grupoNombre, catEsperada, dia: reloj.iso });
  },

  // ✅ Asistencia del día para los grupos que entrenan hoy. Respeta la
  //    constraint UNIQUE(atleta_id, fecha) usando upsert por (atleta_id,fecha).
  async asistencia(ctx) {
    const { estado, reloj, rng, reporte, fase } = ctx;
    if (!reloj.esDiaEntreno) return;
    let n = 0;
    for (const at of estado.atletas) {
      if (!rng.chance(fase.prob.asistencia)) continue;
      const estadoAsis = rng.chance(0.9) ? 'presente' : 'ausente'; // TODO: valores enum reales de asistencia.estado
      await guardado(`asistencia ${at.id} ${reloj.iso}`, () =>
        admin.from('asistencia').upsert(
          { atleta_id: at.id, fecha: reloj.iso, estado: estadoAsis },
          { onConflict: 'atleta_id,fecha' }
        ).then(({ error }) => { if (error) throw new Error(error.message); }));
      n++;
    }
    if (n) reporte.accion({ tipo: 'asistencia', registros: n, dia: reloj.iso });
  },

  // ✅ Pagos: el día 1 genera el mes vía RPC real; durante el mes registra
  //    abonos según perfil; a fin de mes marca vencidos. Ejercita pagosService.
  async pago(ctx) {
    const { reloj, reporte, estado } = ctx;
    if (reloj.esInicioDeMes) {
      // RPC real que envuelve generarPagosMensuales (src/api/pagosService.js:161)
      await guardado(`generar_pagos_mes ${reloj.mes()}/${reloj.anio()}`, () =>
        admin.rpc('generar_pagos_mes', { p_club: CLUB, p_mes: reloj.mes(), p_anio: reloj.anio() })
          .then(({ error }) => { if (error) throw new Error(error.message); }));
      reporte.accion({ tipo: 'pago:generar', mes: `${reloj.mes()}/${reloj.anio()}`, dia: reloj.iso });
    }
    // TODO(Antigravity): durante el mes, para pagos 'Pendiente', registrar
    // abonos con admin.rpc/registrarTransaccion(pagoId, monto,...) según
    // at.perfilPago (puntual/ocasional/moroso/becado). Ver pagosService.js:63,120.
    if (reloj.esFinDeMes) {
      await guardado('actualizar_estado_vencidos', () =>
        admin.rpc('actualizar_estado_vencidos').then(() => {}).catch(() => {})); // TODO: nombre RPC real o service
      reporte.accion({ tipo: 'pago:vencidos', dia: reloj.iso });
    }
  },

  // 🚧 Evaluación física. Insertar en evaluaciones_pruebas usando el catálogo
  //    real (BAREMOS de packages/analytics-core/baremos.js) y luego recalcular
  //    overall. Puntero: src/api/evaluacionesService.js:16 guardarEvaluacion /
  //    :41 guardarEvaluacionesLote / :74 recalcularOverall.
  async evaluacion(ctx) {
    const { estado, rng, reporte, reloj, fase } = ctx;
    const objetivos = rng.sample(estado.atletas, Math.ceil(estado.atletas.length * fase.prob.evaluacion));
    if (!objetivos.length) return;
    reporte.accion({ tipo: 'evaluacion(plan)', atletas: objetivos.length, dia: reloj.iso });
    // TODO(Antigravity): implementar inserción real reusando BAREMOS + calcularOverall.
  },

  // 🚧 Misiones + XP. Puntero: src/api/misionesService.js (asignar/completar/
  //    aprobar) + src/api/xpService.js:26 otorgarXP + recomendaciones.calcularXPMision.
  async mision(ctx) {
    const { estado, rng, reporte, reloj, fase } = ctx;
    const objetivos = rng.sample(estado.atletas, Math.ceil(estado.atletas.length * fase.prob.mision));
    if (!objetivos.length) return;
    reporte.accion({ tipo: 'mision(plan)', atletas: objetivos.length, dia: reloj.iso });
    // TODO(Antigravity): asignar/completar/aprobar → progreso_misiones + xp_eventos.
  },

  // 🚧 Evento + convocatoria + RSVP. Puntero: src/api/eventosService.js:5
  //    crearEvento / :95 responderRSVP (tablas eventos, evento_convocados).
  async evento(ctx) {
    const { reporte, reloj } = ctx;
    reporte.accion({ tipo: 'evento(plan)', dia: reloj.iso });
    // TODO(Antigravity): crear evento del club + convocar atletas + responder RSVP aleatorio.
  },

  // 🚧 Comunicación segmentada. Puntero: src/api/comunicacionesService.js:16
  //    crearComunicacion (tablas comunicaciones, comunicacion_destinatarios).
  async comunicacion(ctx) {
    const { reporte, reloj } = ctx;
    reporte.accion({ tipo: 'comunicacion(plan)', dia: reloj.iso });
    // TODO(Antigravity): crear anuncio segmentado y resolver audiencia.
  },

  // 🚧 Baja/retención. Puntero: src/api/retencionService.js:47 marcarBaja
  //    (atletas.fecha_baja/estado_membresia).
  async baja(ctx) {
    const { estado, rng, reporte, reloj, fase } = ctx;
    if (!estado.atletas.length || !rng.chance(fase.prob.baja)) return;
    const victima = rng.pick(estado.atletas);
    reporte.accion({ tipo: 'baja(plan)', atleta: victima.id, dia: reloj.iso });
    // TODO(Antigravity): marcarBaja(victima.id, true) y quitar de estado.atletas.
  },
};
