// Siembra un club de prueba COMPACTO ("DEMO QA Compacto") pensado para
// navegación/QA rápida: snapshot actual (no 1 año de histórico), ~12 atletas
// en 2 grupos, 1 cuenta logueable por rol (superadmin/owner/coach/atleta/padre)
// y datos mínimos coherentes para que los portales rindan (radar/overall,
// asistencia reciente, algunas misiones con XP, pagos del mes, 1 evento).
//
// Reusa la lógica pura de packages/analytics-core (no reinventa baremos/XP).
// Dry-run por defecto. Para escribir: SEED_REAL=1 node scripts/sembrar_club_qa_compacto.mjs
// Idempotente: reejecutar no duplica (chequea existencia antes de insertar).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { BAREMOS, calcularOverall } from '../../packages/analytics-core/baremos.js';
import { calcularEdad, calcularCategoriaFEB } from '../../packages/analytics-core/categoriaFEB.js';
import { calcularXPMision } from '../../packages/analytics-core/recomendaciones.js';

const EJECUTAR = process.env.SEED_REAL === '1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const CLUB = 'DEMO QA Compacto';
const HOY = new Date('2026-07-13T12:00:00Z');
const emailInterno = (cedula) => `${cedula.toLowerCase()}@sinacceso.blackgoldapp.internal`;

let seed = 777;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max, dec = 2) { const v = rand() * (max - min) + min; const f = 10 ** dec; return Math.round(v * f) / f; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; }
function toISODate(date) { return date.toISOString().split('T')[0]; }

// Nombres de grupo con prefijo 'QAC ' porque grupos_entrenamiento.nombre tiene
// UNIQUE GLOBAL (no por club) → no pueden colisionar con los del club rico.
const GRUPOS_DEF = [
  { nombre: 'QAC Sub-10', bucket: 'Sub12', edadMin: 9, edadMax: 10, horario: 'Lun y Mié 15:00-16:00', dias_semana: ['Lunes', 'Miércoles'], hora_inicio: '15:00', hora_fin: '16:00', precio_mensual: 28, precio_sesion_ind: 9 },
  { nombre: 'QAC Sub-16', bucket: 'Sub18', edadMin: 15, edadMax: 16, horario: 'Mar y Jue 17:00-18:30', dias_semana: ['Martes', 'Jueves'], hora_inicio: '17:00', hora_fin: '18:30', precio_mensual: 34, precio_sesion_ind: 12 },
];
const ATLETAS_POR_GRUPO = 6;
const NIVELES = ['Micro', 'Desarrollo', 'Desarrollo', 'Desarrollo', 'Elite', 'Desarrollo'];
const POSICIONES = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];
const NOMBRES = ['Mateo', 'Sofía', 'Lucas', 'Valentina', 'Samuel', 'Isabella', 'Emilio', 'Camila', 'Daniel', 'Martina', 'Iker', 'Paula'];
const APELLIDOS = ['Vera', 'Rosero', 'Ortiz', 'Jiménez', 'Chávez', 'Andrade', 'Salazar', 'Mora'];
const CLAVES = ['cmj_salto', 'pushups_30s', 'sentadilla_rel', 'sit_reach', 'tiro_libre', 'zigzag_balon', 'eficiencia_tactica', 'resiliencia'];
const PUNT_TIER = { poor: 15, below_avg: 35, average: 55, above_avg: 75, excellent: 95 };

function tierDe(clave, valor, bucket) {
  const b = BAREMOS[clave]; const th = b.thresholds[bucket]; if (!th) return null;
  const [t1, t2, t3, t4] = th;
  if (b.tipo === 'mas_es_mejor') return valor > t4 ? 'excellent' : valor > t3 ? 'above_avg' : valor > t2 ? 'average' : valor > t1 ? 'below_avg' : 'poor';
  return valor <= t1 ? 'excellent' : valor <= t2 ? 'above_avg' : valor <= t3 ? 'average' : valor <= t4 ? 'below_avg' : 'poor';
}
function valorMedio(clave, bucket) {
  const th = BAREMOS[clave]?.thresholds?.[bucket]; if (!th) return null;
  const [t1, t2, t3] = th; return BAREMOS[clave].tipo === 'menos_es_mejor' ? randFloat(t2, t3) : randFloat(t2, t3);
}

