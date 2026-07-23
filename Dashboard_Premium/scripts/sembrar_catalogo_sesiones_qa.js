// Siembra datos QA para el catálogo de ejercicios (PR #127/#130): plantillas de
// Modo Cancha (catalogo_sesiones) con drills reales + una sesión de historial en
// sesiones_control con drills reales y un id huérfano. Ejercita dos flujos que
// hoy no tienen cobertura E2E:
//   - PantallaObjetivo del Modo Cancha (paso "Objetivo de la sesión"), que solo
//     aparece si hay plantillas visibles para el coach (hasPlantillas=true).
//   - El selector + historial de AdminSesiones (chips de drills, "Ejercicio
//     eliminado").
//
// Dos usos, mismas funciones:
//   - CLI:     node scripts/sembrar_catalogo_sesiones_qa.js
//   - Cypress: cy.task('sembrarPlantillasCanchaQA') / cy.task('sembrarSesionControlHistorialQA')
//     — los specs siembran su propia precondición. Ver cypress.config.js y
//     cypress/e2e/catalogo_ejercicios.cy.js.
//
// Idempotente/repetible: cada función borra sus propios artefactos [QA] antes de
// insertar, acotada al coach/atleta QA (buscados por cédula). Nunca toca datos
// reales de ningún club.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local. Como módulo
// lanza Error en vez de process.exit(): un exit aquí se llevaría por delante al
// runner de Cypress (solo el bloque CLI del final puede hacer exit).

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CEDULA_COACH = 'QA-COACH-001';
const CEDULA_ATLETA = 'QA-ATLETA-001';
// club_id de catalogo_sesiones es TEXT: el string exacto del club QA (ver el
// valor real en scripts/crear_cuentas_prueba.js → const CLUB = 'QA Demo Club').
const CLUB_QA = 'QA Demo Club';
// Id inexistente en ejercicios_catalogo → fuerza el chip "Ejercicio eliminado".
const DRILL_HUERFANO = '00000000-0000-0000-0000-000000000000';

