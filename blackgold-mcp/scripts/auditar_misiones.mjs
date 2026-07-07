// Auditoría de misiones — versión script de la tool MCP auditar_misiones / actualizar_misiones
// / eliminar_misiones_basura (para ejecutar sin reiniciar el server MCP). Reutiliza el MISMO
// clasificador y el MISMO rack que las tools, así el resultado es idéntico.
//
// Modo por defecto: SOLO ANÁLISIS (read-only). Cambia APLICAR=true para ejecutar los cambios
// decididos por el owner: reclasificar contexto, desactivar ejercicios de cancha y borrar la
// basura IA (con salvaguarda de progreso_misiones).
//
// Uso: node blackgold-mcp/scripts/auditar_misiones.mjs   (lee blackgold-mcp/.env)

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { clasificarContextoMision } from '../../packages/analytics-core/clasificadorContexto.js';
import { buscarRack } from '../src/rack.js';

const APLICAR = false; // ← cambiar a true para ejecutar los cambios

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DOCS_CANCHA = new Set(['manual_entrenamiento.md', 'periodizacion_entrenamiento_anual.md']);
const DOCS_CASA = new Set(['trabajo_casa_atleta.md']);

function señalRackDe(m) {
  try {
    const hits = buscarRack(`${m.titulo || ''} ${m.descripcion || ''}`, { k: 2 });
    const top = hits[0];
    if (!top) return null;
    if (DOCS_CANCHA.has(top.archivo)) return { lado: 'cancha', archivo: top.archivo };
    if (DOCS_CASA.has(top.archivo)) return { lado: 'casa', archivo: top.archivo };
    return { lado: 'neutro', archivo: top.archivo };
  } catch { return null; }
}

const UMBRAL = 0.4; // por debajo, una sugerencia distinta al contexto actual no se acciona

function accionDe(m, c) {
  if (c.esBasura) return 'BORRAR_BASURA';
  // Material del club inequívoco → ejercicio de cancha, se desactiva.
  if (c.esCanchaNoMision) return 'CANCHA_MATERIAL_DESACTIVAR';
  // Sugerencia distinta al contexto actual, solo si hay confianza suficiente.
  if (c.contextoSugerido !== m.contexto && c.confianza >= UMBRAL) {
    if (c.contextoSugerido === 'casa') return 'RECLASIFICAR_CASA';
    if (c.contextoSugerido === 'cancha') return 'CANCHA_SESGO_REVISAR'; // agilidad/resistencia sin material
    return 'RECLASIFICAR_AMBOS';
  }
  return 'OK';
}

async function tieneProgreso(id) {
  const { count } = await supabase
    .from('progreso_misiones').select('id', { count: 'exact', head: true }).eq('mision_id', id);
  return count ?? 0;
}

