// Reconcilia pagos de tipo 'Mensualidad' ya generados con el bug corregido en
// src/api/pagosService.js (generarPagosMensuales cobraba $30 fijo a todos,
// ignorando el precio_mensual real del grupo del atleta — ver commit del fix
// y la auditoría previa de la simulación de 6+12 meses del club demo).
//
// Alcance DELIBERADO: solo corrige pagos con estado 'Pendiente' o 'Vencido'
// (dinero que TODAVÍA no se cobró). Los pagos 'Pagado' NO se tocan: ese
// dinero ya cambió de manos al precio viejo, y reescribir monto_final ahí
// falsearía el registro histórico de lo que la familia realmente entregó.
// Para esos casos el script solo IMPRIME un reporte informativo (cuánto se
// cobró de más/de menos ya), para que el coach decida manualmente si
// conversa con esas familias — no es algo que un script deba decidir solo.
//
// Sigue el mismo patrón que scripts/simular_club_nuevo_1anio.mjs:
// - carga .env.local con process.loadEnvFile
// - cliente Supabase con SERVICE_ROLE_KEY
// - const SIMULAR = true por defecto: NO escribe nada, solo imprime lo que haría
// - idempotente: una vez corregido un pago, en la siguiente corrida ya no
//   aparece como "a corregir" (el monto_base ya coincide con el del grupo)
// - antes de escribir, guarda un backup JSON con los valores viejos de cada
//   fila que va a modificar, para poder revertir si algo sale mal
//   (ver revertir_reconciliacion_pagos.mjs)
//
// IMPORTANTE: este script NUNCA debe correr con SIMULAR = false sin que un
// humano revise el resumen impreso primero. No cambia esta constante.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const SIMULAR = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BACKUP_PATH = path.join(__dirname, `backup_pagos_reconciliacion_precio_grupo.json`);
const FALLBACK_MONTO_BASE = 30.00; // mismo fallback que generarPagosMensuales para atletas sin grupo asignado

function calcularMontoCorrecto(pago, precioPorGrupoId) {
  const grupoId = pago.atletas?.grupo_id;
  if (!grupoId) return null; // sin grupo asignado: no hay un precio "correcto" mejor que el que ya tiene, no se toca
  const precio = precioPorGrupoId[grupoId];
  if (precio == null) return null; // grupo referenciado no existe/fue borrado: no se toca, defensivo
  return precio;
}

