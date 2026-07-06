// Simula el módulo de PAGOS para el club ficticio "DEMO Simulación 1 Año"
// (mismo club/atletas que scripts/simular_club_nuevo_1anio.mjs, commit 8fab675:
// coach DEMO-COACH-001, 3 grupos Sub-8/Sub-12/Sub-16 de 10 atletas cada uno,
// cédulas DEMO-ATL-001..030).
//
// Cubre:
// - 12 meses HISTÓRICOS (2025-07..2026-06, mismo rango que la simulación de
//   entrenamiento) con estado final ya resuelto (todo en el pasado real).
// - 6 meses de PROYECCIÓN probable (2026-07..2026-12) con probabilidades por
//   perfil de pago, no un resultado inventado con certeza.
//
// 100% LOCAL / OFFLINE: no usa Supabase, no lee ni escribe nada en la base de
// datos real (no requiere .env). Reconstruye la población de atletas en
// memoria y aplica la lógica de negocio REAL de src/api/pagosService.js
// (generarPagosMensuales / marcarPagado / actualizarEstadoVencidos) tal como
// está escrita hoy — incluyendo su comportamiento literal (p.ej. monto_base
// hardcodeado a 30.00 sin importar el precio_mensual del grupo) — para que la
// auditoría encuentre problemas reales del código, no una versión idealizada.
//
// Salida: imprime un resumen agregado y escribe un JSON detallado (histórico +
// proyección por atleta) para que agentes de auditoría lo analicen.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = process.argv[2] || path.join(__dirname, 'out_simulacion_pagos_demo.json');

// "Hoy" fijo (ver CLAUDE.md/contexto del proyecto: 2026-07-05) — todo lo
// histórico queda antes de esta fecha, la proyección empieza en este mes.
const HOY = new Date('2026-07-05T12:00:00Z');

// --- PRNG determinista (mismo LCG que simular_club_nuevo_1anio.mjs, seed
// independiente porque corre en un proceso separado) — reproducible entre
// corridas para que el dry-run sea el mismo siempre. ---
let seed = 42;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

// --- Grupos: mismos nombres y precio_mensual que GRUPOS_DEF en
// simular_club_nuevo_1anio.mjs (25/30/35 según categoría). ---
const GRUPOS_DEF = [
  { nombre: 'Sub-8', precio_mensual: 25 },
  { nombre: 'Sub-12', precio_mensual: 30 },
  { nombre: 'Sub-16', precio_mensual: 35 },
];
const ATLETAS_POR_GRUPO = 10;

// --- Perfiles de comportamiento de pago (distribución realista de un club) ---
// puntual:  paga antes o el mismo día de vencimiento, todos los meses.
// ocasional: paga con 5-20 días de atraso, pero SIEMPRE termina pagando.
// moroso:   paga muy tarde o no paga; una fracción de sus meses queda
//           Vencido sin resolver (nadie lo marcó Pagado nunca).
// becado:   es_becado=true — nunca genera cobro real (estado 'Becado').
const PERFILES_PONDERADOS = [
  ...Array(55).fill('puntual'),
  ...Array(22).fill('ocasional'),
  ...Array(13).fill('moroso'),
  ...Array(10).fill('becado'),
];

function construirAtletas() {
  const atletas = [];
  GRUPOS_DEF.forEach((g, gi) => {
    for (let i = 0; i < ATLETAS_POR_GRUPO; i++) {
      const idxGlobal = gi * ATLETAS_POR_GRUPO + i + 1;
      const cedula = `DEMO-ATL-${String(idxGlobal).padStart(3, '0')}`;
      const perfil = pick(PERFILES_PONDERADOS);
      const es_becado = perfil === 'becado';
      // ~15% de los NO becados tiene descuento por hermanos/convenio (10-20%),
      // igual que descuento_pct en atletas (usado por upsertPago/generarPagosMensuales).
      const descuento_pct = (!es_becado && rand() < 0.15) ? pick([10, 15, 20]) : 0;
      atletas.push({
        atleta_id: cedula, // dry-run: no hay FK real, la cédula hace de id
        grupo: g.nombre,
        precio_mensual_grupo: g.precio_mensual,
        perfil,
        es_becado,
        descuento_pct,
      });
    }
  });
  return atletas;
}

function secuenciaMeses(anioInicio, mesInicio, cantidad) {
  const out = [];
  let anio = anioInicio, mes = mesInicio;
  for (let i = 0; i < cantidad; i++) {
    out.push({ mes, anio });
    mes++;
    if (mes > 12) { mes = 1; anio++; }
  }
  return out;
}

const MESES_HISTORICOS = secuenciaMeses(2025, 7, 12); // 2025-07 .. 2026-06
const MESES_PROYECCION = secuenciaMeses(2026, 7, 6);  // 2026-07 .. 2026-12

