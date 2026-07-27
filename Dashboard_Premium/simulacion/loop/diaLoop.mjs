// loop/diaLoop.mjs — Orquestador del LOOP DIARIO progresivo.
//
// Uso:
//   node simulacion/loop/diaLoop.mjs            # DRY-RUN: no escribe, solo plan
//   SIM_REAL=1 node simulacion/loop/diaLoop.mjs # escribe contra staging
//   SIM_DIAS=120 SIM_SEED=7 SIM_REAL=1 node simulacion/loop/diaLoop.mjs
//
// Variables (todas opcionales):
//   SIM_REAL=1        escribir de verdad (default: dry-run seguro)
//   SIM_DIAS=90       cuántos días de club simular en esta corrida
//   SIM_INICIO=2025-09-01   fecha virtual de arranque
//   SIM_SEED=42       semilla del RNG (reproducible)
//   SIM_CHECKPOINT=7  cada cuántos días correr invariantes
//   SIM_STAGING_URL   URL de tu proyecto de STAGING (guardarraíl anti-producción)

import { admin, guardado, REAL, SUPA_URL } from '../core/supa.mjs';
import { crearRng } from '../core/rng.mjs';
import { crearReloj } from '../core/reloj.mjs';
import { crearReporte } from '../core/reporte.mjs';
import { cargarEstado, CLUB } from '../core/estado.mjs';
import { faseDeDia, FASES } from '../config/fases.mjs';
import { acciones } from '../acciones/index.mjs';
import { correrInvariantes } from '../invariantes/index.mjs';

const DIAS = Number(process.env.SIM_DIAS || 90);
const CHECKPOINT = Number(process.env.SIM_CHECKPOINT || 7);

// Orden en que se disparan las acciones dentro de un día.
const ORDEN = ['altaCoach', 'altaAtleta', 'asistencia', 'evaluacion', 'mision', 'pago', 'evento', 'comunicacion', 'baja'];

async function ensureGrupos(rng, reporte) {
  const nombres = [...new Set(FASES.flatMap((f) => f.grupos))];
  for (const nombre of nombres) {
    const { data: ya } = await admin.from('grupos_entrenamiento').select('id').eq('nombre', nombre).ilike('descripcion', '%simulaci%').maybeSingle();
    if (ya) continue;
    await guardado(`grupo ${nombre}`, () =>
      admin.from('grupos_entrenamiento').insert({ nombre, descripcion: `Grupo ${nombre} — club de simulación (loop diario)` })
        .then(({ error }) => { if (error) throw new Error(error.message); }));
    reporte.accion({ tipo: 'ensureGrupo', nombre });
  }
}

async function main() {
  console.log(`\n🏀 Simulación Black Gold — loop diario`);
  console.log(`   Modo: ${REAL ? '✍️  REAL (escribe)' : '🧪 DRY-RUN (no escribe)'}  ·  URL: ${SUPA_URL}`);
  console.log(`   Días: ${DIAS}  ·  Checkpoint invariantes: cada ${CHECKPOINT}  ·  Club: "${CLUB}"\n`);

  const rng = crearRng();
  const reloj = crearReloj();
  const reporte = crearReporte('loop');

  await ensureGrupos(rng, reporte);

  for (let d = 0; d < DIAS; d++) {
    const fase = faseDeDia(reloj.diaNumero);
    const estado = await cargarEstado(); // reanudable: relee el club cada día
    const ctx = { estado, reloj, rng, reporte, fase };

    for (const nombre of ORDEN) {
      if (!fase.activas.includes(nombre)) continue;
      const fn = acciones[nombre];
      if (!fn) continue;
      const t0 = performance.now();
      try { await fn(ctx); }
      catch (e) { reporte.error({ msg: `accion ${nombre} @ ${reloj.iso}: ${e.message}` }); }
      reporte.latencia(performance.now() - t0);
    }

    reporte.dia({ dia: reloj.diaNumero, fecha: reloj.iso, fase: fase.nombre, atletas: estado.atletas.length });

    if (reloj.diaNumero % CHECKPOINT === 0) {
      console.log(`  ── checkpoint día ${reloj.diaNumero} (${fase.nombre}) — corriendo invariantes…`);
      await correrInvariantes({ ...ctx, estado: await cargarEstado() });
    }
    reloj.avanzar(1);
  }

  const { md, metricas } = reporte.resumen();
  console.log(`\n✅ Fin. ${metricas.hallazgos} hallazgo(s). Ver ${md}`);
  if (!REAL) console.log('   (fue dry-run: nada se escribió. Con SIM_REAL=1 se ejecuta contra staging.)');
}

main().catch((e) => { console.error('💥', e); process.exit(1); });
