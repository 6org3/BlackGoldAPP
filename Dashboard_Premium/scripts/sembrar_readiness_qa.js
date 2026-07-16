// Deja al atleta QA con su check-in de readiness del día ya hecho.
//
// Por qué: el portal del atleta AUTO-ABRE el modal de check-in cuando no hay
// registro de hoy (v26/#89, readinessService.checkinDisponible + fetchReadinessHoy).
// Es el comportamiento querido —insistir hasta completarlo— pero convierte en
// rojos a los specs que solo pasaban por /atleta para otra cosa: el modal es un
// bottom-sheet que tapa el HUD, y su clic cae sobre el overlay. Como el registro
// es POR DÍA, esos specs se rompían solos al cambiar la fecha, sin que nadie
// tocara el código.
//
// Idempotente: upsert sobre UNIQUE (atleta_id, fecha), así que repetirlo el
// mismo día no duplica ni falla. Acotado al atleta QA (por cédula).
//
// Dos usos, misma función:
//   - CLI:     node scripts/sembrar_readiness_qa.js
//   - Cypress: cy.task('sembrarReadinessHoyQA') — ver cypress.config.js.
//
// NO afecta a atleta_checkin_readiness.cy.js: ese spec stubea tanto la lectura
// (GET → []) como el POST, justamente para no depender del estado real.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CEDULA_ATLETA = 'QA-ATLETA-001';

// Valores de un día normal y bueno: readiness alto y sin deshidratación, para no
// disparar las alertas de la Base y meter ruido en specs que miran otra cosa.
// score = 8*0.4 + 8*0.4 + (9-2)*0.2 = 7.8 (columna generada, no se inserta).
const SUENO = 8;
const FATIGA = 8;
const COLOR_ORINA = 2;

function cliente() {
  // El env se resuelve aquí y no al importar: como task se carga desde
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
 * Registra (o deja registrado) el readiness de hoy del atleta QA.
 * @returns {Promise<{atletaId: string, fecha: string, yaExistia: boolean}>}
 */
export async function sembrarReadinessHoyQA() {
  const supabase = cliente();

  const { data: usuario } = await supabase
    .from('usuarios').select('id').eq('cedula', CEDULA_ATLETA).maybeSingle();
  if (!usuario) throw new Error('Falta la cuenta QA del atleta. Corré scripts/crear_cuentas_prueba.js.');

  const { data: atleta } = await supabase
    .from('atletas').select('id').eq('usuario_id', usuario.id).maybeSingle();
  if (!atleta) throw new Error('El atleta QA no tiene fila en atletas.');

  // Misma fecha que mira la app: fetchReadinessHoy usa el día en UTC.
  const fecha = new Date().toISOString().split('T')[0];

  const { data: previo } = await supabase
    .from('atleta_readiness').select('id').eq('atleta_id', atleta.id).eq('fecha', fecha).maybeSingle();

  const { error } = await supabase.from('atleta_readiness').upsert(
    { atleta_id: atleta.id, fecha, sueno_calidad: SUENO, fatiga_fisica: FATIGA, color_orina: COLOR_ORINA },
    { onConflict: 'atleta_id,fecha' },
  );
  if (error) throw new Error(`Falló sembrar el readiness: ${error.message}`);

  return { atletaId: atleta.id, fecha, yaExistia: !!previo };
}

// CLI solo al ejecutarlo directamente; importarlo como task no dispara nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('=== Seed de readiness del día (atleta QA) ===');
  sembrarReadinessHoyQA()
    .then(({ fecha, yaExistia }) => {
      console.log(`✅ El atleta QA tiene su check-in del ${fecha} ${yaExistia ? '(ya existía, actualizado)' : '(creado)'}.`);
      console.log('El portal /atleta ya no auto-abre el modal de check-in.');
    })
    .catch((e) => {
      console.error('❌', e.message);
      process.exit(1);
    });
}
