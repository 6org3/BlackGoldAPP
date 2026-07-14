// Reparación de la pertenencia atleta↔grupo (idempotente, service_role).
//
// Dos fases, en orden:
//   1. LIMPIEZA cross-club: elimina vínculos `atleta_grupo` cuyo grupo pertenece
//      a OTRO club que el del atleta, o cuyo grupo ya no existe (data legacy de
//      importación — p.ej. atletas de LAGO AGRIO vinculados a grupos de Black
//      Gold). Esos vínculos contaminaban la segmentación de comunicaciones y
//      cualquier derivación de grupo_id.
//   2. BACKFILL: rellena `atletas.grupo_id` / `grupo_nombre` (columna directa,
//      que lee p.ej. generar_pagos_mes en SQL) desde el vínculo `atleta_grupo`
//      del MISMO club más reciente, SOLO donde la columna está vacía. No pisa
//      valores existentes.
//
// Uso:
//   node scripts/reparar_pertenencia_grupos.mjs           # DRY-RUN (no escribe)
//   EJECUTAR=1 node scripts/reparar_pertenencia_grupos.mjs # aplica cambios
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EJECUTAR = process.env.EJECUTAR === '1';
const tag = EJECUTAR ? '[EJECUTAR]' : '[DRY-RUN]';

async function chunked(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

async function run() {
  console.log(`${tag} Reparación de pertenencia atleta↔grupo\n`);

  // Mapas globales: grupo→club, atleta→club (vía usuarios.club)
  const { data: grupos } = await admin.from('grupos_entrenamiento').select('id, nombre, club');
  const grupoById = new Map((grupos || []).map((g) => [g.id, g]));

  const { data: usuarios } = await admin.from('usuarios').select('id, club');
  const clubByUsuario = new Map((usuarios || []).map((u) => [u.id, u.club]));
  const { data: atletas } = await admin.from('atletas').select('id, usuario_id, grupo_id, grupo_nombre');
  const clubByAtleta = new Map((atletas || []).map((a) => [a.id, clubByUsuario.get(a.usuario_id)]));

  // ---------- FASE 1: limpieza cross-club / huérfanos ----------
  const { data: vinculos } = await admin.from('atleta_grupo').select('atleta_id, grupo_id, added_at');
  const aBorrar = [];
  const motivos = { crossClub: 0, huerfano: 0 };
  for (const v of vinculos || []) {
    const g = grupoById.get(v.grupo_id);
    const clubAtleta = clubByAtleta.get(v.atleta_id);
    if (!g) { aBorrar.push(v); motivos.huerfano++; }
    else if (g.club !== clubAtleta) { aBorrar.push(v); motivos.crossClub++; }
  }
  console.log(`FASE 1 · limpieza atleta_grupo`);
  console.log(`  vínculos totales: ${vinculos?.length || 0}`);
  console.log(`  a eliminar: ${aBorrar.length}  (cross-club: ${motivos.crossClub}, grupo inexistente: ${motivos.huerfano})`);
  if (EJECUTAR && aBorrar.length) {
    let borrados = 0;
    for (const lote of await chunked(aBorrar, 50)) {
      await Promise.all(lote.map((v) =>
        admin.from('atleta_grupo').delete().eq('atleta_id', v.atleta_id).eq('grupo_id', v.grupo_id)
          .then(({ error }) => { if (error) throw new Error(`delete ${v.atleta_id}/${v.grupo_id}: ${error.message}`); borrados++; })));
    }
    console.log(`  ✔ eliminados: ${borrados}`);
  }

  // ---------- FASE 2: backfill grupo_id desde atleta_grupo mismo-club ----------
  // Recargar vínculos vivos tras la limpieza (en dry-run se filtran en memoria).
  const borradoSet = new Set(aBorrar.map((v) => `${v.atleta_id}|${v.grupo_id}`));
  const vivos = (vinculos || []).filter((v) => !borradoSet.has(`${v.atleta_id}|${v.grupo_id}`));
  vivos.sort((a, b) => String(b.added_at).localeCompare(String(a.added_at))); // más reciente primero

  const derivado = new Map(); // atleta_id -> {grupo_id, grupo_nombre}
  for (const v of vivos) {
    const g = grupoById.get(v.grupo_id);
    if (g && g.club === clubByAtleta.get(v.atleta_id) && !derivado.has(v.atleta_id)) {
      derivado.set(v.atleta_id, { grupo_id: v.grupo_id, grupo_nombre: g.nombre });
    }
  }
  const aRellenar = (atletas || []).filter((a) => !a.grupo_id && derivado.has(a.id));
  console.log(`\nFASE 2 · backfill atletas.grupo_id (solo columna vacía)`);
  console.log(`  atletas sin grupo_id con vínculo mismo-club: ${aRellenar.length}`);
  const porClub = {};
  for (const a of aRellenar) { const c = clubByAtleta.get(a.id) || '(sin club)'; porClub[c] = (porClub[c] || 0) + 1; }
  console.log(`  por club:`, JSON.stringify(porClub));
  if (EJECUTAR && aRellenar.length) {
    let ok = 0;
    for (const lote of await chunked(aRellenar, 50)) {
      await Promise.all(lote.map((a) => {
        const d = derivado.get(a.id);
        return admin.from('atletas').update({ grupo_id: d.grupo_id, grupo_nombre: d.grupo_nombre }).eq('id', a.id)
          .then(({ error }) => { if (error) throw new Error(`update ${a.id}: ${error.message}`); ok++; });
      }));
    }
    console.log(`  ✔ actualizados: ${ok}`);
  }

  console.log(`\n${tag} ${EJECUTAR ? 'Cambios aplicados.' : 'Sin cambios (dry-run). Repetir con EJECUTAR=1 para aplicar.'}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
