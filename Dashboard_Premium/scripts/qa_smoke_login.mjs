// scripts/qa_smoke_login.mjs
// Smoke de login con los usuarios QA (cypress.env.json) SIN materializar
// credenciales: la contraseña se usa internamente y jamás se imprime.
// Existe para que asistentes de IA / CI puedan verificar autenticación sin
// que ningún secreto quede en transcripts o logs.
//
// Uso:  node scripts/qa_smoke_login.mjs [coach|atleta|padre|all]
// Sale con código 0 si todos los logins probados funcionan; 1 si alguno falla.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — parseo mínimo
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [
      l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, ''),
    ])
);
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local');
  process.exit(1);
}

const { QA_ROLES } = JSON.parse(readFileSync(join(ROOT, 'cypress.env.json'), 'utf8'));
const arg = (process.argv[2] || 'all').toLowerCase();
const roles = arg === 'all' ? Object.keys(QA_ROLES) : [arg];

const mask = (s) => (s ? s.replace(/^(..).*(@|$)/, (_, a, b) => `${a}***${b}${b ? '***' : ''}`) : '—');

let fallos = 0;
for (const rol of roles) {
  const cred = QA_ROLES[rol];
  if (!cred) { console.error(`✗ ${rol}: no existe en QA_ROLES`); fallos++; continue; }

  // Cliente aislado por rol (sin persistencia: no deja sesión en disco)
  const supabase = createClient(URL_, ANON, { auth: { persistSession: false } });
  try {
    // Mismo flujo que la app (src/api/authService.js): identificador → email → password
    const { data: email, error: e1 } = await supabase
      .rpc('resolver_email_login', { p_identificador: cred.identificador.trim() });
    if (e1 || !email) throw new Error(`resolver_email_login: ${e1?.message || 'sin email'}`);

    const { data, error: e2 } = await supabase.auth.signInWithPassword({
      email,
      password: cred.password,
    });
    if (e2) throw new Error(`signInWithPassword: ${e2.message}`);

    console.log(`✓ ${rol}: login OK (identificador=${cred.identificador}, email=${mask(email)}, user=${data.user.id.slice(0, 8)}…)`);
    await supabase.auth.signOut();
  } catch (err) {
    console.error(`✗ ${rol}: ${err.message}`);
    fallos++;
  }
}
process.exit(fallos ? 1 : 0);
