// Verificación previa a la migración v27 (pagos: servicios, transacciones,
// comprobantes). SOLO LECTURA — no escribe nada. Reporta:
//
// 1. Duplicados de (atleta_id, mes, anio, tipo) en `pagos`: el UNIQUE nuevo de
//    v27 (pagos_atleta_mes_anio_tipo_key) no se puede crear si existen.
// 2. Valores de usuarios.genero fuera de ('Masculino','Femenino',NULL): el
//    CHECK de v27 se agrega NOT VALID, pero hay que sanearlos antes del
//    VALIDATE CONSTRAINT (y antes de tarifar por género).
// 3. Teléfonos de padres/atletas con formato no normalizable a E.164 EC
//    (informativo: los wa.me dirigidos caerán al selector de contactos).
//
// Mismo patrón que reconciliar_pagos_precio_grupo.mjs:
// - carga .env.local con process.loadEnvFile
// - cliente Supabase con SERVICE_ROLE_KEY

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

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

// Igual que normalizarTelefonoEC de src/lib/plantillasWhatsApp.js
function normalizable(tel) {
  if (!tel) return false;
  const limpio = String(tel).replace(/[\s\-().+]/g, '');
  return /^09\d{8}$/.test(limpio) || /^5939\d{8}$/.test(limpio);
}

let hayBloqueantes = false;

// ── 1. Duplicados en pagos ──────────────────────────────────────────────────
{
  const { data, error } = await supabase
    .from('pagos')
    .select('id, atleta_id, mes, anio, tipo, estado, monto_final, created_at');
  if (error) { console.error('❌ Error leyendo pagos:', error.message); process.exit(1); }

  const porClave = new Map();
  for (const p of data) {
    // NULLs en mes/anio son distintos entre sí para el UNIQUE (cargos puntuales)
    if (p.mes === null || p.anio === null) continue;
    const clave = `${p.atleta_id}|${p.mes}|${p.anio}|${p.tipo}`;
    (porClave.get(clave) || porClave.set(clave, []).get(clave)).push(p);
  }
  const duplicados = [...porClave.entries()].filter(([, filas]) => filas.length > 1);

  if (duplicados.length === 0) {
    console.log(`✅ pagos: sin duplicados de (atleta_id, mes, anio, tipo) en ${data.length} filas — el UNIQUE de v27 puede crearse.`);
  } else {
    hayBloqueantes = true;
    console.log(`🛑 pagos: ${duplicados.length} clave(s) duplicada(s) — resolver ANTES de aplicar v27:`);
    for (const [clave, filas] of duplicados) {
      console.log(`   ${clave}:`);
      for (const f of filas) {
        console.log(`     id=${f.id} estado=${f.estado} monto_final=${f.monto_final} created_at=${f.created_at}`);
      }
    }
  }
}

// ── 2. usuarios.genero fuera del CHECK ──────────────────────────────────────
{
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, genero');
  if (error) { console.error('❌ Error leyendo usuarios:', error.message); process.exit(1); }

  const fuera = data.filter(u => u.genero !== null && u.genero !== 'Masculino' && u.genero !== 'Femenino');
  if (fuera.length === 0) {
    console.log(`✅ usuarios.genero: los ${data.length} usuarios están en ('Masculino','Femenino',NULL) — se puede correr VALIDATE CONSTRAINT tras v27.`);
  } else {
    // No bloquea la migración (el CHECK entra NOT VALID) pero sí el VALIDATE y las tarifas por género.
    console.log(`⚠️ usuarios.genero: ${fuera.length} usuario(s) con valor fuera del CHECK (sanear antes de VALIDATE y de tarifar por género):`);
    for (const u of fuera) console.log(`   ${u.id} rol=${u.rol} nombre=${JSON.stringify(u.nombre)} genero=${JSON.stringify(u.genero)}`);
  }
}

// ── 3. Teléfonos no normalizables (informativo) ─────────────────────────────
{
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, telefono')
    .in('rol', ['padre', 'atleta']);
  if (error) { console.error('❌ Error leyendo teléfonos:', error.message); process.exit(1); }

  const sinTel = data.filter(u => !u.telefono);
  const raros = data.filter(u => u.telefono && !normalizable(u.telefono));
  console.log(`ℹ️ teléfonos (padres+atletas): ${data.length} usuarios · ${sinTel.length} sin teléfono · ${raros.length} con formato no normalizable a wa.me`);
  for (const u of raros) console.log(`   ${u.id} rol=${u.rol} nombre=${JSON.stringify(u.nombre)} telefono=${JSON.stringify(u.telefono)}`);
}

console.log('');
if (hayBloqueantes) {
  console.log('🛑 Hay bloqueantes: NO aplicar v27 todavía.');
  process.exit(2);
}
console.log('✅ Preflight OK: v27 puede aplicarse con npx supabase db push.');