async function ensureUsuarioConAuth({ cedula, nombre, rol, fecha_nacimiento = null, genero = null, conAuth = true }) {
  const { data: ex } = await supabase.from('usuarios').select('id, auth_user_id').eq('cedula', cedula).maybeSingle();
  if (!EJECUTAR) { console.log(`  · usuario${conAuth ? '+auth' : ''} [${rol}] ${cedula}` + (ex ? ' (ya existe)' : '')); return { id: ex?.id || null }; }
  let id = ex?.id;
  if (!id) {
    const row = { cedula, nombre, correo: null, telefono: null, rol, club: CLUB };
    if (fecha_nacimiento) { row.fecha_nacimiento = fecha_nacimiento; row.genero = genero || 'Masculino'; }
    const { data, error } = await supabase.from('usuarios').insert(row).select('id').single();
    if (error) throw new Error(`usuarios ${cedula}: ${error.message}`); id = data.id;
  }
  if (conAuth && !ex?.auth_user_id) {
    const { data: a, error: e } = await supabase.auth.admin.createUser({ email: emailInterno(cedula), password: cedula, email_confirm: true, user_metadata: { usuario_id: id, demo: true } });
    if (!e && a?.user) await supabase.from('usuarios').update({ auth_user_id: a.user.id }).eq('id', id);
    else console.warn(`  ⚠️  auth ${cedula}: ${e?.message || 'sin user'}`);
  }
  return { id };
}

