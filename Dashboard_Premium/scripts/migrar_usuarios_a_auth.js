// Migra cada fila de `usuarios` sin auth_user_id a una cuenta real de
// Supabase Auth (auth.users), preservando la contraseña que el usuario
// ya conoce hoy, y vincula usuarios.auth_user_id al nuevo auth.users.id.
//
// Requiere la migración v19 (supabase/migrations/20260701121100_v19_auth.sql) ya aplicada
// y una SUPABASE_SERVICE_ROLE_KEY válida agregada a mano en
// Dashboard_Premium/.env.local (el mismo archivo que usa `npm run dev`,
// ya gitignored) — esta key nunca debe pegarse en un chat ni commitearse.
//
// Contraseña inicial asignada por rol (igual que el login histórico):
//   - atleta: su propia cédula.
//   - padre:  la cédula del PRIMER hijo vinculado en padres_atletas. Nota:
//             el login viejo aceptaba la cédula de CUALQUIER hijo vinculado;
//             tras la migración solo esa primera cédula sirve como
//             contraseña. Si un padre no puede entrar, ese es el motivo.
//   - staff (coach/owner/superadmin): el valor actual de contrasena_hash
//             (hoy en texto plano).
//
// Modo de ejecución: SIMULAR = true por defecto (no escribe nada).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const SIMULAR = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `dotenv` no está entre las dependencias del proyecto; process.loadEnvFile
// (Node 20.6+) hace lo mismo sin agregar una dependencia nueva.
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const emailParaAuth = (correo, cedula) =>
  correo || `${cedula}@sinacceso.blackgoldapp.internal`;

async function resolverPasswordInicial(usuario) {
  if (usuario.rol === 'atleta') {
    return usuario.cedula;
  }

  if (usuario.rol === 'padre') {
    const { data: vinculos, error } = await supabase
      .from('padres_atletas')
      .select('atletas!inner(usuarios!atletas_usuario_id_fkey!inner(cedula))')
      .eq('padre_id', usuario.id)
      .limit(1);

    if (error || !vinculos || vinculos.length === 0) {
      return null; // padre sin hijos vinculados: no hay contraseña conocida, se omite
    }
    return vinculos[0].atletas.usuarios.cedula;
  }

  // Staff: coach, owner, superadmin
  return usuario.contrasena_hash;
}

async function run() {
  console.log(`=== Migración de usuarios a Supabase Auth ===`);
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no escribe nada)' : '🚀 REAL (crea cuentas de verdad)'}`);

  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select('id, rol, correo, cedula, telefono, nombre, contrasena_hash, auth_user_id')
    .is('auth_user_id', null);

  if (error) {
    console.error('Error consultando usuarios pendientes:', error);
    process.exit(1);
  }

  console.log(`Usuarios pendientes de migrar: ${usuarios.length}`);

  let creados = 0;
  let omitidos = 0;
  let fallidos = 0;

  for (const usuario of usuarios) {
    const password = await resolverPasswordInicial(usuario);

    if (!password) {
      console.log(`⏭️  Omitido (sin contraseña resoluble): ${usuario.nombre} [${usuario.rol}]`);
      omitidos++;
      continue;
    }

    const email = emailParaAuth(usuario.correo, usuario.cedula);

    if (SIMULAR) {
      console.log(`[SIMULACIÓN] Crearía cuenta para ${usuario.nombre} [${usuario.rol}] → ${email}`);
      creados++;
      continue;
    }

    const { data: authData, error: errAuth } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { usuario_id: usuario.id },
    });

    if (errAuth || !authData.user) {
      console.error(`❌ Falló ${usuario.nombre} [${usuario.rol}]: ${errAuth?.message}`);
      fallidos++;
      continue;
    }

    const { error: errLink } = await supabase
      .from('usuarios')
      .update({ auth_user_id: authData.user.id })
      .eq('id', usuario.id);

    if (errLink) {
      console.error(`⚠️  Cuenta creada pero no vinculada para ${usuario.nombre}: ${errLink.message}`);
      fallidos++;
      continue;
    }

    console.log(`✅ ${usuario.nombre} [${usuario.rol}] → ${email}`);
    creados++;
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Migrados: ${creados} | Omitidos: ${omitidos} | Fallidos: ${fallidos}`);
  if (SIMULAR) {
    console.log('\nPara ejecutar de verdad, edita este archivo y cambia "const SIMULAR = true" a "const SIMULAR = false".');
  }
}

run().catch(console.error);
