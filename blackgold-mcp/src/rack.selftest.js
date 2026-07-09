// Smoke del rack documental: `npm run rack` (o `node src/rack.selftest.js "consulta"`).
// No toca Supabase — solo indexación y recuperación locales.
//
// Además de las consultas de humo, valida la capa semántica:
//   - FALLA (exit 1) si hay etiquetas/vocabulario fuera de la taxonomía (avisos).
//   - ADVIERTE si un sub-pilar tiene < MIN_CHUNKS fragmentos etiquetados (salud del corpus).
//   - GOLDEN QUERIES: una consulta por sub-pilar; advierte si ningún doc esperado
//     aparece en el top-3. Es la métrica que decide si BM25+etiquetas alcanza o si
//     algún día hay que saltar a embeddings (ver plan semántico, Fase C).
import { buscarRack, inventarioRack } from "../../packages/brain-core/rack.js";

const MIN_CHUNKS = 3;

// Docs esperados por sub-pilar. Incluyen docs del plan de corpus aún no redactados
// (taxonomia_pilares_subpilares, recuperacion_carga_descanso, trabajo_casa_atleta):
// la advertencia se resuelve sola cuando se engorde el corpus.
const GOLDEN = [
  { subpilar: "fuerza", consulta: "fuerza ejercicios entrenamiento progresión edad", esperados: ["manual_entrenamiento.md", "taxonomia_pilares_subpilares.md", "fundamentos_iniciacion_vinueza.md", "baremos_cientificos.md"] },
  { subpilar: "explosividad", consulta: "explosividad salto CMJ umbrales edad", esperados: ["baremos_cientificos.md", "taxonomia_pilares_subpilares.md", "manual_entrenamiento.md"] },
  { subpilar: "resistencia", consulta: "resistencia aeróbica prueba course navette edad", esperados: ["taxonomia_pilares_subpilares.md", "manual_entrenamiento.md", "baremos_cientificos.md", "fundamentos_iniciacion_vinueza.md"] },
  { subpilar: "movilidad", consulta: "movilidad flexibilidad rutina estiramiento edad", esperados: ["manual_entrenamiento.md", "taxonomia_pilares_subpilares.md", "baremos_cientificos.md", "fundamentos_iniciacion_vinueza.md"] },
  { subpilar: "tiro", consulta: "tiro técnica ejercicios progresión edad", esperados: ["manual_entrenamiento.md", "taxonomia_pilares_subpilares.md", "baremos_cientificos.md"] },
  { subpilar: "agilidad", consulta: "agilidad cambio dirección prueba umbrales", esperados: ["baremos_cientificos.md", "taxonomia_pilares_subpilares.md", "manual_entrenamiento.md"] },
  { subpilar: "tactica", consulta: "tactica lectura de juego desarrollo por categoría", esperados: ["tactica_small_ball.md", "taxonomia_pilares_subpilares.md"] },
  { subpilar: "resiliencia", consulta: "resiliencia mentalidad ejercicios presión", esperados: ["mentalidad_mamba.md", "taxonomia_pilares_subpilares.md"] },
  { subpilar: "recuperacion", consulta: "recuperación sueño hidratación fatiga carga descanso", esperados: ["recuperacion_carga_descanso.md", "trabajo_casa_atleta.md", "manual_entrenamiento.md"] },
  { subpilar: "composicion_corporal", consulta: "composición corporal antropometría peso talla", esperados: ["taxonomia_pilares_subpilares.md", "fundamentos_iniciacion_vinueza.md", "baremos_cientificos.md"] },
];

const inv = inventarioRack();
console.log(`Rack: ${inv.documentos.length} documento(s), ${inv.totalFragmentos} fragmento(s), áreas: ${inv.areas.join(", ")}\n`);
inv.documentos.forEach(d =>
  console.log(`  - [${d.area}] ${d.archivo} — "${d.titulo}" (${d.secciones} secciones, ${d.fragmentos} fragmentos${d.subpilares?.length ? `, sub-pilares: ${d.subpilares.join("/")}` : ""})`));

// --- Validación dura: etiquetas/vocabulario fuera de la taxonomía ---
if (inv.avisos && inv.avisos.length) {
  console.error(`\n❌ ETIQUETAS FUERA DE LA TAXONOMÍA (corregir frontmatter/config/vocabulario):`);
  inv.avisos.forEach(a => console.error(`  - ${a}`));
}

// --- Salud del corpus por sub-pilar ---
console.log(`\nSalud del corpus (fragmentos etiquetados por sub-pilar, mínimo deseado ${MIN_CHUNKS}):`);
const flacos = [];
for (const [sp, n] of Object.entries(inv.porSubPilar || {})) {
  const marca = n >= MIN_CHUNKS ? "  " : "⚠️";
  if (n < MIN_CHUNKS) flacos.push(sp);
  console.log(`  ${marca} ${sp.padEnd(22)} ${n}`);
}
if (flacos.length) console.log(`  → Engordar/etiquetar corpus para: ${flacos.join(", ")}`);

// --- Consulta custom o suite ---
const consultas = process.argv[2]
  ? [process.argv[2]]
  : [
      "fases sensibles fuerza edad iniciación",
      "umbrales salto vertical CMJ Sub15",
      "detección de talentos batería pruebas Ecuador",
      "recuperación sueño hidratación fatiga",
      "mentalidad competitiva resiliencia",
    ];

for (const q of consultas) {
  console.log(`\n▶ "${q}"`);
  const hits = buscarRack(q, { k: 3 });
  if (hits.length === 0) {
    console.log("  (sin resultados)");
    continue;
  }
  hits.forEach(h =>
    console.log(`  ${h.score.toFixed(2).padStart(6)}  [${h.archivo} › ${h.seccion}]  ${h.texto.slice(0, 90).replace(/\s+/g, " ")}…`));
}

// --- Golden queries por sub-pilar (solo en modo suite) ---
if (!process.argv[2]) {
  console.log(`\nGolden queries por sub-pilar (doc esperado en top-3):`);
  let aciertos = 0;
  for (const g of GOLDEN) {
    const hits = buscarRack(g.consulta, { k: 3 });
    const ok = hits.some(h => g.esperados.includes(h.archivo));
    if (ok) aciertos++;
    console.log(`  ${ok ? "✅" : "⚠️"} ${g.subpilar.padEnd(22)} "${g.consulta}"${ok ? "" : ` → top-3: ${hits.map(h => h.archivo).join(", ") || "(vacío)"}`}`);
  }
  console.log(`  → ${aciertos}/${GOLDEN.length} golden queries con doc esperado en top-3.`);
}

if (inv.avisos && inv.avisos.length) {
  process.exit(1);
}
