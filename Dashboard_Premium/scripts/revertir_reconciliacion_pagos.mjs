// Revierte la reconciliación aplicada por reconciliar_pagos_precio_grupo.mjs,
// restaurando monto_base/monto_final a los valores que tenían antes, leyendo
// el backup que ese script escribió en backup_pagos_reconciliacion_precio_grupo.json.
//
// Uso: solo tiene sentido correrlo justo después de una corrida real (no
// SIMULAR) de reconciliar_pagos_precio_grupo.mjs, y antes de que se genere
// o modifique cualquier otro pago sobre esas mismas filas.
//
// const SIMULAR = true por defecto: solo imprime qué restauraría.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const SIMULAR = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BACKUP_PATH = path.join(__dirname, 'backup_pagos_reconciliacion_precio_grupo.json');

async function run() {
  console.log('=== Revertir reconciliación de pagos (monto_base/monto_final) ===');
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no escribe nada)' : '🚀 REAL (escribe datos de verdad)'}\n`);

  if (!fs.existsSync(BACKUP_PATH)) {
    console.log(`No existe ${BACKUP_PATH} — no hay nada que revertir (¿ya se revirtió, o nunca se corrió la reconciliación en real?).`);
    return;
  }

  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  console.log(`Backup generado el ${backup.generado_en} — ${backup.pagos.length} pagos a restaurar.\n`);

  if (SIMULAR) {
    backup.pagos.slice(0, 10).forEach(p => {
      console.log(`[SIMULACIÓN] Restauraría pago ${p.pago_id} → monto_base=${p.monto_base_anterior}, monto_final=${p.monto_final_anterior}`);
    });
    if (backup.pagos.length > 10) console.log(`... (+${backup.pagos.length - 10} más)`);
    console.log('\nNada se escribió. Para ejecutar de verdad, edita este archivo y cambia "const SIMULAR = true" a "const SIMULAR = false".');
    return;
  }

  let restaurados = 0;
  for (const p of backup.pagos) {
    const { error } = await supabase
      .from('pagos')
      .update({ monto_base: p.monto_base_anterior, monto_final: p.monto_final_anterior })
      .eq('id', p.pago_id);
    if (error) throw new Error(`Restaurar pago ${p.pago_id} falló: ${error.message}`);
    restaurados++;
  }

  console.log(`✅ ${restaurados} pagos restaurados a sus valores anteriores.`);
  console.log(`Nota: la nota de reconciliación agregada al campo 'notas' de cada pago NO se revierte automáticamente (queda como registro histórico de que hubo un intento de reconciliación).`);
}

run().catch((err) => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
