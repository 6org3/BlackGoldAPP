// Revierte todo lo insertado por scripts/simular_club_nuevo_1anio.mjs para el
// club ficticio "DEMO Simulación 1 Año". Borra explícitamente por atleta_id/club
// en vez de confiar en ON DELETE CASCADE (no verificado en vivo para todas las
// tablas), así el orden de borrado es predecible y no puede tocar datos de
// otros clubes.
//
// const SIMULAR = true por defecto: solo cuenta e imprime qué borraría.

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const SIMULAR = true;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLUB = 'DEMO Simulación 1 Año';
const CONDICION_TRIGGER_MISIONES = 'simulacion_club_demo';

async function run() {
  console.log(`=== Limpieza de la simulación "${CLUB}" ===`);
  console.log(`Modo: ${SIMULAR ? '🔍 SIMULACIÓN (no borra nada)' : '🚀 REAL (borra de verdad)'}\n`);

  const { data: usuariosClub, error: errUsuarios } = await supabase
    .from('usuarios').select('id, rol').eq('club', CLUB);
  if (errUsuarios) { console.error('Error leyendo usuarios:', errUsuarios.message); process.exit(1); }

  if (!usuariosClub || usuariosClub.length === 0) {
    console.log('No hay usuarios con ese club — nada que borrar.');
    return;
  }
  const usuarioIds = usuariosClub.map(u => u.id);
  console.log(`Usuarios encontrados con club="${CLUB}": ${usuarioIds.length}`);

  const { data: atletasClub, error: errAtletas } = await supabase
    .from('atletas').select('id').in('usuario_id', usuarioIds);
  if (errAtletas) { console.error('Error leyendo atletas:', errAtletas.message); process.exit(1); }
  const atletaIds = (atletasClub || []).map(a => a.id);
  console.log(`Atletas encontrados: ${atletaIds.length}`);

  const { data: gruposClub, error: errGrupos } = await supabase
    .from('grupos_entrenamiento').select('id, nombre').eq('club', CLUB);
  if (errGrupos) { console.error('Error leyendo grupos:', errGrupos.message); process.exit(1); }
  const grupoIds = (gruposClub || []).map(g => g.id);
  console.log(`Grupos encontrados: ${(gruposClub || []).map(g => g.nombre).join(', ') || '(ninguno)'}`);

  const { count: misionesCount } = await supabase
    .from('misiones').select('*', { count: 'exact', head: true }).eq('condicion_trigger', CONDICION_TRIGGER_MISIONES);
  console.log(`Misiones de catálogo simulado: ${misionesCount ?? 0}`);

  // Comunicaciones cuyo autor es del club (sus destinatarios pueden incluir
  // usuarios que hay que poder borrar, y viceversa).
  const { data: comsClub, error: errComs } = await supabase
    .from('comunicaciones').select('id').in('autor_id', usuarioIds);
  if (errComs) { console.error('Error leyendo comunicaciones:', errComs.message); process.exit(1); }
  const comunicacionIds = (comsClub || []).map(c => c.id);
  console.log(`Comunicaciones con autor del club: ${comunicacionIds.length}\n`);

  const pasos = [
    ['recompensas_desbloqueadas', q => q.in('atleta_id', atletaIds)],
    ['progreso_misiones', q => q.in('atleta_id', atletaIds)],
    ['evaluaciones_pruebas', q => q.in('atleta_id', atletaIds)],
    ['asistencia', q => q.in('atleta_id', atletaIds)],
    ['sesiones_entrenamiento', q => q.in('atleta_id', atletaIds)],
    // pagos primero: pago_comprobantes/pago_transacciones cuelgan de pagos
    // con ON DELETE CASCADE (v27), así que borrar pagos limpia el árbol.
    ['pagos', q => q.in('atleta_id', atletaIds)],
    ['atleta_grupo', q => q.in('atleta_id', atletaIds)],
    ['sesiones_control', q => q.in('grupo_id', grupoIds)],
    ['misiones', q => q.eq('condicion_trigger', CONDICION_TRIGGER_MISIONES)],
    ['atletas', q => q.in('id', atletaIds)],
    // Módulo de pagos v27: la migración siembra catalogo_servicios/club_config
    // por cada club, y servicio_tarifas referencia grupos_entrenamiento —
    // hay que vaciarlos antes de poder borrar los grupos del club.
    ['servicio_tarifas', q => q.in('grupo_id', grupoIds)],
    ['catalogo_servicios', q => q.eq('club', CLUB)],
    ['club_config', q => q.eq('club', CLUB)],
    // Comunicaciones (v18): destinatarios referencian usuarios sin cascade.
    // Se borran por ambos lados (destinatario del club / comunicación del club)
    // antes que comunicaciones y usuarios.
    ['comunicacion_destinatarios', q => q.in('comunicacion_id', comunicacionIds)],
    ['comunicacion_destinatarios', q => q.in('usuario_id', usuarioIds)],
    ['comunicaciones', q => q.in('autor_id', usuarioIds)],
    // Auditoría de pagos (v30): actor_id referencia usuarios sin cascade.
    ['pagos_auditoria', q => q.in('actor_id', usuarioIds)],
    ['grupos_entrenamiento', q => q.eq('club', CLUB)],
    ['usuarios', q => q.eq('club', CLUB)],
  ];

  for (const [tabla, filtro] of pasos) {
    const tieneIds = tabla === 'sesiones_control' || tabla === 'servicio_tarifas' ? grupoIds.length > 0
      : tabla === 'misiones' ? true
      : ['catalogo_servicios', 'club_config', 'grupos_entrenamiento', 'usuarios'].includes(tabla) ? true
      : ['comunicacion_destinatarios', 'comunicaciones', 'pagos_auditoria'].includes(tabla) ? usuarioIds.length > 0
      : atletaIds.length > 0;

    if (!tieneIds) {
      console.log(`⏭️  ${tabla}: nada que borrar (0 ids relevantes)`);
      continue;
    }

    if (SIMULAR) {
      const { count } = await filtro(supabase.from(tabla).select('*', { count: 'exact', head: true }));
      console.log(`[SIMULACIÓN] Borraría de "${tabla}": ${count ?? 0} filas`);
    } else {
      const { error, count } = await filtro(supabase.from(tabla).delete({ count: 'exact' }));
      if (error) throw new Error(`Delete en ${tabla} falló: ${error.message}`);
      console.log(`✅ Borradas de "${tabla}": ${count ?? '?'} filas`);
    }
  }

  console.log(SIMULAR
    ? '\nNada se borró. Cambia "const SIMULAR = true" a "false" para ejecutar de verdad.'
    : '\n✅ Limpieza completa.');
}

run().catch((err) => {
  console.error('❌ Error inesperado:', err);
  process.exit(1);
});