async function run() {
  console.log(`=== AUDITORÍA DE MISIONES — ${APLICAR ? '🚀 APLICAR' : '🔍 ANÁLISIS (read-only)'} ===\n`);

  const { data: misiones, error } = await supabase
    .from('misiones')
    .select('id, titulo, descripcion, pilar, quiz, is_ai_generated, justificacion, contexto, activa, categoria_bucket');
  if (error) { console.error('Error:', error.message); process.exit(1); }

  const grupos = { BORRAR_BASURA: [], CANCHA_MATERIAL_DESACTIVAR: [], CANCHA_SESGO_REVISAR: [], RECLASIFICAR_CASA: [], RECLASIFICAR_AMBOS: [], OK: [] };
  for (const m of misiones) {
    const c = clasificarContextoMision(m);
    const señalRack = señalRackDe(m);
    grupos[accionDe(m, c)].push({ m, c, señalRack });
  }

  // Duplicados por título (el seed parece haberse corrido más de una vez).
  const porTitulo = {};
  for (const m of misiones) {
    const t = (m.titulo || '').trim().toLowerCase();
    (porTitulo[t] = porTitulo[t] || []).push(m);
  }
  const duplicados = Object.entries(porTitulo).filter(([, v]) => v.length > 1);
  const filasDuplicadasExtra = duplicados.reduce((s, [, v]) => s + (v.length - 1), 0);

  console.log(`Total misiones: ${misiones.length}`);
  for (const g of Object.keys(grupos)) console.log(`  ${g}: ${grupos[g].length}`);
  console.log(`\nDuplicados: ${duplicados.length} títulos repetidos = ${filasDuplicadasExtra} filas sobrantes.`);
  duplicados.slice(0, 15).forEach(([t, v]) => console.log(`  · ${v.length}× "${v[0].titulo}"`));
  console.log('');

  // Detalle de discrepancias (no OK).
  for (const g of ['BORRAR_BASURA', 'CANCHA_MATERIAL_DESACTIVAR', 'CANCHA_SESGO_REVISAR', 'RECLASIFICAR_CASA', 'RECLASIFICAR_AMBOS']) {
    if (!grupos[g].length) continue;
    console.log(`\n### ${g} (${grupos[g].length})`);
    for (const { m, c, señalRack } of grupos[g]) {
      const rk = señalRack ? ` rack→${señalRack.lado}` : '';
      console.log(`  · [${m.contexto}→${c.contextoSugerido}${rk}, conf ${c.confianza}, activa=${m.activa}] "${m.titulo}" (${m.pilar})`);
      console.log(`      ${c.señales.join(' | ') || '—'}`);
    }
  }

  // Guardar detalle completo a JSON para inspección.
  const outPath = path.join(__dirname, 'auditoria_misiones_reporte.json');
  fs.writeFileSync(outPath, JSON.stringify({
    total: misiones.length,
    resumen: Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.length])),
    grupos: Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.map(({ m, c, señalRack }) => ({
      id: m.id, titulo: m.titulo, pilar: m.pilar, contexto: m.contexto, activa: m.activa,
      sugerido: c.contextoSugerido, esBasura: c.esBasura, esCanchaNoMision: c.esCanchaNoMision,
      confianza: c.confianza, señales: c.señales, señalRack,
    }))])),
  }, null, 2), 'utf8');
  console.log(`\nDetalle completo → ${outPath}`);

  if (!APLICAR) {
    console.log('\nModo análisis: no se cambió nada. Revisa el reporte y pon APLICAR=true para ejecutar.');
    return;
  }

  // --- APLICAR ---
  console.log('\n=== APLICANDO CAMBIOS ===');
  let reclas = 0, desact = 0, borradas = 0, protegidas = 0;

  // Reclasificaciones de contexto (+ desactivar los de cancha con material).
  for (const g of ['CANCHA_MATERIAL_DESACTIVAR', 'CANCHA_SESGO_REVISAR', 'RECLASIFICAR_CASA', 'RECLASIFICAR_AMBOS']) {
    for (const { m, c } of grupos[g]) {
      const patch = g === 'CANCHA_MATERIAL_DESACTIVAR'
        ? { contexto: 'cancha', activa: false }
        : g === 'CANCHA_SESGO_REVISAR'
        ? { contexto: 'cancha', activa: false }
        : { contexto: c.contextoSugerido };
      const { error: upErr } = await supabase.from('misiones').update(patch).eq('id', m.id);
      if (upErr) { console.log(`  ❌ "${m.titulo}": ${upErr.message}`); continue; }
      reclas++;
      if (patch.activa === false) desact++;
    }
  }

  // Borrado de basura con salvaguarda de progreso.
  for (const { m } of grupos.BORRAR_BASURA) {
    if (!m.is_ai_generated) { console.log(`  🛡️ "${m.titulo}": no es IA → protegida`); protegidas++; continue; }
    const prog = await tieneProgreso(m.id);
    if (prog > 0) { console.log(`  🛡️ "${m.titulo}": ${prog} progreso(s) → protegida (no se borra)`); protegidas++; continue; }
    const { error: delErr } = await supabase.from('misiones').delete().eq('id', m.id);
    if (delErr) { console.log(`  ❌ "${m.titulo}": ${delErr.message}`); continue; }
    borradas++;
    console.log(`  🗑️ "${m.titulo}": borrada`);
  }

  console.log(`\nResumen aplicado: reclasificadas ${reclas} (desactivadas ${desact}), borradas ${borradas}, protegidas ${protegidas}.`);
}

run().catch(console.error);