function fechaConDia(anio, mes, dia) {
  const diaClamp = Math.min(dia, 28); // evita días inválidos en meses cortos
  return `${anio}-${String(mes).padStart(2, '0')}-${String(diaClamp).padStart(2, '0')}`;
}

// ===================================================================
// Reproduce generarPagosMensuales EXACTAMENTE (pagosService.js líneas 72-91):
// monto_base hardcodeado a 30.00 para TODOS los atletas sin importar el
// precio_mensual real del grupo. Este es el comportamiento REAL del código
// hoy — se simula tal cual, y se anota por separado cuál "debería" ser el
// monto según el grupo, para que la auditoría cuantifique el impacto.
// ===================================================================
const MONTO_BASE_HARDCODEADO = 30.00;

function generarPagoMes(atleta, mes, anio) {
  const monto_base = MONTO_BASE_HARDCODEADO;
  const monto_final = monto_base * (1 - (atleta.descuento_pct || 0) / 100);
  return {
    atleta_id: atleta.atleta_id,
    grupo: atleta.grupo,
    tipo: 'Mensualidad',
    mes,
    anio,
    monto_base,
    monto_base_esperado_segun_grupo: atleta.precio_mensual_grupo, // NO existe en el código real — solo para auditoría
    descuento_pct: atleta.descuento_pct || 0,
    monto_final,
    fecha_vencimiento: `${anio}-${String(mes).padStart(2, '0')}-05`,
  };
}

// Resuelve el estado FINAL de un pago histórico (ya transcurrido por completo:
// generación → [actualizarEstadoVencidos en cada carga de pantalla] →
// marcarPagado si el coach lo marcó). Como todo el mes ya pasó, el estado
// queda fijo tal como habría quedado en la base real a la fecha de HOY.
function resolverPagoHistorico(pago, atleta) {
  if (atleta.es_becado) {
    return { ...pago, estado: 'Becado', fecha_pago: null, forma_pago: null };
  }
  if (atleta.perfil === 'puntual') {
    return {
      ...pago,
      estado: 'Pagado',
      fecha_pago: fechaConDia(pago.anio, pago.mes, randInt(1, 5)),
      forma_pago: pick(['Efectivo', 'Transferencia']),
    };
  }
  if (atleta.perfil === 'ocasional') {
    return {
      ...pago,
      estado: 'Pagado',
      fecha_pago: fechaConDia(pago.anio, pago.mes, randInt(8, 25)),
      forma_pago: pick(['Efectivo', 'Transferencia', 'Otro']),
    };
  }
  // moroso: una parte paga tardísimo, el resto queda Vencido sin resolver
  // (nadie ejecutó marcarPagado nunca sobre esa fila).
  if (rand() < 0.55) {
    return {
      ...pago,
      estado: 'Pagado',
      fecha_pago: fechaConDia(pago.anio, pago.mes, randInt(20, 28)),
      forma_pago: pick(['Efectivo', 'Otro']),
    };
  }
  return { ...pago, estado: 'Vencido', fecha_pago: null, forma_pago: null };
}

// Proyecta un mes FUTURO como probabilidad, no como certeza: usa la tasa de
// pago a tiempo / pago eventual observada en el histórico de ESE MISMO
// perfil (no un número inventado) y sortea una realización probable con el
// mismo PRNG determinista, dejando explícitas las probabilidades usadas
// para que la auditoría pueda juzgar la metodología, no solo el resultado.
function proyectarPagoMes(pago, atleta, probsPorPerfil) {
  if (atleta.es_becado) {
    return {
      ...pago,
      estado_proyectado: 'Becado',
      probabilidad_pago_a_tiempo: null,
      probabilidad_pago_eventual: null,
      monto_esperado_recaudar: 0,
    };
  }
  const { pATiempo, pEventual } = probsPorPerfil[atleta.perfil];
  const r = rand();
  let estado_proyectado;
  if (r < pATiempo) estado_proyectado = 'Pagado (a tiempo, proyectado)';
  else if (r < pEventual) estado_proyectado = 'Pagado (tarde, proyectado)';
  else estado_proyectado = 'Vencido (proyectado, riesgo de impago)';

  const seCobra = estado_proyectado !== 'Vencido (proyectado, riesgo de impago)';
  return {
    ...pago,
    estado_proyectado,
    probabilidad_pago_a_tiempo: pATiempo,
    probabilidad_pago_eventual: pEventual,
    monto_esperado_recaudar: seCobra ? pago.monto_final : 0,
  };
}

