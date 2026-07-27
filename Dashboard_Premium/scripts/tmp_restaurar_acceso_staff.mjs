// TEMPORAL (diagnóstico 2026-07-16): la rotación v41 dejó al staff de los
// clubes de prueba sin contraseña conocida. Restaura el acceso:
//   · cuenta con email interno (@sinacceso.blackgoldapp.internal) → password = cédula
//     (misma política que conservan los seeds a propósito para data de prueba)
//   · cuenta con correo real → contraseña aleatoria NUEVA impresa una sola vez
// Dry-run por defecto; --ejecutar para aplicar.
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const url = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const admin = createClient(url, service, { auth: { persistSession: false } });

const EJECUTAR = process.argv.includes('--ejecutar');
const DOMINIO_INTERNO = '@sinacceso.blackgoldapp.internal';

// Mismo alfabeto que la Edge Function v41 (sin caracteres ambiguos).
const generarPassword = (largo = 14) => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const limite = Math.floor(256 / abc.length) * abc.length;
  const salida = [];
  while (salida.length < largo) {
    const bytes = new Uint8Array(largo * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limite) continue;
      salida.push(abc[b % abc.length]);
      if (salida.length === largo) break;
    }
  }
  return salida.join('');
};

const { data: staff, error } = await admin.from('usuarios')
  .select('id, nombre, cedula, correo, rol, club, estado, auth_user_id')
  .in('rol', ['coach', 'owner', 'superadmin'])
  .not('auth_user_id', 'is', null)
  .order('club').order('rol');
if (error) { console.error('❌', error.message); process.exit(1); }

// El email de LOGIN es el de Auth (no siempre el campo `correo`): lo leemos de Auth.
const plan = [];
for (const u of staff) {
  const { data: au } = await admin.auth.admin.getUserById(u.auth_user_id);
  const emailAuth = au?.user?.email || '';
  // 2026-07-16: todos los correos staff resultaron ficticios (@blackgold.com,
  // @global.com, dominio interno) — ningún club real aún. Se restaura la
  // política pre-v41 (password = cédula) de manera uniforme.
  plan.push({ ...u, emailAuth, accion: 'cedula' });
}

console.log(EJECUTAR ? '🔑 APLICANDO\n' : '👀 DRY-RUN (usa --ejecutar para aplicar)\n');
const resultado = [];
for (const u of plan) {
  const password = u.accion === 'cedula' ? u.cedula : generarPassword();
  if (EJECUTAR) {
    const { error: e } = await admin.auth.admin.updateUserById(u.auth_user_id, { password });
    if (e) { resultado.push({ club: u.club, rol: u.rol, usuario: u.cedula, resultado: `❌ ${e.message}` }); continue; }
  }
  resultado.push({
    club: u.club, rol: u.rol, usuario: u.cedula, login: u.emailAuth,
    password: u.accion === 'cedula' ? '(su cédula)' : password,
    resultado: EJECUTAR ? 'restaurada' : `se pondría ${u.accion === 'cedula' ? 'cédula' : 'aleatoria nueva'}`,
  });
}
console.table(resultado);
console.log(`\n${resultado.length} cuenta(s) staff con acceso.`);