async function run() {
  console.log('=== Reconciliación de pagos: monto_base hardcodeado -> precio real del grupo ===');
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no escribe nada)' : '🚀 REAL (escribe datos de verdad)'}\n`);

  // 1. Traer TODOS los pagos de tipo Mensualidad (Pendiente/Vencido a corregir,
  //    Pagado solo para el reporte informativo) con el grupo real del atleta.
  const { data: pagos, error: errPagos } = await supabase
    .from('pagos')
    .select(`
      id, atleta_id, mes, anio, monto_base, descuento_pct, monto_final, estado, notas,
      atletas!inner (
        id, grupo_id, grupo_nombre,
        usuarios!inner!atletas_usuario_id_fkey ( nombre, cedula, club )
      )
    `)
    .eq('tipo', 'Mensualidad');

  if (errPagos) {
    console.error(`❌ Error trayendo pagos: ${errPagos.message}`);
    process.exit(1);
  }
  if (!pagos || pagos.length === 0) {
    console.log('No hay pagos de tipo Mensualidad en la base. Nada que reconciliar.');
    return;
  }

  // 2. Precio real por grupo (grupo_id -> precio_mensual), una sola consulta.
  const grupoIds = [...new Set(pagos.map(p => p.atletas?.grupo_id).filter(Boolean))];
  let precioPorGrupoId = {};
  if (grupoIds.length > 0) {
    const { data: grupos, error: errGrupos } = await supabase
      .from('grupos_entrenamiento')
      .select('id, nombre, precio_mensual')
      .in('id', grupoIds);
    if (errGrupos) { console.error(`❌ Error trayendo grupos: ${errGrupos.message}`); process.exit(1); }
    precioPorGrupoId = Object.fromEntries((grupos || []).map(g => [g.id, g.precio_mensual]));
  }

  // 3. Separar en: a corregir (Pendiente/Vencido con monto_base incorrecto),
  //    ya cobrado con precio incorrecto (Pagado, solo informativo, no se toca),
  //    sin cambios (ya correctos o sin grupo conocido).
  const aCorregir = [];
  const yaCobradoIncorrecto = [];

  for (const pago of pagos) {
    const montoCorrecto = calcularMontoCorrecto(pago, precioPorGrupoId);
    if (montoCorrecto == null) continue; // sin info suficiente, no se toca
    if (montoCorrecto === pago.monto_base) continue; // ya está correcto

    const montoFinalCorrecto = Number((montoCorrecto * (1 - (pago.descuento_pct || 0) / 100)).toFixed(2));
    const entry = {
      pago_id: pago.id,
      atleta_cedula: pago.atletas?.usuarios?.cedula,
      atleta_nombre: pago.atletas?.usuarios?.nombre,
      club: pago.atletas?.usuarios?.club,
      grupo: pago.atletas?.grupo_nombre,
      mes: pago.mes,
      anio: pago.anio,
      estado: pago.estado,
      monto_base_anterior: pago.monto_base,
      monto_final_anterior: pago.monto_final,
      monto_base_correcto: montoCorrecto,
      monto_final_correcto: montoFinalCorrecto,
      diferencia: Number((montoFinalCorrecto - pago.monto_final).toFixed(2)),
    };

    if (pago.estado === 'Pagado') {
      yaCobradoIncorrecto.push(entry);
    } else if (pago.estado === 'Pendiente' || pago.estado === 'Vencido') {
      aCorregir.push(entry);
    }
    // 'Becado' nunca llega aquí con monto relevante (no se cobra), se ignora aunque el monto_base difiera.
  }

  // ============================
  // REPORTE: ya cobrado a precio incorrecto (informativo, NUNCA se modifica)
  // ============================
  console.log(`── Pagos YA COBRADOS a precio incorrecto (no se tocan, solo informativo) ──`);
  if (yaCobradoIncorrecto.length === 0) {
    console.log('Ninguno.\n');
  } else {
    const totalDiferencia = yaCobradoIncorrecto.reduce((s, e) => s + e.diferencia, 0);
    console.log(`${yaCobradoIncorrecto.length} pagos ya cobrados con el monto viejo. Diferencia acumulada (lo que deberían haber pagado - lo que pagaron): $${totalDiferencia.toFixed(2)}`);
    yaCobradoIncorrecto.slice(0, 10).forEach(e => {
      console.log(`  ${e.atleta_nombre} (${e.atleta_cedula}) · ${e.grupo} · ${e.mes}/${e.anio} · pagó $${e.monto_final_anterior} · debería $${e.monto_final_correcto} · dif $${e.diferencia}`);
    });
    if (yaCobradoIncorrecto.length > 10) console.log(`  ... (+${yaCobradoIncorrecto.length - 10} más)`);
    console.log('⚠️  Esto es solo un reporte — decide manualmente si conversas con estas familias (cobro adicional o reembolso). El script NO los modifica.\n');
  }

  // ============================
  // A CORREGIR: Pendiente/Vencido con monto_base equivocado
  // ============================
  console.log(`── Pagos PENDIENTES/VENCIDOS a corregir (dinero aún no cobrado) ──`);
  if (aCorregir.length === 0) {
    console.log('Ninguno. Nada que reconciliar en pagos aún no cobrados.\n');
  } else {
    const totalDiferencia = aCorregir.reduce((s, e) => s + e.diferencia, 0);
    const porGrupo = {};
    aCorregir.forEach(e => {
      porGrupo[e.grupo] ??= { count: 0, diferencia: 0 };
      porGrupo[e.grupo].count++;
      porGrupo[e.grupo].diferencia += e.diferencia;
    });

    console.log(`${aCorregir.length} pagos a corregir. Diferencia neta en lo que se cobrará: $${totalDiferencia.toFixed(2)}`);
    Object.entries(porGrupo).forEach(([grupo, v]) => {
      console.log(`  Grupo ${grupo}: ${v.count} pagos, diferencia $${v.diferencia.toFixed(2)}`);
    });
    aCorregir.slice(0, 10).forEach(e => {
      console.log(`  ${e.atleta_nombre} (${e.atleta_cedula}) · ${e.grupo} · ${e.mes}/${e.anio} · ${e.estado} · $${e.monto_final_anterior} -> $${e.monto_final_correcto}`);
    });
    if (aCorregir.length > 10) console.log(`  ... (+${aCorregir.length - 10} más)`);
  }

  if (aCorregir.length === 0) {
    console.log('\nNo hay nada que escribir. Fin.');
    return;
  }

  if (SIMULAR) {
    console.log('\nNada se escribió. Para ejecutar de verdad, edita este archivo y cambia "const SIMULAR = true" a "const SIMULAR = false".');
    console.log('(Revisa el resumen de arriba con el club/coach antes de hacerlo — este dry-run es para revisión humana.)');
    return;
  }

  // ============================
  // BACKUP antes de escribir (para poder revertir con revertir_reconciliacion_pagos.mjs)
  // ============================
  fs.writeFileSync(BACKUP_PATH, JSON.stringify({
    generado_en: new Date().toISOString(),
    pagos: aCorregir.map(e => ({
      pago_id: e.pago_id,
      monto_base_anterior: e.monto_base_anterior,
      monto_final_anterior: e.monto_final_anterior,
    })),
  }, null, 2), 'utf8');
  console.log(`\n💾 Backup de valores anteriores escrito en: ${BACKUP_PATH}`);

  // ============================
  // UPDATE real, uno por uno (montos distintos por fila, no hay un solo UPDATE bulk posible)
  // ============================
  const hoyISO = new Date().toISOString().split('T')[0];
  let corregidos = 0;
  for (const e of aCorregir) {
    const notaReconciliacion = `Reconciliado ${hoyISO}: monto_base $${e.monto_base_anterior} -> $${e.monto_base_correcto} (precio real de ${e.grupo})`;
    const { error } = await supabase
      .from('pagos')
      .update({
        monto_base: e.monto_base_correcto,
        monto_final: e.monto_final_correcto,
        notas: e.notas ? `${e.notas} | ${notaReconciliacion}` : notaReconciliacion,
      })
      .eq('id', e.pago_id);
    if (error) throw new Error(`Update pago ${e.pago_id} falló: ${error.message}`);
    corregidos++;
  }

  console.log(`\n✅ ${corregidos} pagos corregidos.`);
}

run().catch((err) => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