// Calcula, por perfil, la tasa observada en el histórico ya resuelto —
// así la proyección futura se basa en el comportamiento simulado real de
// cada perfil en vez de constantes arbitrarias.
function calcularProbabilidadesPorPerfil(historicoPorAtleta, atletas) {
  const acumulado = {}; // perfil -> {aTiempo, eventual, total}
  for (const atleta of atletas) {
    if (atleta.es_becado) continue;
    if (!acumulado[atleta.perfil]) acumulado[atleta.perfil] = { aTiempo: 0, eventual: 0, total: 0 };
    for (const pago of historicoPorAtleta[atleta.atleta_id]) {
      acumulado[atleta.perfil].total++;
      const diaVenc = 5;
      const diaPago = pago.fecha_pago ? Number(pago.fecha_pago.split('-')[2]) : null;
      if (diaPago !== null && diaPago <= diaVenc) acumulado[atleta.perfil].aTiempo++;
      if (pago.estado === 'Pagado') acumulado[atleta.perfil].eventual++;
    }
  }
  const probs = {};
  for (const perfil of Object.keys(acumulado)) {
    const a = acumulado[perfil];
    probs[perfil] = {
      pATiempo: a.total ? a.aTiempo / a.total : 0,
      pEventual: a.total ? a.eventual / a.total : 0,
    };
  }
  return probs;
}

