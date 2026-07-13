// Siembra un evento PUBLICADO + convocatoria para el atleta QA (QA-ATLETA-001,
// club "QA Demo Club"), para poder ejercitar el write de RSVP del Portal Padre
// en el test de Cypress (cypress/e2e/arcade_escrituras.cy.js).
//
// Idempotente y repetible: reusa el evento QA si ya existe (empujando su fecha a
// futuro) y RESETEA la convocatoria a estado_rsvp='pendiente' — así el test de
// padre puede volver a confirmar la asistencia en cada corrida. Acotado a las
// entidades del atleta QA (buscadas por cédula), nunca toca datos reales.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local (gitignored;
// bypassa RLS solo para este seed). Nunca commitear esa key.
//
//   node scripts/sembrar_evento_qa.js

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

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

const CEDULA_ATLETA = 'QA-ATLETA-001';
const CEDULA_COACH = 'QA-COACH-001';
const TITULO_QA = 'Amistoso QA vs Demo (E2E)';

function fechaFutura() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T15:00:00.000Z`; // ~10:00 en Ecuador (UTC-5)
}

async function usuarioIdPorCedula(cedula) {
  const { data } = await supabase.from('usuarios').select('id, club').eq('cedula', cedula).maybeSingle();
  return data || null;
}

async function run() {
  console.log('=== Seed de evento QA para RSVP del Portal Padre ===');

  const atletaUsuario = await usuarioIdPorCedula(CEDULA_ATLETA);
  if (!atletaUsuario) {
    console.error(`❌ No existe el usuario ${CEDULA_ATLETA}. Corré scripts/crear_cuentas_prueba.js primero.`);
    process.exit(1);
  }
  const { data: atleta } = await supabase.from('atletas').select('id').eq('usuario_id', atletaUsuario.id).maybeSingle();
  if (!atleta) {
    console.error(`❌ El usuario ${CEDULA_ATLETA} no tiene fila en atletas.`);
    process.exit(1);
  }
  const club = atletaUsuario.club || 'QA Demo Club';
  const coach = await usuarioIdPorCedula(CEDULA_COACH);
  const creadoPor = coach ? coach.id : null;
  const fecha_evento = fechaFutura();

  // 1. Evento (reusar si ya existe el marcador QA en ese club).
  const { data: existente } = await supabase
    .from('eventos')
    .select('id')
    .eq('titulo', TITULO_QA)
    .eq('club', club)
    .maybeSingle();

  let eventoId;
  if (existente) {
    const { error } = await supabase
      .from('eventos')
      .update({ estado: 'publicado', fecha_evento, hora_inicio: '10:00:00' })
      .eq('id', existente.id);
    if (error) {
      console.error('❌ Falló al actualizar el evento QA:', error.message);
      process.exit(1);
    }
    eventoId = existente.id;
    console.log(`♻️  Evento QA reusado y empujado a ${fecha_evento} (id=${eventoId})`);
  } else {
    const { data: nuevo, error } = await supabase
      .from('eventos')
      .insert({
        club,
        creado_por: creadoPor,
        tipo: 'partido',
        estado: 'publicado',
        titulo: TITULO_QA,
        descripcion: 'Evento sembrado para el E2E de RSVP.',
        rival: 'Demo FC',
        fecha_evento,
        hora_inicio: '10:00:00',
        sede: 'Cancha QA',
        incluir_representantes: true,
      })
      .select('id')
      .single();
    if (error) {
      console.error('❌ Falló al crear el evento QA:', error.message);
      process.exit(1);
    }
    eventoId = nuevo.id;
    console.log(`✅ Evento QA creado (id=${eventoId}) para ${fecha_evento}`);
  }

  // 2. Convocatoria del atleta QA, reseteada a 'pendiente' (repetible).
  const { error: eConv } = await supabase
    .from('evento_convocados')
    .upsert(
      { evento_id: eventoId, atleta_id: atleta.id, estado_rsvp: 'pendiente', rsvp_at: null, rsvp_por: null },
      { onConflict: 'evento_id,atleta_id' },
    );
  if (eConv) {
    console.error('❌ Falló al sembrar la convocatoria:', eConv.message);
    process.exit(1);
  }
  console.log(`✅ Convocatoria del atleta QA (atleta_id=${atleta.id}) → estado_rsvp='pendiente'`);
  console.log('\nListo. Ahora el Portal Padre del atleta QA muestra "CONFIRMAR ASISTENCIA".');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
