// Aplica la auditoría de misiones según las decisiones del owner (2026-07-07):
//   1. DEDUPLICAR por título (el seed se corrió 2×): nunca se borra una fila con
//      progreso de atletas; si hay copias con progreso, se conservan y se borran las
//      copias sin progreso; si ninguna tiene progreso, se conserva una (activa/más antigua).
//   2. Reclasificar sobre el catálogo ya limpio:
//      - material del club (esCanchaNoMision) → contexto='cancha', activa=false
//      - sesgo cancha (agilidad/resistencia, conf≥0.4)  → contexto='cancha', activa=false
//      - casa con CONFIANZA=1 → contexto='casa' (no desactiva); confianza<1 se deja
//
// Read-only por defecto (APLICAR=false = dry-run). Uso: node blackgold-mcp/scripts/aplicar_auditoria.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { clasificarContextoMision } from '../../packages/analytics-core/clasificadorContexto.js';

const APLICAR = false; // ← true para ejecutar de verdad
const UMBRAL = 0.4;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const norm = (s) => (s || '').trim().toLowerCase();

async function run() {
  console.log(`=== APLICAR AUDITORÍA — ${APLICAR ? '🚀 REAL' : '🔍 DRY-RUN'} ===\n`);

  const { data: misiones, error } = await supabase
    .from('misiones')
    .select('id, titulo, descripcion, pilar, quiz, is_ai_generated, justificacion, contexto, activa, created_at');
  if (error) { console.error(error.message); process.exit(1); }

  // Progreso por misión (una sola query).
  const { data: progreso } = await supabase.from('progreso_misiones').select('mision_id');
  const progPorMision = {};
  (progreso || []).forEach(p => { progPorMision[p.mision_id] = (progPorMision[p.mision_id] || 0) + 1; });
  const tieneProg = (id) => (progPorMision[id] || 0) > 0;

  // --- 1. DEDUPE ---
  const grupos = {};
  for (const m of misiones) (grupos[norm(m.titulo)] = grupos[norm(m.titulo)] || []).push(m);

  const idsABorrar = [];
  const protegidasDup = [];
  for (const [, filas] of Object.entries(grupos)) {
    if (filas.length < 2) continue;
    const conProg = filas.filter(m => tieneProg(m.id));
    const sinProg = filas.filter(m => !tieneProg(m.id));
    if (conProg.length > 0) {
      // Se conservan todas las que tienen progreso; se borran las copias sin progreso.
      idsABorrar.push(...sinProg.map(m => m.id));
      if (conProg.length > 1) protegidasDup.push(`${conProg.length}× con progreso: "${filas[0].titulo}"`);
    } else {
      // Ninguna tiene progreso: conservar 1 (activa preferida, luego más antigua).
      const orden = [...sinProg].sort((a, b) =>
        (b.activa === true) - (a.activa === true) ||
        new Date(a.created_at) - new Date(b.created_at));
      idsABorrar.push(...orden.slice(1).map(m => m.id));
    }
  }
  const borrarSet = new Set(idsABorrar);
  console.log(`1) DEDUPE: ${idsABorrar.length} filas duplicadas a borrar (sin progreso). ${protegidasDup.length ? 'Protegidas: ' + protegidasDup.join('; ') : ''}`);

  // --- 2. RECLASIFICAR sobre las supervivientes ---
  const supervivientes = misiones.filter(m => !borrarSet.has(m.id));
  const updCanchaMaterial = [], updCanchaSesgo = [], updCasa = [];
  for (const m of supervivientes) {
    const c = clasificarContextoMision(m);
    if (c.esCanchaNoMision) {
      if (!(m.contexto === 'cancha' && m.activa === false)) updCanchaMaterial.push(m);
    } else if (c.contextoSugerido === 'cancha' && c.confianza >= UMBRAL && m.contexto !== 'cancha') {
      updCanchaSesgo.push(m);
    } else if (c.contextoSugerido === 'casa' && c.confianza === 1 && m.contexto !== 'casa') {
      updCasa.push(m);
    }
  }
  console.log(`2) RECLASIFICAR (sobre ${supervivientes.length} supervivientes):`);
  console.log(`   · cancha+desactivar (material): ${updCanchaMaterial.length}`);
  console.log(`   · cancha+desactivar (sesgo):    ${updCanchaSesgo.length}`);
  console.log(`   · reetiquetar a casa (conf=1):  ${updCasa.length}`);

  if (!APLICAR) {
    console.log('\nDRY-RUN: no se cambió nada. Pon APLICAR=true para ejecutar.');
    return;
  }

  // --- EJECUTAR ---
  console.log('\n=== EJECUTANDO ===');
  if (idsABorrar.length) {
    // Backup de las filas a borrar (reversibilidad).
    const backup = misiones.filter(m => borrarSet.has(m.id));
    const backupPath = path.join(__dirname, `backup_misiones_dedup_${backup.length}filas.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`  💾 backup de duplicados → ${backupPath}`);
    // Borrado en lotes (evita URLs enormes en el filtro in()).
    let borradas = 0;
    for (let i = 0; i < idsABorrar.length; i += 50) {
      const lote = idsABorrar.slice(i, i + 50);
      const { error: delErr } = await supabase.from('misiones').delete().in('id', lote);
      if (delErr) { console.log(`  ❌ dedupe lote: ${delErr.message}`); break; }
      borradas += lote.length;
    }
    console.log(`  🗑️ duplicados borrados: ${borradas}`);
  }
  const aplicarUpdate = async (lista, patch, etiqueta) => {
    let n = 0;
    for (const m of lista) {
      const { error: e } = await supabase.from('misiones').update(patch).eq('id', m.id);
      if (e) { console.log(`  ❌ ${etiqueta} "${m.titulo}": ${e.message}`); continue; }
      n++;
    }
    console.log(`  ✅ ${etiqueta}: ${n}/${lista.length}`);
  };
  await aplicarUpdate(updCanchaMaterial, { contexto: 'cancha', activa: false }, 'cancha-material');
  await aplicarUpdate(updCanchaSesgo, { contexto: 'cancha', activa: false }, 'cancha-sesgo');
  await aplicarUpdate(updCasa, { contexto: 'casa' }, 'casa');
  console.log('\nHecho. Revisa el catálogo en AdminMisiones (chips Casa/Cancha + Propuestas).');
}

run().catch(console.error);
