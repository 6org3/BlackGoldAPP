// core/supa.mjs — Clientes Supabase, patrón idéntico a scripts/*.mjs del repo.
// - service_role: bypassa RLS, para SEMBRAR y para invariantes de solo lectura.
// - anon: para el smoke de login/RLS con el MISMO flujo del app.
//
// Credenciales SIEMPRE desde Dashboard_Premium/.env.local (gitignored). Nunca
// hardcodear ni pegar claves en un chat.
//
// Interruptor de seguridad global: DRY-RUN por defecto. Para escribir de verdad
// hay que pasar SIM_REAL=1 explícitamente (mismo espíritu que SEED_REAL=1).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// simulacion/core/  ->  Dashboard_Premium/.env.local  (dos niveles arriba)
process.loadEnvFile(path.join(__dirname, '..', '..', '.env.local'));

const URL_ = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !SERVICE) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}

// Guardarraíl: exigir que la URL NO parezca producción salvo confirmación
// explícita. Definí SIM_STAGING_URL en .env.local con la URL de tu proyecto de
// staging; si VITE_SUPABASE_URL no coincide, la simulación se niega a escribir.
export const REAL = process.env.SIM_REAL === '1';
const STAGING = process.env.SIM_STAGING_URL;
if (REAL && STAGING && URL_ !== STAGING) {
  console.error(`❌ SIM_REAL=1 pero VITE_SUPABASE_URL (${URL_}) != SIM_STAGING_URL. Abortando por seguridad.`);
  process.exit(1);
}
if (REAL && !STAGING) {
  console.warn('⚠️  SIM_REAL=1 sin SIM_STAGING_URL definido: no puedo verificar que apuntás a staging. Continúo, pero configurá SIM_STAGING_URL.');
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } };

export const admin = createClient(URL_, SERVICE, opts);           // service_role
export const anon = () => createClient(URL_, ANON, opts);         // cliente limpio (login/RLS)
export const SUPA_URL = URL_;

// Ejecuta una escritura solo si SIM_REAL=1; si no, la registra como plan.
export function guardado(desc, fn) {
  if (!REAL) return Promise.resolve({ dryRun: true, desc });
  return fn();
}