// ===================================================================
// RUN PRINCIPAL
// ===================================================================
function run() {
  console.log('=== Simulación del módulo de PAGOS — "DEMO Simulación 1 Año" ===');
  console.log('Modo: 100% LOCAL/OFFLINE — no toca Supabase, no requiere .env\n');

  const atletas = construirAtletas();

  // ---- Histórico ----
  const historicoPorAtleta = {};
  const idsVistos = new Set(); // valida constraint UNIQUE(atleta_id,mes,anio,tipo)
  let violacionesUnicidad = 0;

  for (const atleta of atletas) {
    historicoPorAtleta[atleta.atleta_id] = [];
    for (const { mes, anio } of MESES_HISTORICOS) {
      const clave = `${atleta.atleta_id}|${mes}|${anio}|Mensualidad`;
      if (idsVistos.has(clave)) violacionesUnicidad++;
      idsVistos.add(clave);

      const pagoBase = generarPagoMes(atleta, mes, anio);
      const pagoResuelto = resolverPagoHistorico(pagoBase, atleta);
      historicoPorAtleta[atleta.atleta_id].push(pagoResuelto);
    }
  }

  // ---- Proyección futura (probabilidades derivadas del histórico simulado) ----
  const probsPorPerfil = calcularProbabilidadesPorPerfil(historicoPorAtleta, atletas);
  const proyeccionPorAtleta = {};
  for (const atleta of atletas) {
    proyeccionPorAtleta[atleta.atleta_id] = [];
    for (const { mes, anio } of MESES_PROYECCION) {
      const pagoBase = generarPagoMes(atleta, mes, anio);
      const pagoProyectado = proyectarPagoMes(pagoBase, atleta, probsPorPerfil);
      proyeccionPorAtleta[atleta.atleta_id].push(pagoProyectado);
    }
  }

  // ---- Agregados históricos (mismas fórmulas que AdminPagos.jsx) ----
  let recaudadoHistoricoReal = 0;
  let recaudadoHistoricoSiPrecioCorrecto = 0;
  let porCobrarHistorico = 0;
  let mesesVencidosSinResolver = 0;
  let mesesPagadosTotal = 0;
  let mesesBecadoTotal = 0;
  let mesesNoBecadoTotal = 0;

  for (const atleta of atletas) {
    for (const pago of historicoPorAtleta[atleta.atleta_id]) {
      if (atleta.es_becado) { mesesBecadoTotal++; continue; }
      mesesNoBecadoTotal++;
      if (pago.estado === 'Pagado') {
        mesesPagadosTotal++;
        recaudadoHistoricoReal += pago.monto_final;
        recaudadoHistoricoSiPrecioCorrecto += pago.monto_base_esperado_segun_grupo * (1 - pago.descuento_pct / 100);
      } else if (pago.estado === 'Vencido') {
        mesesVencidosSinResolver++;
        porCobrarHistorico += pago.monto_final;
      }
    }
  }

  // ---- Agregados de proyección ----
  let recaudacionEsperadaProyeccion = 0;
  let recaudacionEsperadaProyeccionSiPrecioCorrecto = 0;
  let mesesEnRiesgoProyeccion = 0;
  for (const atleta of atletas) {
    for (const pago of proyeccionPorAtleta[atleta.atleta_id]) {
      if (atleta.es_becado) continue;
      recaudacionEsperadaProyeccion += pago.monto_esperado_recaudar;
      recaudacionEsperadaProyeccionSiPrecioCorrecto +=
        (pago.monto_esperado_recaudar > 0
          ? pago.monto_base_esperado_segun_grupo * (1 - pago.descuento_pct / 100)
          : 0);
      if (pago.estado_proyectado.startsWith('Vencido')) mesesEnRiesgoProyeccion++;
    }
  }

  const resumen = {
    club: 'DEMO Simulación 1 Año',
    coach_cedula: 'DEMO-COACH-001',
    atletas_total: atletas.length,
    becados: atletas.filter(a => a.es_becado).length,
    con_descuento: atletas.filter(a => !a.es_becado && a.descuento_pct > 0).length,
    rango_historico: `${MESES_HISTORICOS[0].anio}-${String(MESES_HISTORICOS[0].mes).padStart(2, '0')} .. ${MESES_HISTORICOS[11].anio}-${String(MESES_HISTORICOS[11].mes).padStart(2, '0')}`,
    rango_proyeccion: `${MESES_PROYECCION[0].anio}-${String(MESES_PROYECCION[0].mes).padStart(2, '0')} .. ${MESES_PROYECCION[5].anio}-${String(MESES_PROYECCION[5].mes).padStart(2, '0')}`,
    violaciones_unicidad_atleta_mes_anio_tipo: violacionesUnicidad,
    historico: {
      meses_no_becado_total: mesesNoBecadoTotal,
      meses_becado_total: mesesBecadoTotal,
      meses_pagados: mesesPagadosTotal,
      meses_vencidos_sin_resolver: mesesVencidosSinResolver,
      tasa_morosidad_no_resuelta_pct: Number(((mesesVencidosSinResolver / mesesNoBecadoTotal) * 100).toFixed(1)),
      recaudado_real_monto_base_hardcodeado_30: Number(recaudadoHistoricoReal.toFixed(2)),
      recaudado_si_precio_correcto_por_grupo: Number(recaudadoHistoricoSiPrecioCorrecto.toFixed(2)),
      diferencia_por_bug_monto_base_hardcodeado: Number((recaudadoHistoricoSiPrecioCorrecto - recaudadoHistoricoReal).toFixed(2)),
      por_cobrar_vencidos_sin_resolver: Number(porCobrarHistorico.toFixed(2)),
    },
    proyeccion: {
      probabilidades_por_perfil_derivadas_del_historico: probsPorPerfil,
      recaudacion_esperada_monto_base_hardcodeado_30: Number(recaudacionEsperadaProyeccion.toFixed(2)),
      recaudacion_esperada_si_precio_correcto_por_grupo: Number(recaudacionEsperadaProyeccionSiPrecioCorrecto.toFixed(2)),
      meses_atleta_en_riesgo_de_impago: mesesEnRiesgoProyeccion,
    },
  };

  console.log('── Resumen histórico (12 meses, 2025-07..2026-06) ──');
  console.log(`Meses no-becado simulados: ${mesesNoBecadoTotal} · Pagados: ${mesesPagadosTotal} · Vencidos sin resolver: ${mesesVencidosSinResolver} (${resumen.historico.tasa_morosidad_no_resuelta_pct}%)`);
  console.log(`Recaudado real (monto_base=30 hardcodeado): $${resumen.historico.recaudado_real_monto_base_hardcodeado_30}`);
  console.log(`Recaudado SI el precio por grupo fuera correcto: $${resumen.historico.recaudado_si_precio_correcto_por_grupo}`);
  console.log(`⚠️  Diferencia atribuible al bug de monto_base hardcodeado: $${resumen.historico.diferencia_por_bug_monto_base_hardcodeado}`);
  console.log(`Por cobrar (vencidos sin resolver): $${resumen.historico.por_cobrar_vencidos_sin_resolver}\n`);

  console.log('── Proyección probable (6 meses, 2026-07..2026-12) ──');
  console.log('Probabilidades por perfil (derivadas del histórico simulado):', probsPorPerfil);
  console.log(`Recaudación esperada (monto_base=30 hardcodeado): $${resumen.proyeccion.recaudacion_esperada_monto_base_hardcodeado_30}`);
  console.log(`Recaudación esperada SI el precio por grupo fuera correcto: $${resumen.proyeccion.recaudacion_esperada_si_precio_correcto_por_grupo}`);
  console.log(`Meses-atleta en riesgo de impago proyectados: ${mesesEnRiesgoProyeccion}\n`);

  if (violacionesUnicidad > 0) {
    console.log(`❌ Se detectaron ${violacionesUnicidad} violaciones de la constraint UNIQUE(atleta_id,mes,anio,tipo)`);
  } else {
    console.log('✅ Sin violaciones de la constraint UNIQUE(atleta_id,mes,anio,tipo)');
  }

  const salida = {
    resumen,
    atletas,
    historico_por_atleta: historicoPorAtleta,
    proyeccion_por_atleta: proyeccionPorAtleta,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(salida, null, 2), 'utf8');
  console.log(`\nJSON detallado escrito en: ${OUT_PATH}`);
}

run();
