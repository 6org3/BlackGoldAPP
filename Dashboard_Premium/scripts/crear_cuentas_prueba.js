// Crea 4 cuentas ficticias (owner, coach, atleta, padre) bajo un club también
// ficticio ("QA Demo Club"), para usar como credenciales de Cypress
// (cypress.env.json) sin tocar datos reales del club.
//
// Requiere una SUPABASE_SERVICE_ROLE_KEY válida en Dashboard_Premium/.env.local
// (el mismo archivo que usa `npm run dev`, ya gitignored) — esta key nunca debe
// pegarse en un chat ni commitearse.
//
// Contraseña de cada cuenta: su propia cédula ficticia (QA-OWNER-001, etc.) —
// simplificación válida solo para QA, no representa la política real de
// contraseñas de staff (ver scripts/migrar_usuarios_a_auth.js para esa regla).
//
// Modo de ejecución: SIMULAR = true por defecto (no escribe nada).
// Reintentable: si una cédula ya existe, la cuenta se omite (no falla el resto).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { calcularEdad, calcularCategoriaFEB } from '../../packages/analytics-core/categoriaFEB.js';

const SIMULAR = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

const CLUB = 'QA Demo Club';
const emailParaAuth = (cedula) => `${cedula}@sinacceso.blackgoldapp.internal`;

const ATLETA_FECHA_NACIMIENTO = '2011-05-15'; // ~15 años en 2026 → categoría Juvenil/Cadete

const CUENTAS = [
  { cedula: 'QA-OWNER-001', nombre: 'QA Owner Demo', rol: 'owner' },
  { cedula: 'QA-COACH-001', nombre: 'QA Coach Demo', rol: 'coach' },
  { cedula: 'QA-ATLETA-001', nombre: 'QA Atleta Demo', rol: 'atleta', fecha_nacimiento: ATLETA_FECHA_NACIMIENTO },
  { cedula: 'QA-PADRE-001', nombre: 'QA Padre Demo', rol: 'padre' },
];

async function crearUsuarioYAuth(cuenta) {
  const email = emailParaAuth(cuenta.cedula);
  const password = cuenta.cedula;

  const { data: existente } = await supabase
    .from('usuarios')
    .select('id, auth_user_id')
    .eq('cedula', cuenta.cedula)
    .maybeSingle();

  if (existente) {
    console.log(`⏭️  Ya existe, se omite: ${cuenta.nombre} [${cuenta.rol}] (usuarios.id=${existente.id})`);
    return { id: existente.id, skipped: true };
  }

  if (SIMULAR) {
    console.log(`[SIMULACIÓN] Crearía usuario + cuenta Auth: ${cuenta.nombre} [${cuenta.rol}] → ${email} / password=${password}`);
    return { id: null, skipped: false };
  }

  const usuarioRow = {
    cedula: cuenta.cedula,
    nombre: cuenta.nombre,
    correo: null,
    telefono: null,
    rol: cuenta.rol,
    club: CLUB,
  };

  if (cuenta.rol === 'atleta') {
    usuarioRow.fecha_nacimiento = cuenta.fecha_nacimiento;
    usuarioRow.categoria = calcularCategoriaFEB(cuenta.fecha_nacimiento);
    usuarioRow.genero = 'Masculino';
  }

  const { data: nuevoUsuario, error: errUsuario } = await supabase
    .from('usuarios')
    .insert(usuarioRow)
    .select()
    .single();

  if (errUsuario) {
    console.error(`❌ Falló insert en usuarios para ${cuenta.nombre}: ${errUsuario.message}`);
    return { id: null, skipped: false, failed: true };
  }

  const { data: authData, error: errAuth } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { usuario_id: nuevoUsuario.id, qa: true },
  });

  if (errAuth || !authData.user) {
    console.error(`❌ Usuario creado pero falló la cuenta Auth para ${cuenta.nombre}: ${errAuth?.message}`);
    return { id: nuevoUsuario.id, skipped: false, failed: true };
  }

  const { error: errLink } = await supabase
    .from('usuarios')
    .update({ auth_user_id: authData.user.id })
    .eq('id', nuevoUsuario.id);

  if (errLink) {
    console.error(`⚠️  Cuenta Auth creada pero no vinculada para ${cuenta.nombre}: ${errLink.message}`);
    return { id: nuevoUsuario.id, skipped: false, failed: true };
  }

  console.log(`✅ ${cuenta.nombre} [${cuenta.rol}] → ${email} / password=${password}`);
  return { id: nuevoUsuario.id, skipped: false };
}

async function run() {
  console.log('=== Creación de cuentas QA ficticias (Black Gold) ===');
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no escribe nada)' : '🚀 REAL (crea datos de verdad)'}`);
  console.log(`Club ficticio: "${CLUB}"\n`);

  const resultados = {};
  for (const cuenta of CUENTAS) {
    resultados[cuenta.rol] = await crearUsuarioYAuth(cuenta);
  }

  // atletas: fila hija del usuario atleta (edad, posición, nivel de desarrollo)
  if (!SIMULAR && resultados.atleta.id && !resultados.atleta.skipped) {
    const { data: nuevoAtleta, error: errAtleta } = await supabase
      .from('atletas')
      .insert({
        usuario_id: resultados.atleta.id,
        edad: calcularEdad(ATLETA_FECHA_NACIMIENTO),
        posicion: 'Base',
        nivel_desarrollo: 'Desarrollo',
      })
      .select()
      .single();

    if (errAtleta) {
      console.error(`❌ Falló insert en atletas: ${errAtleta.message}`);
    } else {
      console.log(`✅ Fila atletas creada (atletas.id=${nuevoAtleta.id})`);
      resultados.atleta.atletaId = nuevoAtleta.id;
    }
  } else if (SIMULAR) {
    console.log('[SIMULACIÓN] Crearía fila en atletas (edad, posicion=Base, nivel_desarrollo=Desarrollo)');
  }

  // padres_atletas: vínculo padre → atleta
  if (!SIMULAR && resultados.padre.id && resultados.atleta.atletaId) {
    const { error: errVinculo } = await supabase
      .from('padres_atletas')
      .insert({ padre_id: resultados.padre.id, atleta_id: resultados.atleta.atletaId });

    if (errVinculo) {
      console.error(`❌ Falló vínculo padres_atletas: ${errVinculo.message}`);
    } else {
      console.log('✅ Vínculo padres_atletas creado');
    }
  } else if (SIMULAR) {
    console.log('[SIMULACIÓN] Vincularía padre ↔ atleta en padres_atletas');
  }

  console.log('\n=== RESUMEN ===');
  if (SIMULAR) {
    console.log('Nada se escribió. Para ejecutar de verdad, edita este archivo y cambia "const SIMULAR = true" a "const SIMULAR = false".');
  } else {
    console.log('Credenciales (identificador = password = cédula):');
    CUENTAS.forEach(c => console.log(`  ${c.rol.padEnd(7)} → identificador: ${c.cedula}  password: ${c.cedula}`));
  }
}

run().catch(console.error);
