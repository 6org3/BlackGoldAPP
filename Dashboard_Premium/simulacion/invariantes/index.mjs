// invariantes/index.mjs — Aserciones sobre el estado de la BD que DEBEN
// cumplirse siempre. Cada violación es un HALLAZGO (posible bug) con contexto.
// Solo LECTURA (service_role). Se corren en checkpoints del loop.
//
// Estas invariantes son el objetivo "encontrar bugs / probar lógica de negocio":
// no prueban que la UI se ve linda, prueban que los datos que la app produjo
// respetan sus propias reglas.

import { admin } from '../core/supa.mjs';
import { CLUB } from '../core/estado.mjs';
import { calcularCategoriaFEB } from '../../../packages/analytics-core/categoriaFEB.js';

async function idsAtletasClub() {
  const { data: us = [] } = await admin.from('usuarios').select('id').eq('club', CLUB).eq('rol', 'atleta');
  const ids = us.map((u) => u.id);
  if (!ids.length) return { atletaIds: [], usuarioIds: [] };
  const { data: at = [] } = await admin.from('atletas').select('id, usuario_id, categoria_feb, es_becado').in('usuario_id', ids);
  return { atletaIds: at.map((a) => a.id), atletas: at, usuarioIds: ids };
}

export const invariantes = {
  // 🎯 ALTA: la categoría FEB guardada debe coincidir con la derivada de la
  // fecha de nacimiento (riesgo real: gemelo JS vs SQL de v20, ver CLAUDE.md).
  async categoriaFEBCoherente({ reporte }) {
    const { data: us = [] } = await admin.from('usuarios')
      .select('id, fecha_nacimiento, atletas(id, categoria_feb)')
      .eq('club', CLUB).eq('rol', 'atleta');
    for (const u of us) {
      const fila = Array.isArray(u.atletas) ? u.atletas[0] : u.atletas;
      if (!fila || !u.fecha_nacimiento) continue;
      const esperada = calcularCategoriaFEB(u.fecha_nacimiento);
      if (fila.categoria_feb !== esperada) {
        reporte.hallazgo({
          regla: 'categoria_feb_desincronizada', severidad: 'alta',
          detalle: `atleta ${fila.id}: BD='${fila.categoria_feb}' vs esperada='${esperada}' (nac ${u.fecha_nacimiento})`,
          contexto: { atletaId: fila.id, guardada: fila.categoria_feb, esperada },
        });
      }
    }
  },

  // 🎯 Cuadre de pagos: sum(transacciones) <= monto; 'Pagado' ⇒ saldo≈0.
  // Aquí aflora el bug documentado de monto_base=30 hardcodeado si el precio
  // del grupo del atleta es distinto (comparar contra servicio_tarifas).
  async pagosCuadran({ reporte }) {
    const { atletaIds } = await idsAtletasClub();
    if (!atletaIds.length) return;
    const { data: pagos = [] } = await admin.from('pagos')
      .select('id, atleta_id, monto, estado').in('atleta_id', atletaIds);
    for (const p of pagos) {
      const { data: tx = [] } = await admin.from('pago_transacciones').select('monto').eq('pago_id', p.id);
      const abonado = tx.reduce((s, t) => s + Number(t.monto || 0), 0);
      const saldo = Number(p.monto || 0) - abonado;
      if (abonado > Number(p.monto) + 0.001) {
        reporte.hallazgo({ regla: 'pago_sobrepagado', severidad: 'alta',
          detalle: `pago ${p.id}: abonado ${abonado} > monto ${p.monto}`, contexto: { pagoId: p.id } });
      }
      if (p.estado === 'Pagado' && saldo > 0.001) {
        reporte.hallazgo({ regla: 'pago_pagado_con_saldo', severidad: 'alta',
          detalle: `pago ${p.id} marcado Pagado pero saldo=${saldo.toFixed(2)}`, contexto: { pagoId: p.id, saldo } });
      }
    }
    // TODO(Antigravity): comparar p.monto contra precio esperado por grupo/
    // categoría (servicio_tarifas) → detectar el monto_base=30 hardcodeado.
  },

  // 🎯 Integridad referencial: nada huérfano.
  async sinHuerfanos({ reporte }) {
    const { atletaIds, atletas = [], usuarioIds } = await idsAtletasClub();
    for (const a of atletas) {
      if (!usuarioIds.includes(a.usuario_id)) {
        reporte.hallazgo({ regla: 'atleta_sin_usuario', severidad: 'alta',
          detalle: `atleta ${a.id} apunta a usuario ${a.usuario_id} inexistente en el club`, contexto: { atletaId: a.id } });
      }
    }
    if (atletaIds.length) {
      const { data: asis = [] } = await admin.from('asistencia').select('id, atleta_id').in('atleta_id', atletaIds).limit(5000);
      const set = new Set(atletaIds);
      for (const r of asis) if (!set.has(r.atleta_id)) {
        reporte.hallazgo({ regla: 'asistencia_huerfana', severidad: 'media',
          detalle: `asistencia ${r.id} referencia atleta ${r.atleta_id} fuera del set`, contexto: { asistenciaId: r.id } });
      }
    }
  },

  // 🚧 XP: la suma del ledger xp_eventos debe igualar el total del atleta.
  // TODO(Antigravity): confirmá la columna del total (¿atletas.xp_total?) y
  // compará contra SUM(xp_eventos.xp). Sin negativos.
  async xpLedgerCuadra({ reporte }) {
    // esqueleto — completar con el nombre real de la columna de XP acumulado.
  },

  // 🚧 RLS: en vez de reimplementar, corré el suite existente y capturá su
  // salida. TODO(Antigravity): ejecutar `node scripts/validar_rls_por_rol.js`
  // como subproceso en el checkpoint y convertir cada '❌' en un hallazgo alta.
  async rlsPorRol({ reporte }) {
    // esqueleto — ver scripts/validar_rls_por_rol.js (ya existe, reusar).
  },
};

// Corre todas las invariantes y devuelve el nº de hallazgos nuevos.
export async function correrInvariantes(ctx) {
  const antes = ctx.reporte.jsonl; // marcador
  for (const [nombre, fn] of Object.entries(invariantes)) {
    try { await fn(ctx); } catch (e) { ctx.reporte.error({ msg: `invariante ${nombre}: ${e.message}` }); }
  }
  return antes;
}
