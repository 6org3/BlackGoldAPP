// Completa el club ficticio "DEMO Simulación 1 Año" para una demo E2E de
// punta a punta: sobre los datos base que siembra simular_club_nuevo_1anio.mjs
// (coach + 30 atletas + evaluaciones/asistencia/sesiones/misiones/XP), agrega
// TODO lo que faltaba para que los 5 portales rindan datos reales:
//
//   1. Cuentas Auth logueables (owner, superadmin, el coach base, 2 coaches
//      extra para el ranking, 3 atletas representativos y 3 padres).
//   2. club_config (incl. meta_recaudacion_mensual del panel Dueño).
//   3. catalogo_servicios + servicio_tarifas (catálogo del módulo de pagos).
//   4. pagos reales vía RPC generar_pagos_mes + pago_transacciones (abonos),
//      para que finanzas/mes del Dueño y /admin/pagos tengan histórico.
//   5. eventos + evento_convocados (convocatorias/RSVP).
//   6. comunicaciones + comunicacion_destinatarios (anuncios del club).
//   7. xp_eventos (ledger v31) reciente y repartido entre coaches → XP semanal
//      y racha del atleta + ranking de coaches del Dueño.
//   8. membresía/retención (atletas.fecha_alta/fecha_baja/estado_membresia/
//      beca_pct) → panel de retención (altas/bajas) del Dueño.
//
// PRECONDICIÓN: el club base debe existir. Corre primero:
//   SEED_REAL=1 node scripts/simular_club_nuevo_1anio.mjs
//
// Patrón idéntico a los otros seeders: dry-run por defecto. Para escribir:
//   SEED_REAL=1 node scripts/sembrar_club_demo_completo.mjs
// Idempotente: reejecutar no duplica (chequea existencia antes de insertar).
// Todas las credenciales salen de .env.local (service_role, bypassa RLS).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const EJECUTAR = process.env.SEED_REAL === '1';

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

const CLUB = 'DEMO Simulación 1 Año';
const HOY = new Date('2026-07-13T12:00:00Z'); // fecha del proyecto (ver system prompt)
const emailInterno = (cedula) => `${cedula.toLowerCase()}@sinacceso.blackgoldapp.internal`;

// ── RNG determinista (dry-run reproducible; misma corrida en real) ──
let seed = 20260713;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; }
function toISODate(date) { return date.toISOString().split('T')[0]; }

const acciones = []; // registro para el resumen dry-run
function plan(msg) { acciones.push(msg); console.log(`  · ${msg}`); }

// ── Helper: asegurar fila usuarios + cuenta Auth vinculada (idempotente) ──
// Reusa el patrón canónico de crear_cuentas_prueba.js.
async function ensureUsuarioConAuth({ cedula, nombre, rol, fecha_nacimiento = null, genero = null }) {
  const { data: existente } = await supabase
    .from('usuarios').select('id, auth_user_id').eq('cedula', cedula).maybeSingle();

  if (!EJECUTAR) {
    plan(`usuario+auth [${rol}] ${cedula} (${nombre})` + (existente ? ' — ya existe' : ''));
    return { id: existente?.id || null, cedula };
  }

  let usuarioId = existente?.id;
  if (!usuarioId) {
    const row = { cedula, nombre, correo: null, telefono: null, rol, club: CLUB };
    if (fecha_nacimiento) { row.fecha_nacimiento = fecha_nacimiento; row.genero = genero || 'Masculino'; }
    const { data, error } = await supabase.from('usuarios').insert(row).select('id').single();
    if (error) throw new Error(`insert usuarios ${cedula}: ${error.message}`);
    usuarioId = data.id;
  }
  await ensureAuth({ id: usuarioId, cedula, auth_user_id: existente?.auth_user_id });
  return { id: usuarioId, cedula };
}

// ── Helper: crear+vincular cuenta Auth para una fila usuarios ya existente ──
async function ensureAuth({ id, cedula, auth_user_id }) {
  if (auth_user_id) return; // ya vinculado
  if (!EJECUTAR) { plan(`auth para ${cedula} (password = cédula)`); return; }
  const email = emailInterno(cedula);
  const { data: authData, error: errAuth } = await supabase.auth.admin.createUser({
    email, password: cedula, email_confirm: true, user_metadata: { usuario_id: id, demo: true },
  });
  if (errAuth || !authData?.user) {
    // Puede fallar si el email ya existe en auth.users (rerun) → intentar re-vincular.
    console.warn(`⚠️  createUser ${cedula}: ${errAuth?.message || 'sin user'} (se intentará continuar)`);
    return;
  }
  const { error: errLink } = await supabase.from('usuarios').update({ auth_user_id: authData.user.id }).eq('id', id);
  if (errLink) throw new Error(`link auth ${cedula}: ${errLink.message}`);
}