function cliente() {
  // El env se resuelve aquí, no al importar: como task se importa desde
  // cypress.config.js, y un fallo al importar rompería toda la config.
  process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Dashboard_Premium/.env.local');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function hoy() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Hasta 3 drills reales de un `tipo` del catálogo, preferentemente de nivel
 * Desarrollo (el nivel del atleta QA). Si el filtro por nivel devuelve <2 (o el
 * tipo no tiene drills de ese nivel), cae al mismo `tipo` sin filtro de nivel.
 * Devuelve [{ id, nombre }].
 */
async function drillsDeTipo(supabase, tipo) {
  const { data: conNivel } = await supabase
    .from('ejercicios_catalogo')
    .select('id, nombre')
    .eq('tipo', tipo)
    .contains('grupos_recomendados', ['Desarrollo'])
    .order('nombre')
    .limit(3);
  if (conNivel && conNivel.length >= 2) return conNivel;
  const { data: sinFiltro } = await supabase
    .from('ejercicios_catalogo')
    .select('id, nombre')
    .eq('tipo', tipo)
    .order('nombre')
    .limit(3);
  return sinFiltro || [];
}

/**
 * Deja al club QA con exactamente 2 plantillas [QA] en catalogo_sesiones, de
 * pilares distintos (físico/fuerza y mental/táctica) para ejercitar el agrupado
 * por pilar de PantallaObjetivo, cada una con drills reales del catálogo.
 * @returns {Promise<{ plantillas: Array<{ titulo: string, drills: string[] }> }>}
 */
export async function sembrarPlantillasCanchaQA() {
  const supabase = cliente();

  const { data: coach } = await supabase
    .from('usuarios')
    .select('id, club')
    .eq('cedula', CEDULA_COACH)
    .maybeSingle();
  if (!coach) throw new Error('Falta el coach QA (QA-COACH-001). Corré scripts/crear_cuentas_prueba.js.');

  // Fuerza → drills físicos. Táctica → drills tácticos (o técnicos si Táctico no
  // tuviera de nivel Desarrollo). El pilar/sub_pilar de la plantilla es lo que
  // agrupa PantallaObjetivo; los drills son solo su contenido.
  const fisicos = await drillsDeTipo(supabase, 'Físico');
  let tacticos = await drillsDeTipo(supabase, 'Táctico');
  if (tacticos.length < 2) tacticos = await drillsDeTipo(supabase, 'Técnico');

  if (fisicos.length < 1 || tacticos.length < 1) {
    throw new Error('ejercicios_catalogo está vacío. Corré scripts/seed_ejercicios_catalogo.mjs primero.');
  }

  // Idempotencia: borra las plantillas [QA] previas del club antes de insertar.
  await supabase.from('catalogo_sesiones').delete().eq('club_id', CLUB_QA).ilike('titulo', '[QA]%');

  // ejercicios_ids es jsonb → array JS directo (sin JSON.stringify). pilar/sub_pilar
  // validan contra taxonomia.js: fuerza→fisico, tactica→mental (pilares distintos).
  const plantillas = [
    {
      titulo: '[QA] Físico - Fuerza',
      enfoque_principal: 'Fuerza',
      descripcion: 'Plantilla QA de fuerza.',
      pilar: 'fisico',
      sub_pilar: 'fuerza',
      tipo_clase: 'Grupal (Niveles)',
      ejercicios_ids: fisicos.map((d) => d.id),
      creado_por: coach.id,
      club_id: CLUB_QA,
      activa: true,
    },
    {
      titulo: '[QA] Táctico - Eficiencia',
      enfoque_principal: 'Táctica',
      descripcion: 'Plantilla QA de eficiencia táctica.',
      pilar: 'mental',
      sub_pilar: 'tactica',
      tipo_clase: 'Grupal (Niveles)',
      ejercicios_ids: tacticos.map((d) => d.id),
      creado_por: coach.id,
      club_id: CLUB_QA,
      activa: true,
    },
  ];

  const { error } = await supabase.from('catalogo_sesiones').insert(plantillas);
  if (error) throw new Error(`Falló insertar las plantillas QA: ${error.message}`);

  return {
    plantillas: [
      { titulo: '[QA] Físico - Fuerza', drills: fisicos.map((d) => d.nombre) },
      { titulo: '[QA] Táctico - Eficiencia', drills: tacticos.map((d) => d.nombre) },
    ],
  };
}

/**
 * Deja al coach QA con exactamente una sesión de historial [QA] en
 * sesiones_control, con 2 drills reales + un id huérfano (para el chip
 * "Ejercicio eliminado" de AdminSesiones).
 * @returns {Promise<{ drillsReales: string[] }>}
 */
export async function sembrarSesionControlHistorialQA() {
  const supabase = cliente();

  const { data: coach } = await supabase
    .from('usuarios')
    .select('id')
    .eq('cedula', CEDULA_COACH)
    .maybeSingle();
  if (!coach) throw new Error('Falta el coach QA (QA-COACH-001). Corré scripts/crear_cuentas_prueba.js.');

  const { data: atletaU } = await supabase
    .from('usuarios')
    .select('id')
    .eq('cedula', CEDULA_ATLETA)
    .maybeSingle();
  if (!atletaU) throw new Error('Falta el atleta QA (QA-ATLETA-001). Corré scripts/crear_cuentas_prueba.js.');
  const { data: atleta } = await supabase
    .from('atletas')
    .select('id')
    .eq('usuario_id', atletaU.id)
    .maybeSingle();
  if (!atleta) throw new Error('El atleta QA no tiene fila en atletas.');

  // Idempotencia: borra las sesiones de historial [QA] previas del coach.
  await supabase.from('sesiones_control').delete().eq('coach_id', coach.id).ilike('objetivo_descripcion', '[QA]%');

  // 2 drills reales (cualquier tipo) → sus ids alimentan los chips resueltos.
  const { data: drills } = await supabase
    .from('ejercicios_catalogo')
    .select('id, nombre')
    .order('nombre')
    .limit(2);
  if (!drills || drills.length < 2) {
    throw new Error('ejercicios_catalogo está vacío. Corré scripts/seed_ejercicios_catalogo.mjs primero.');
  }

  // tipo = 'Individual' (no 'Privada 1v1'): el CHECK sesiones_control_tipo_check
  // en prod solo admite 'Grupal' | 'Individual'. Una sesión individual con
  // atleta_id encaja en la RLS ses_control_staff (club del atleta = club del
  // coach) → el coach QA la ve en su historial. ejercicios_ids es uuid[] → array
  // JS directo; el 3er id es un huérfano (no existe en el catálogo).
  const { error } = await supabase.from('sesiones_control').insert({
    tipo: 'Individual',
    atleta_id: atleta.id,
    grupo_id: null,
    coach_id: coach.id,
    fecha: hoy(),
    objetivo_tipo: 'Físico',
    objetivo_descripcion: '[QA] Historial con drills',
    ejercicios_ids: [drills[0].id, drills[1].id, DRILL_HUERFANO],
  });
  if (error) throw new Error(`Falló insertar la sesión de historial QA: ${error.message}`);

  return { drillsReales: [drills[0].nombre, drills[1].nombre] };
}

// CLI solo al ejecutarlo directamente; importarlo como task no dispara nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('=== Seed catálogo de sesiones QA (plantillas + historial) ===');
  (async () => {
    const p = await sembrarPlantillasCanchaQA();
    console.log('✅ Plantillas de Modo Cancha sembradas:');
    p.plantillas.forEach((pl) => console.log(`   • ${pl.titulo} → drills: ${pl.drills.join(', ')}`));
    const h = await sembrarSesionControlHistorialQA();
    console.log(`✅ Sesión de historial [QA]: drills reales = ${h.drillsReales.join(', ')} + 1 huérfano (Ejercicio eliminado).`);
  })().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
  });
}