async function run() {
  console.log(`=== Club de prueba COMPACTO: "${CLUB}" ===`);
  console.log(`Modo: ${EJECUTAR ? '🚀 REAL (escribe)' : '🔍 DRY-RUN (no escribe)'}\n`);

  // 1. Staff logueable
  console.log('── 1. Staff ──');
  const superadmin = await ensureUsuarioConAuth({ cedula: 'QAC-SUPERADMIN', nombre: 'QA Compacto Superadmin', rol: 'superadmin' });
  const owner = await ensureUsuarioConAuth({ cedula: 'QAC-OWNER', nombre: 'QA Compacto Dueño', rol: 'owner' });
  const coach = await ensureUsuarioConAuth({ cedula: 'QAC-COACH', nombre: 'QA Compacto Coach', rol: 'coach' });

  // 2. Grupos
  console.log('\n── 2. Grupos ──');
  const gruposIds = {};
  for (const g of GRUPOS_DEF) {
    if (!EJECUTAR) { console.log(`  · grupo ${g.nombre} (${g.horario})`); continue; }
    const { data: ex } = await supabase.from('grupos_entrenamiento').select('id').eq('nombre', g.nombre).eq('club', CLUB).maybeSingle();
    if (ex) { gruposIds[g.nombre] = ex.id; continue; }
    const { data, error } = await supabase.from('grupos_entrenamiento').insert({ nombre: g.nombre, horario: g.horario, descripcion: `Grupo ${g.nombre} — QA compacto`, club: CLUB, precio_mensual: g.precio_mensual, precio_sesion_ind: g.precio_sesion_ind, hora_inicio: g.hora_inicio, hora_fin: g.hora_fin, dias_semana: g.dias_semana }).select('id').single();
    if (error) throw new Error(`grupo ${g.nombre}: ${error.message}`); gruposIds[g.nombre] = data.id;
  }

  // 3. Atletas (12) — el primero es la cuenta logueable + su padre
  console.log('\n── 3. Atletas ──');
  const atletas = [];
  let idx = 0;
  for (const g of GRUPOS_DEF) {
    for (let i = 0; i < ATLETAS_POR_GRUPO; i++) {
      const nombre = `${pick(NOMBRES)} ${pick(APELLIDOS)}`;
      const edad = randInt(g.edadMin, g.edadMax);
      const fnac = `${HOY.getFullYear() - edad}-${String(HOY.getMonth() + 1).padStart(2, '0')}-${String(HOY.getDate()).padStart(2, '0')}`;
      const esCuenta = idx === 0; // primer atleta = logueable
      const cedula = esCuenta ? 'QAC-ATLETA' : `QAC-ATL-${String(idx + 1).padStart(2, '0')}`;
      atletas.push({ cedula, nombre, fnac, edad, categoriaFEB: calcularCategoriaFEB(fnac), genero: pick(['Masculino', 'Femenino']), posicion: pick(POSICIONES), nivel: NIVELES[i % NIVELES.length], grupo: g.nombre, bucket: g.bucket, esCuenta });
      idx++;
    }
  }

  const atletaIdPorCedula = {};
  for (const a of atletas) {
    const usu = await ensureUsuarioConAuth({ cedula: a.cedula, nombre: a.nombre, rol: 'atleta', fecha_nacimiento: a.fnac, genero: a.genero, conAuth: a.esCuenta });
    if (!EJECUTAR) { if (a.esCuenta) console.log(`     (cuenta atleta logueable: ${a.cedula})`); continue; }
    // fila atletas
    const { data: exAt } = await supabase.from('atletas').select('id').eq('usuario_id', usu.id).maybeSingle();
    let atletaId = exAt?.id;
    if (!atletaId) {
      const { data, error } = await supabase.from('atletas').insert({ usuario_id: usu.id, edad: a.edad, posicion: a.posicion, nivel_desarrollo: a.nivel, grupo_id: gruposIds[a.grupo], grupo_nombre: a.grupo, fecha_alta: toISODate(addMonths(HOY, -randInt(0, 8))), estado_membresia: 'activo' }).select('id').single();
      if (error) throw new Error(`atletas ${a.cedula}: ${error.message}`); atletaId = data.id;
    }
    atletaIdPorCedula[a.cedula] = atletaId;
    // rol_membresia explícito (v38): el DEFAULT es 'adicional', así que sin esto
    // el atleta quedaría sin grupo básico — el que factura su mensualidad.
    const { data: exVinc } = await supabase.from('atleta_grupo').select('atleta_id').eq('atleta_id', atletaId).eq('grupo_id', gruposIds[a.grupo]).maybeSingle();
    if (!exVinc) await supabase.from('atleta_grupo').insert({ atleta_id: atletaId, grupo_id: gruposIds[a.grupo], rol_membresia: 'basica' });
  }
  console.log(`Atletas: ${atletas.length} (cuenta logueable: QAC-ATLETA)`);

  // 4. Padre logueable vinculado al atleta cuenta
  console.log('\n── 4. Padre ──');
  const padre = await ensureUsuarioConAuth({ cedula: 'QAC-PADRE', nombre: 'QA Compacto Representante', rol: 'padre' });
  if (EJECUTAR && padre.id && atletaIdPorCedula['QAC-ATLETA']) {
    const { data: v } = await supabase.from('padres_atletas').select('padre_id').eq('padre_id', padre.id).eq('atleta_id', atletaIdPorCedula['QAC-ATLETA']).maybeSingle();
    if (!v) await supabase.from('padres_atletas').insert({ padre_id: padre.id, atleta_id: atletaIdPorCedula['QAC-ATLETA'], es_rep_pagos: true });
  }

  // 5. Evaluación reciente (1 batería, hace ~10 días) + overall/rango
  console.log('\n── 5. Evaluación reciente + overall ──');
  if (EJECUTAR) {
    const fechaEval = addDays(HOY, -10).toISOString();
    for (const a of atletas) {
      const atletaId = atletaIdPorCedula[a.cedula];
      const { data: exEval } = await supabase.from('evaluaciones_pruebas').select('id').eq('atleta_id', atletaId).limit(1);
      if (exEval && exEval.length) continue; // idempotente: ya tiene batería
      const filas = [];
      for (const clave of CLAVES) {
        const b = BAREMOS[clave]; if (!b.thresholds[a.bucket]) continue;
        const valor = valorMedio(clave, a.bucket); const tier = tierDe(clave, valor, a.bucket);
        filas.push({ atleta_id: atletaId, prueba_tipo: b.label, pilar: b.pilar, sub_pilar: b.sub_pilar, tren: b.tren || null, lado: 'unico', valor_crudo: valor, unidad: b.unidad, puntuacion_normalizada: PUNT_TIER[tier], tier, registrado_por: coach.id, created_at: fechaEval, notas: 'Evaluación QA compacto' });
      }
      if (filas.length) {
        const { error } = await supabase.from('evaluaciones_pruebas').insert(filas);
        if (error) throw new Error(`evaluaciones ${a.cedula}: ${error.message}`);
        const { overall, rango } = calcularOverall(filas);
        await supabase.from('atletas').update({ overall_score: overall, rango: rango.id, rango_tier: rango.nombre }).eq('id', atletaId);
      }
    }
    console.log(`  Evaluaciones insertadas (1 batería × ${atletas.length} atletas).`);
  } else {
    console.log('  · 1 batería reciente (8 pruebas) por atleta + recálculo overall/rango');
  }

  // 6. Asistencia reciente (últimas 3 semanas)
  console.log('\n── 6. Asistencia reciente ──');
  if (EJECUTAR) {
    const idsAtl = Object.values(atletaIdPorCedula);
    const { data: exA } = await supabase.from('asistencia').select('id').in('atleta_id', idsAtl.length ? idsAtl : ['00000000-0000-0000-0000-000000000000']).limit(1);
    if (exA && exA.length) {
      console.log('  ⏭️  Asistencia ya sembrada; se omite (idempotente).');
    } else {
      const filas = [];
      for (const a of atletas) {
        const atletaId = atletaIdPorCedula[a.cedula];
        for (let d = 0; d < 21; d++) {
          if (rand() < 0.6) continue;
          filas.push({ atleta_id: atletaId, coach_id: coach.id, fecha: toISODate(addDays(HOY, -d)), estado: rand() < 0.85 ? 'Presente' : pick(['Ausente', 'Justificada']) });
        }
      }
      // dedup por (atleta,fecha) para no violar UNIQUE(atleta_id,fecha)
      const vistos = new Set(); const dedup = filas.filter((f) => { const k = `${f.atleta_id}|${f.fecha}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
      if (dedup.length) { const { error } = await supabase.from('asistencia').insert(dedup); if (error) throw new Error(`asistencia: ${error.message}`); }
      console.log(`  Asistencia: ${dedup.length} registros (últimas 3 semanas).`);
    }
  } else {
    console.log('  · ~2-3 registros/semana por atleta, últimas 3 semanas');
  }

  // 7. Misiones (catálogo) + progreso/XP para el atleta cuenta y algunos más
  console.log('\n── 7. Misiones + XP ──');
  if (EJECUTAR) {
    const catalogo = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed_catalogo_misiones.json'), 'utf8')).misiones;
    // Inserta un subconjunto pequeño del catálogo para este club (activa=true).
    const subset = catalogo.filter((m) => ['Sub12', 'Sub18'].includes(m.categoria_bucket)).slice(0, 16);
    const { data: exM } = await supabase.from('misiones').select('id, titulo, categoria_bucket').eq('condicion_trigger', 'qa_compacto');
    const yaM = new Set((exM || []).map((m) => `${m.titulo}|${m.categoria_bucket}`));
    const nuevas = subset.filter((m) => !yaM.has(`${m.titulo}|${m.categoria_bucket}`));
    let misionesIds = [...(exM || [])];
    if (nuevas.length) {
      const { data, error } = await supabase.from('misiones').insert(nuevas.map((m) => ({ titulo: m.titulo, descripcion: m.descripcion, justificacion: m.justificacion, pilar: m.pilar, nivel_objetivo: null, categoria_bucket: m.categoria_bucket, complejidad: m.complejidad, xp_recompensa: m.xp_recompensa, activa: true, is_ai_generated: true, condicion_trigger: 'qa_compacto', created_by: coach.id, autor_id: coach.id }))).select('id, titulo, categoria_bucket, xp_recompensa, nivel_objetivo');
      if (error) throw new Error(`misiones: ${error.message}`); misionesIds = misionesIds.concat(data);
    }
    // Asignar ~4 misiones al atleta cuenta + XP en xp_eventos.
    const misForBucket = (bucket) => misionesIds.filter((m) => m.categoria_bucket === bucket);
    const xpFilas = [];
    for (const a of atletas.filter((x) => x.esCuenta || rand() < 0.4)) {
      const atletaId = atletaIdPorCedula[a.cedula];
      const cand = misForBucket(a.bucket); if (!cand.length) continue;
      const n = a.esCuenta ? 4 : randInt(1, 2);
      for (let i = 0; i < n && i < cand.length; i++) {
        const m = cand[i]; const estado = pick(['aprobada', 'aprobada', 'pendiente', 'pendiente_aprobacion']);
        const completada = estado === 'aprobada' || estado === 'pendiente_aprobacion';
        const fAsig = addDays(HOY, -randInt(2, 20));
        const { data: exP } = await supabase.from('progreso_misiones').select('id').eq('atleta_id', atletaId).eq('mision_id', m.id).maybeSingle();
        if (!exP) {
          await supabase.from('progreso_misiones').insert({ atleta_id: atletaId, mision_id: m.id, completada, fecha_completada: completada ? addDays(fAsig, 3).toISOString() : null, estado, asignado_por: coach.id, tipo_asignacion: 'individual', fecha_asignacion: fAsig.toISOString(), origen: 'coach', sub_pilar_objetivo: m.pilar || null });
        }
        if (estado === 'aprobada') {
          const xp = calcularXPMision({ xp_recompensa: m.xp_recompensa, nivel_objetivo: m.nivel_objetivo || null }, { nivel_desarrollo: a.nivel });
          xpFilas.push({ atleta_id: atletaId, coach_id: coach.id, delta: xp, motivo: 'Misión aprobada', origen: 'qa_compacto', created_at: addDays(fAsig, 3).toISOString() });
        }
      }
      // XP reciente para racha del atleta cuenta
      if (a.esCuenta) for (let d = 0; d < 8; d++) if (rand() > 0.4) xpFilas.push({ atleta_id: atletaId, coach_id: coach.id, delta: randInt(15, 40), motivo: 'Evaluación Modo Cancha', origen: 'qa_compacto', created_at: addDays(HOY, -d).toISOString() });
    }
    const { data: yaXp } = await supabase.from('xp_eventos').select('id').eq('origen', 'qa_compacto').limit(1);
    if ((!yaXp || !yaXp.length) && xpFilas.length) { const { error } = await supabase.from('xp_eventos').insert(xpFilas); if (error) throw new Error(`xp_eventos: ${error.message}`); }
    console.log(`  Misiones asignadas + ${xpFilas.length} eventos de XP.`);
  } else {
    console.log('  · subset de catálogo (activa=true) + ~4 misiones al atleta cuenta + XP reciente');
  }

  // 8. club_config + pagos del mes + transacciones
  console.log('\n── 8. Config + pagos ──');
  if (EJECUTAR) {
    await supabase.from('club_config').upsert({ club: CLUB, whatsapp_club: '+593 99 111 1111', cuenta_bancaria_texto: 'Banco Pichincha · QA Compacto', dia_vencimiento: 5, descuento_hermanos_pct: 10, meta_recaudacion_mensual: 12 * 31 }, { onConflict: 'club' });
    // Pagos directos (la RPC generar_pagos_mes está rota por MIN(uuid) en v28:51).
    const precioPorNombre = new Map(GRUPOS_DEF.map((g) => [g.nombre, g.precio_mensual]));
    const meses = [1, 0].map((k) => { const d = addMonths(HOY, -k); return { mes: d.getMonth() + 1, anio: d.getFullYear() }; });
    const pagosRows = [];
    for (const { mes, anio } of meses) {
      for (const a of atletas) {
        const aid = atletaIdPorCedula[a.cedula]; if (!aid) continue;
        const base = precioPorNombre.get(a.grupo) || 30;
        pagosRows.push({ atleta_id: aid, tipo: 'Mensualidad', mes, anio, monto_base: base, descuento_pct: 0, monto_final: base, estado: 'Pendiente', fecha_vencimiento: `${anio}-${String(mes).padStart(2, '0')}-05`, registrado_por: owner.id, notas: '' });
      }
    }
    // Idempotencia por chequeo previo, no por upsert: el índice único de pagos
    // pasó a ser PARCIAL en v39 (WHERE mes IS NOT NULL) y PostgREST no infiere
    // índices parciales, así que un onConflict aquí falla con "no unique or
    // exclusion constraint matching the ON CONFLICT specification".
    if (pagosRows.length) {
      const { data: yaHay } = await supabase
        .from('pagos').select('atleta_id, mes, anio, tipo')
        .in('atleta_id', [...new Set(pagosRows.map((r) => r.atleta_id))]);
      const vistos = new Set((yaHay || []).map((p) => `${p.atleta_id}|${p.mes}|${p.anio}|${p.tipo}`));
      const nuevos = pagosRows.filter((r) => !vistos.has(`${r.atleta_id}|${r.mes}|${r.anio}|${r.tipo}`));
      if (nuevos.length) await supabase.from('pagos').insert(nuevos);
    }
    const idsAtl = Object.values(atletaIdPorCedula);
    const { data: pagos } = await supabase.from('pagos').select('id, monto_final, monto_base, estado').in('atleta_id', idsAtl.length ? idsAtl : ['00000000-0000-0000-0000-000000000000']).eq('tipo', 'Mensualidad');
    for (const p of pagos || []) {
      if (p.estado === 'Becado') continue;
      const { data: tx } = await supabase.from('pago_transacciones').select('id').eq('pago_id', p.id).limit(1);
      if (tx && tx.length) continue;
      if (rand() < 0.35) continue; // algunos quedan pendientes
      const monto = Number(p.monto_final ?? p.monto_base ?? 30);
      await supabase.from('pago_transacciones').insert({ pago_id: p.id, monto, forma_pago: pick(['Efectivo', 'Transferencia']), referencia: 'Abono QA', registrado_por: owner.id });
    }
    console.log('  club_config + pagos (2 meses) + transacciones.');
  } else {
    console.log('  · club_config + generar_pagos_mes (2 meses) + ~65% pagados');
  }

  // 9. Un evento próximo con convocatoria
  console.log('\n── 9. Evento ──');
  if (EJECUTAR) {
    const { data: exE } = await supabase.from('eventos').select('id').eq('club', CLUB).eq('titulo', 'Amistoso de pretemporada').maybeSingle();
    let evId = exE?.id;
    if (!evId) { const { data, error } = await supabase.from('eventos').insert({ club: CLUB, creado_por: coach.id, tipo: 'partido', estado: 'publicado', titulo: 'Amistoso de pretemporada', descripcion: 'Evento QA', rival: 'Escuela Vecina', fecha_evento: addDays(HOY, 6).toISOString(), hora_inicio: '10:00', sede: 'Coliseo Demo' }).select('id').single(); if (error) throw new Error(`eventos: ${error.message}`); evId = data.id; }
    for (const cedula of Object.keys(atletaIdPorCedula).slice(0, 8)) {
      const aid = atletaIdPorCedula[cedula];
      const { data: yc } = await supabase.from('evento_convocados').select('id').eq('evento_id', evId).eq('atleta_id', aid).maybeSingle();
      if (!yc) await supabase.from('evento_convocados').insert({ evento_id: evId, atleta_id: aid, estado_rsvp: pick(['pendiente', 'asiste', 'asiste', 'duda']) });
    }
    console.log('  1 evento publicado + ~8 convocados.');
  } else {
    console.log('  · 1 evento "Amistoso de pretemporada" + ~8 convocados');
  }

  console.log('\n=== RESUMEN ===');
  console.log(`Club: "${CLUB}" — ${atletas.length} atletas, 2 grupos.`);
  console.log('Cuentas logueables (identificador = password = cédula):');
  console.log('  superadmin → QAC-SUPERADMIN\n  owner      → QAC-OWNER\n  coach      → QAC-COACH\n  atleta     → QAC-ATLETA\n  padre      → QAC-PADRE');
  if (!EJECUTAR) console.log('\n🔍 DRY-RUN: no se escribió nada. Para ejecutar:\n   SEED_REAL=1 node scripts/sembrar_club_qa_compacto.mjs');
  else console.log('\n✅ Club compacto sembrado.');
}

run().catch((err) => { console.error('❌ Error inesperado:', err); process.exit(1); });