async function run() {
  console.log(`=== Completar club demo E2E: "${CLUB}" ===`);
  console.log(`Modo: ${EJECUTAR ? '🚀 REAL (escribe)' : '🔍 DRY-RUN (no escribe)'}\n`);

  // ── PRECONDICIÓN: club base sembrado ──
  const { data: coachBase } = await supabase
    .from('usuarios').select('id, cedula, auth_user_id').eq('club', CLUB).eq('cedula', 'DEMO-COACH-001').maybeSingle();
  if (!coachBase) {
    console.error(`❌ No existe el club base. Corre primero:\n   SEED_REAL=1 node scripts/simular_club_nuevo_1anio.mjs`);
    process.exit(1);
  }
  console.log('✅ Club base detectado (coach DEMO-COACH-001).\n');

  // ============================================================
  // 1. CUENTAS STAFF (owner + superadmin) con Auth
  // ============================================================
  console.log('── 1. Cuentas staff logueables ──');
  const owner = await ensureUsuarioConAuth({ cedula: 'DEMO-OWNER-001', nombre: 'Dueña Demo (Black Gold)', rol: 'owner' });
  const superadmin = await ensureUsuarioConAuth({ cedula: 'DEMO-SUPERADMIN-001', nombre: 'Superadmin Demo', rol: 'superadmin' });
  // Coach base: agregar Auth a la fila existente.
  if (EJECUTAR) await ensureAuth(coachBase);
  else plan('auth para DEMO-COACH-001 (coach base)');
  const coachBaseId = coachBase.id;

  // ============================================================
  // 2. COACHES EXTRA (para que el ranking de coaches tenga varios)
  // ============================================================
  console.log('\n── 2. Coaches extra (ranking) ──');
  const coach2 = await ensureUsuarioConAuth({ cedula: 'DEMO-COACH-002', nombre: 'Coach Ana Demo', rol: 'coach' });
  const coach3 = await ensureUsuarioConAuth({ cedula: 'DEMO-COACH-003', nombre: 'Coach Bruno Demo', rol: 'coach' });
  const coachIds = [coachBaseId, coach2.id, coach3.id].filter(Boolean);

  // ============================================================
  // 3. ATLETAS DEL CLUB + selección de representativos con Auth
  // ============================================================
  console.log('\n── 3. Atletas del club + representativos logueables ──');
  const { data: usuariosAtl } = await supabase
    .from('usuarios').select('id, cedula, nombre, fecha_nacimiento, genero, auth_user_id')
    .eq('club', CLUB).eq('rol', 'atleta');
  const idsUsuAtl = (usuariosAtl || []).map((u) => u.id);
  const { data: atletasRows } = await supabase
    .from('atletas').select('id, usuario_id, grupo_nombre, xp_total')
    .in('usuario_id', idsUsuAtl.length ? idsUsuAtl : ['00000000-0000-0000-0000-000000000000']);
  const usuById = new Map((usuariosAtl || []).map((u) => [u.id, u]));
  const atletas = (atletasRows || []).map((a) => ({ ...a, usuario: usuById.get(a.usuario_id) }));
  console.log(`Atletas encontrados en el club: ${atletas.length}`);

  // Un representativo por grupo (Sub-8 / Sub-12 / Sub-16) para las 3 vistas de atleta.
  const reps = [];
  for (const grupo of ['Sub-8', 'Sub-12', 'Sub-16']) {
    const cand = atletas.find((a) => a.grupo_nombre === grupo && !reps.includes(a));
    if (cand) reps.push(cand);
  }
  while (reps.length < 3 && atletas[reps.length]) reps.push(atletas[reps.length]);
  for (const r of reps) {
    if (EJECUTAR) await ensureAuth({ id: r.usuario.id, cedula: r.usuario.cedula, auth_user_id: r.usuario.auth_user_id });
    else plan(`auth atleta representativo ${r.usuario.cedula} (${r.usuario.nombre}, ${r.grupo_nombre})`);
  }

  // ============================================================
  // 4. PADRES + vínculo padres_atletas (uno logueable)
  // ============================================================
  console.log('\n── 4. Padres/representantes ──');
  for (let i = 0; i < reps.length; i++) {
    const r = reps[i];
    const padreCedula = `DEMO-PADRE-${String(i + 1).padStart(3, '0')}`;
    const padre = await ensureUsuarioConAuth({ cedula: padreCedula, nombre: `Representante de ${r.usuario.nombre}`, rol: 'padre' });
    if (EJECUTAR && padre.id) {
      const { data: vinc } = await supabase
        .from('padres_atletas').select('padre_id').eq('padre_id', padre.id).eq('atleta_id', r.id).maybeSingle();
      if (!vinc) {
        const { error } = await supabase.from('padres_atletas').insert({ padre_id: padre.id, atleta_id: r.id, es_rep_pagos: true });
        if (error) throw new Error(`padres_atletas ${padreCedula}: ${error.message}`);
      }
    } else if (!EJECUTAR) {
      plan(`vínculo padres_atletas ${padreCedula} → ${r.usuario.cedula} (es_rep_pagos=true)`);
    }
  }

  // ============================================================
  // 5. club_config (incl. meta_recaudacion_mensual del panel Dueño)
  // ============================================================
  console.log('\n── 5. club_config ──');
  // Meta ≈ suma de mensualidades esperadas del club (30 atletas, precio medio ~30).
  const metaMensual = 30 * 30; // 900
  const clubConfig = {
    club: CLUB,
    whatsapp_club: '+593 99 000 0000',
    cuenta_bancaria_texto: 'Banco Pichincha · Cta. Ahorros 22000000 · Black Gold Demo',
    dia_vencimiento: 5,
    descuento_hermanos_pct: 10,
    meta_recaudacion_mensual: metaMensual,
  };
  if (EJECUTAR) {
    const { error } = await supabase.from('club_config').upsert(clubConfig, { onConflict: 'club' });
    if (error) throw new Error(`club_config: ${error.message}`);
  } else {
    plan(`upsert club_config (meta_recaudacion_mensual=${metaMensual}, desc_hermanos=10%, día venc=5)`);
  }

  // ============================================================
  // 6. catalogo_servicios + servicio_tarifas (catálogo del módulo pagos)
  // ============================================================
  console.log('\n── 6. Catálogo de servicios + tarifas ──');
  let servicioId = null;
  if (EJECUTAR) {
    const { data: servExist } = await supabase
      .from('catalogo_servicios').select('id').eq('club', CLUB).eq('nombre', 'Mensualidad').maybeSingle();
    if (servExist) servicioId = servExist.id;
    else {
      const { data, error } = await supabase.from('catalogo_servicios')
        .insert({ club: CLUB, nombre: 'Mensualidad', descripcion: 'Cuota mensual de entrenamiento', recurrencia: 'mensual', precio_base: 30, activo: true })
        .select('id').single();
      if (error) throw new Error(`catalogo_servicios: ${error.message}`);
      servicioId = data.id;
    }
    // Tarifas por grupo (precios reales de los grupos base: Sub-8=25, Sub-12=30, Sub-16=35).
    const { data: grupos } = await supabase.from('grupos_entrenamiento').select('id, nombre, precio_mensual').eq('club', CLUB);
    for (const g of grupos || []) {
      const { data: tarExist } = await supabase
        .from('servicio_tarifas').select('id').eq('servicio_id', servicioId).eq('grupo_id', g.id).maybeSingle();
      if (!tarExist) {
        const { error } = await supabase.from('servicio_tarifas')
          .insert({ servicio_id: servicioId, grupo_id: g.id, precio: g.precio_mensual || 30 });
        if (error) throw new Error(`servicio_tarifas ${g.nombre}: ${error.message}`);
      }
    }
  } else {
    plan('catálogo "Mensualidad" (recurrencia=mensual) + 1 tarifa por grupo (25/30/35)');
  }

  // ============================================================
  // 7. MEMBRESÍA / RETENCIÓN (antes de pagos, para reflejar becas)
  // ============================================================
  console.log('\n── 7. Membresía / retención ──');
  if (EJECUTAR) {
    for (let i = 0; i < atletas.length; i++) {
      const a = atletas[i];
      const alta = addMonths(HOY, -randInt(0, 14)); // curva de altas (14 meses)
      const patch = { fecha_alta: toISODate(alta), estado_membresia: 'activo' };
      if (i === 3 || i === 17) { patch.estado_membresia = 'baja'; patch.fecha_baja = toISODate(addDays(HOY, -randInt(10, 90))); }
      if (i === 5 || i === 21) { patch.beca_pct = i === 5 ? 100 : 50; patch.es_becado = i === 5; }
      const { error } = await supabase.from('atletas').update(patch).eq('id', a.id);
      if (error) throw new Error(`atletas retención ${a.id}: ${error.message}`);
    }
  } else {
    plan('fecha_alta repartida (14 meses), 2 bajas, 2 becados (1 al 100%, 1 al 50%)');
  }

  // ============================================================
  // 8. PAGOS (inserción directa) + transacciones (abonos)
  //    NOTA: NO se usa la RPC generar_pagos_mes: tiene un bug (MIN(uuid)
  //    inexistente en v28:51) que la hace fallar SIEMPRE en planificación.
  //    Se replica aquí su cálculo simple (sin descuento por hermanos).
  // ============================================================
  console.log('\n── 8. Pagos (inserción directa) + transacciones ──');
  const mesesPagos = [];
  for (let k = 7; k >= 0; k--) { const d = addMonths(HOY, -k); mesesPagos.push({ mes: d.getMonth() + 1, anio: d.getFullYear() }); }
  if (EJECUTAR) {
    const { data: gruposP } = await supabase.from('grupos_entrenamiento').select('id, precio_mensual').eq('club', CLUB);
    const precioPorGrupo = new Map((gruposP || []).map((g) => [g.id, Number(g.precio_mensual) || 30]));
    const { data: atlFull } = await supabase.from('atletas').select('id, grupo_id, beca_pct, es_becado, descuento_pct').in('id', atletas.map((a) => a.id));
    const pagosRows = [];
    for (const { mes, anio } of mesesPagos) {
      for (const a of atlFull || []) {
        const base = precioPorGrupo.get(a.grupo_id) ?? 30;
        const becado = (a.beca_pct || 0) >= 100 || a.es_becado;
        const pct = becado ? 100 : Math.max(a.descuento_pct || 0, a.beca_pct || 0);
        pagosRows.push({ atleta_id: a.id, tipo: 'Mensualidad', mes, anio, monto_base: base, descuento_pct: pct, monto_final: Math.round(base * (1 - pct / 100) * 100) / 100, estado: becado ? 'Becado' : 'Pendiente', fecha_vencimiento: `${anio}-${String(mes).padStart(2, '0')}-05`, registrado_por: owner.id, notas: becado ? 'Beca completa' : '' });
      }
    }
    const { error: errP } = await supabase.from('pagos').upsert(pagosRows, { onConflict: 'atleta_id,mes,anio,tipo', ignoreDuplicates: true });
    if (errP) throw new Error(`pagos upsert: ${errP.message}`);
    // Abonos (idempotente: salta si el pago ya tiene transacción). El trigger recalcula estado.
    const idsAtl = atletas.map((a) => a.id);
    const { data: pagos } = await supabase.from('pagos').select('id, atleta_id, mes, anio, monto_final, monto_base, estado').in('atleta_id', idsAtl.length ? idsAtl : ['00000000-0000-0000-0000-000000000000']).eq('tipo', 'Mensualidad');
    for (const p of pagos || []) {
      if (p.estado === 'Becado') continue;
      const { data: yaTx } = await supabase.from('pago_transacciones').select('id').eq('pago_id', p.id).limit(1);
      if (yaTx && yaTx.length) continue;
      const esMesActual = p.mes === HOY.getMonth() + 1 && p.anio === HOY.getFullYear();
      const monto = Number(p.monto_final ?? p.monto_base ?? 30);
      const dado = rand();
      const umbralPagado = esMesActual ? 0.45 : 0.82;
      const umbralAbono = esMesActual ? 0.65 : 0.92;
      if (dado > umbralAbono) continue; // sin pago → queda Pendiente
      const montoTx = dado <= umbralPagado ? monto : Math.round(monto * 0.5 * 100) / 100;
      const { error } = await supabase.from('pago_transacciones').insert({ pago_id: p.id, monto: montoTx, forma_pago: pick(['Efectivo', 'Transferencia', 'Transferencia']), referencia: 'Abono demo', registrado_por: owner.id });
      if (error) throw new Error(`pago_transacciones pago ${p.id}: ${error.message}`);
    }
  } else {
    plan(`pagos directos × ${mesesPagos.length} meses (${mesesPagos[0].mes}/${mesesPagos[0].anio} .. ${mesesPagos.at(-1).mes}/${mesesPagos.at(-1).anio})`);
    plan('transacciones: ~82% pagado / 10% abonado en meses viejos; mes actual mixto');
  }

  // ============================================================
  // 8. EVENTOS + convocados
  // ============================================================
  console.log('\n── 8. Eventos + convocatorias ──');
  const eventosDef = [
    { tipo: 'partido', estado: 'publicado', titulo: 'Amistoso vs Titanes FC', rival: 'Titanes FC', offsetDias: 5, sede: 'Coliseo Municipal' },
    { tipo: 'torneo', estado: 'publicado', titulo: 'Copa Sucumbíos — Fase de grupos', offsetDias: 20, sede: 'Polideportivo Nueva Loja' },
    { tipo: 'partido', estado: 'cerrado', titulo: 'Liga local vs Vipers AC', rival: 'Vipers AC', offsetDias: -12, sede: 'Coliseo Municipal', resultado: 'ganado', marcador_propio: 58, marcador_rival: 47 },
  ];
  if (EJECUTAR) {
    for (const ev of eventosDef) {
      const { data: exist } = await supabase.from('eventos').select('id').eq('club', CLUB).eq('titulo', ev.titulo).maybeSingle();
      let eventoId = exist?.id;
      if (!eventoId) {
        const fecha = addDays(HOY, ev.offsetDias);
        const row = {
          club: CLUB, creado_por: coachBaseId, tipo: ev.tipo, estado: ev.estado, titulo: ev.titulo,
          descripcion: 'Evento de demostración', rival: ev.rival || null, fecha_evento: fecha.toISOString(),
          hora_inicio: '10:00', sede: ev.sede,
        };
        if (ev.resultado) { row.resultado = ev.resultado; row.marcador_propio = ev.marcador_propio; row.marcador_rival = ev.marcador_rival; }
        const { data, error } = await supabase.from('eventos').insert(row).select('id').single();
        if (error) throw new Error(`eventos ${ev.titulo}: ${error.message}`);
        eventoId = data.id;
      }
      // Convocar ~12 atletas (Sub-16 prioritario) con RSVP variado.
      const convocables = atletas.filter((a) => a.grupo_nombre === 'Sub-16').slice(0, 12);
      const pool = convocables.length ? convocables : atletas.slice(0, 12);
      for (const a of pool) {
        const { data: yc } = await supabase.from('evento_convocados').select('id').eq('evento_id', eventoId).eq('atleta_id', a.id).maybeSingle();
        if (yc) continue;
        const rsvp = ev.estado === 'cerrado' ? pick(['asiste', 'asiste', 'no_asiste']) : pick(['pendiente', 'asiste', 'asiste', 'duda']);
        const { error } = await supabase.from('evento_convocados').insert({ evento_id: eventoId, atleta_id: a.id, estado_rsvp: rsvp });
        if (error) throw new Error(`evento_convocados: ${error.message}`);
      }
    }
  } else {
    eventosDef.forEach((e) => plan(`evento [${e.estado}] "${e.titulo}" + ~12 convocados con RSVP`));
  }

  // ============================================================
  // 9. COMUNICACIONES + destinatarios (anuncios del club)
  // ============================================================
  console.log('\n── 9. Comunicaciones ──');
  const comunicadosDef = [
    { titulo: 'Bienvenida a la temporada', mensaje: 'Arrancamos la nueva temporada. Revisen sus horarios de grupo.' },
    { titulo: 'Recordatorio de cuotas', mensaje: 'Las mensualidades vencen el día 5. Gracias por su puntualidad.' },
  ];
  if (EJECUTAR) {
    // Destinatarios = todos los usuarios del club (atletas + padres + coach).
    const { data: usuariosClub } = await supabase.from('usuarios').select('id').eq('club', CLUB);
    const destinatarios = (usuariosClub || []).map((u) => u.id);
    for (const c of comunicadosDef) {
      const { data: exist } = await supabase.from('comunicaciones').select('id').eq('autor_id', owner.id).eq('titulo', c.titulo).maybeSingle();
      let comId = exist?.id;
      if (!comId) {
        const { data, error } = await supabase.from('comunicaciones')
          .insert({ autor_id: owner.id, tipo: 'Anuncio', titulo: c.titulo, mensaje: c.mensaje, segmento_tipo: 'general', canal: 'ambos', proposito: 'comunicado' })
          .select('id').single();
        if (error) throw new Error(`comunicaciones ${c.titulo}: ${error.message}`);
        comId = data.id;
        const filas = destinatarios.map((uid) => ({ comunicacion_id: comId, usuario_id: uid, leido: rand() < 0.4 }));
        if (filas.length) {
          const { error: errD } = await supabase.from('comunicacion_destinatarios').upsert(filas, { onConflict: 'comunicacion_id,usuario_id' });
          if (errD) throw new Error(`comunicacion_destinatarios: ${errD.message}`);
        }
      }
    }
  } else {
    comunicadosDef.forEach((c) => plan(`comunicación [Anuncio] "${c.titulo}" a todo el club`));
  }

  // ============================================================
  // 10. XP_EVENTOS (ledger v31): XP semanal + racha + ranking coaches
  // ============================================================
  console.log('\n── 10. xp_eventos (ledger) ──');
  const motivos = ['Evaluación Modo Cancha', 'Misión aprobada', 'Asistencia perfecta semanal', 'Reto de tiro superado'];
  let totalXpEv = 0;
  const filasXp = [];
  // Muestra amplia: todos los atletas reciben algo de XP repartido entre coaches
  // en las últimas ~10 semanas (para el ranking de coaches del Dueño).
  for (const a of atletas) {
    const nEventos = randInt(2, 6);
    for (let i = 0; i < nEventos; i++) {
      const fecha = addDays(HOY, -randInt(3, 70));
      filasXp.push({ atleta_id: a.id, coach_id: pick(coachIds), delta: randInt(10, 60), motivo: pick(motivos), origen: 'simulacion_demo', created_at: fecha.toISOString() });
    }
  }
  // Representativos: XP reciente y frecuente (racha + "esta semana") hasta hoy.
  for (const r of reps) {
    for (let d = 0; d < 12; d++) {
      if (rand() < 0.35) continue; // no todos los días → racha realista
      const fecha = addDays(HOY, -d);
      filasXp.push({ atleta_id: r.id, coach_id: coachBaseId, delta: randInt(15, 45), motivo: pick(motivos), origen: 'simulacion_demo', created_at: fecha.toISOString() });
    }
  }
  totalXpEv = filasXp.length;
  if (EJECUTAR) {
    // Idempotencia: si ya hay filas origen 'simulacion_demo' para el club, no re-sembrar.
    const idsAtl = atletas.map((a) => a.id);
    const { data: yaXp } = await supabase.from('xp_eventos').select('id')
      .in('atleta_id', idsAtl.length ? idsAtl : ['00000000-0000-0000-0000-000000000000'])
      .eq('origen', 'simulacion_demo').limit(1);
    if (yaXp && yaXp.length) {
      console.log('  ⏭️  Ya hay xp_eventos demo; se omite (idempotente).');
    } else {
      for (let i = 0; i < filasXp.length; i += 500) {
        const { error } = await supabase.from('xp_eventos').insert(filasXp.slice(i, i + 500));
        if (error) throw new Error(`xp_eventos: ${error.message}`);
      }
    }
  } else {
    plan(`~${totalXpEv} filas xp_eventos repartidas entre ${coachIds.length} coaches (10 sem) + XP reciente de representativos`);
  }

  // ============================================================
  // RESUMEN
  // ============================================================
  console.log('\n=== RESUMEN ===');
  console.log(`Club: "${CLUB}"`);
  console.log('Cuentas logueables (identificador = password = cédula):');
  console.log('  owner       → DEMO-OWNER-001');
  console.log('  superadmin  → DEMO-SUPERADMIN-001');
  console.log('  coach       → DEMO-COACH-001');
  reps.forEach((r, i) => console.log(`  atleta ${i + 1}    → ${r.usuario.cedula} (${r.grupo_nombre})`));
  console.log('  padre       → DEMO-PADRE-001 (rep. del atleta 1)');
  console.log(`Pagos: ${mesesPagos.length} meses generados; xp_eventos: ~${totalXpEv} filas; 3 eventos; 2 comunicados.`);
  if (!EJECUTAR) {
    console.log('\n🔍 DRY-RUN: no se escribió nada. Para ejecutar:');
    console.log('   SEED_REAL=1 node scripts/sembrar_club_demo_completo.mjs');
  } else {
    console.log('\n✅ Club demo completado.');
  }
}

run().catch((err) => { console.error('❌ Error inesperado:', err); process.exit(1); });
