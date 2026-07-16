// Siembra una sesión [EN_CURSO] + asistencia (presente) para el coach QA, para
// ejercitar el flujo de REANUDAR del Modo Cancha Arcade en Cypress: abrir una
// sesión desde el landing, reconstruir su asistencia y cerrarla otorgando XP.
//
// Idempotente/repetible: borra cualquier [EN_CURSO] previo del coach QA
// (artefactos de test) y crea una fresca con el atleta QA presente. Acotado al
// coach/atleta QA (buscados por cédula), nunca toca datos reales.
//
// Dos usos, misma función:
//   - CLI:     node scripts/sembrar_sesion_activa_qa.js
//   - Cypress: cy.task('sembrarSesionActivaQA') — el spec siembra su propia
//     precondición, porque el test la CONSUME (la cierra, y deja de estar
//     activa): dependiendo de sembrar a mano solo pasaba la 1ª corrida. Ver
//     cypress.config.js y arcade_escrituras.cy.js.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local. Como
// módulo lanza Error en vez de process.exit(): un exit aquí se llevaría por
// delante al runner de Cypress.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CEDULA_ATLETA = 'QA-ATLETA-001';
const CEDULA_COACH = 'QA-COACH-001';
const NOTAS = '[EN_CURSO] Grupal (Niveles) - Desarrollo';

function cliente() {
  // El env se resuelve aquí, no al importar: como task se importa desde
  // cypress.config.js, y un fallo al importar rompería toda la config.
  process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Deja al coach QA con exactamente una sesión [EN_CURSO] y su atleta presente.
 * @returns {Promise<{sesionId: string, fecha: string}>}
 */
export async function sembrarSesionActivaQA() {
  const supabase = cliente();

  const porCedula = async (cedula) => {
    const { data } = await supabase.from('usuarios').select('id, club').eq('cedula', cedula).maybeSingle();
    return data;
  };

  const coach = await porCedula(CEDULA_COACH);
  const atletaU = await porCedula(CEDULA_ATLETA);
  if (!coach || !atletaU) {
    throw new Error('Faltan cuentas QA. Corré scripts/crear_cuentas_prueba.js.');
  }
  const { data: atleta } = await supabase.from('atletas').select('id').eq('usuario_id', atletaU.id).maybeSingle();
  if (!atleta) throw new Error('El atleta QA no tiene fila en atletas.');

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
  if (error) throw new Error(`Falló crear la sesión [EN_CURSO]: ${error.message}`);

  const { error: eA } = await supabase.from('asistencia').upsert(
    { atleta_id: atleta.id, coach_id: coach.id, fecha, estado: 'Presente', notas: 'seed reanudar', sesion_id: sesion.id },
    { onConflict: 'atleta_id,fecha,sesion_id' },
  );
  if (eA) throw new Error(`Falló sembrar la asistencia: ${eA.message}`);

  return { sesionId: sesion.id, fecha };
}

// CLI solo al ejecutarlo directamente; importarlo como task no dispara nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('=== Seed de sesión [EN_CURSO] QA para reanudar ===');
  sembrarSesionActivaQA()
    .then(({ sesionId }) => {
      console.log(`✅ Sesión [EN_CURSO] creada (id=${sesionId}) con el atleta QA presente.`);
      console.log('El landing del coach QA ahora muestra "1 SESIONES ACTIVAS".');
    })
    .catch((e) => {
      console.error('❌', e.message);
      process.exit(1);
    });
}
