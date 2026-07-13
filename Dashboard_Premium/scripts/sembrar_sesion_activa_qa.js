// Siembra una sesión [EN_CURSO] + asistencia (presente) para el coach QA, para
// ejercitar el flujo de REANUDAR del Modo Cancha Arcade en Cypress: abrir una
// sesión desde el landing, reconstruir su asistencia y cerrarla otorgando XP.
//
// Idempotente/repetible: borra cualquier [EN_CURSO] previo del coach QA
// (artefactos de test) y crea una fresca con el atleta QA presente. Acotado al
// coach/atleta QA (buscados por cédula), nunca toca datos reales.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local.
//   node scripts/sembrar_sesion_activa_qa.js

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CEDULA_ATLETA = 'QA-ATLETA-001';
const CEDULA_COACH = 'QA-COACH-001';
const NOTAS = '[EN_CURSO] Grupal (Niveles) - Desarrollo';

async function usuarioPorCedula(cedula) {
  const { data } = await supabase.from('usuarios').select('id, club').eq('cedula', cedula).maybeSingle();
  return data;
}

async function run() {
  console.log('=== Seed de sesión [EN_CURSO] QA para reanudar ===');
  const coach = await usuarioPorCedula(CEDULA_COACH);
  const atletaU = await usuarioPorCedula(CEDULA_ATLETA);
  if (!coach || !atletaU) {
    console.error('❌ Faltan cuentas QA. Corré scripts/crear_cuentas_prueba.js.');
    process.exit(1);
  }
  const { data: atleta } = await supabase.from('atletas').select('id').eq('usuario_id', atletaU.id).maybeSingle();
  if (!atleta) {
    console.error('❌ El atleta QA no tiene fila en atletas.');
    process.exit(1);
  }

  const now = new Date();
  const fecha = now.toISOString().split('T')[0];
  const hora = now.toTimeString().split(' ')[0];

  // Limpieza de sesiones en curso previas del coach QA (artefactos de test).
  await supabase
    .from('sesiones_programadas')
    .delete()
    .eq('coach_id', coach.id)
    .eq('estado', 'Programada')
    .ilike('notas', '[EN_CURSO]%');

  const { data: sesion, error } = await supabase
    .from('sesiones_programadas')
    .insert({
      coach_id: coach.id,
      atleta_id: atleta.id,
      fecha,
      hora_inicio: hora,
      hora_fin: hora,
      estado: 'Programada',
      tipo: 'Grupal',
      notas: NOTAS,
    })
    .select('id')
    .single();
  if (error) {
    console.error('❌ Falló crear la sesión [EN_CURSO]:', error.message);
    process.exit(1);
  }

  const { error: eA } = await supabase.from('asistencia').upsert(
    { atleta_id: atleta.id, coach_id: coach.id, fecha, estado: 'Presente', notas: 'seed reanudar', sesion_id: sesion.id },
    { onConflict: 'atleta_id,fecha,sesion_id' },
  );
  if (eA) {
    console.error('❌ Falló sembrar la asistencia:', eA.message);
    process.exit(1);
  }

  console.log(`✅ Sesión [EN_CURSO] creada (id=${sesion.id}) con el atleta QA presente.`);
  console.log('El landing del coach QA ahora muestra "1 SESIONES ACTIVAS".');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
