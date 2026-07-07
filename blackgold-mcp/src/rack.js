// ============================================================
// RACK DOCUMENTAL DEPORTIVO del MCP Black Gold
// ============================================================
// Corpus local de documentación específica del deporte (metodología
// de iniciación, baremos científicos, entrenamiento, táctica,
// mentalidad, referencias académicas) indexado en memoria con
// recuperación léxica BM25. Las tools del MCP lo consultan para
// fundamentar diagnósticos, misiones y pruebas en las fuentes del
// club en vez de en texto fijo en el código.
//
// Fuentes: knowledge/rack.config.json (manifest declarativo). Cada
// entrada apunta a un archivo o carpeta (.md/.txt) con su área
// temática. La env RACK_DIRS (rutas separadas por ';') añade carpetas
// extra sin tocar el repo.
//
// Sin dependencias nuevas y sin embeddings a propósito: el corpus es
// chico (decenas de KB), el proceso es local y BM25 con normalización
// de acentos + expansión de sinónimos del dominio responde bien en
// español/inglés mezclado (baremos_cientificos.md está parcialmente
// en inglés).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// Taxonomía compartida (fuente única de pilares/sub-pilares) + vocabulario semántico:
// los sinónimos del rack se derivan de aquí en runtime para que no diverjan del código.
import { SUB_PILARES, SUB_PILARES_MONITOREO } from "../../packages/analytics-core/taxonomia.js";
import { VOCABULARIO_SUBPILARES, validarVocabulario, esSubPilarValido } from "../../packages/analytics-core/vocabulario.js";

const KNOWLEDGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
const CONFIG_PATH = path.join(KNOWLEDGE_DIR, "rack.config.json");

// Chunks más largos que esto se parten por párrafos (los prompts de
// las tools tienen presupuesto de contexto acotado).
const MAX_CHUNK_CHARS = 1800;

// --------------------------------------------------------------
// Normalización y tokenización (español primero, inglés tolerado)
// --------------------------------------------------------------

const STOPWORDS = new Set([
  // español
  "a", "al", "algo", "ante", "asi", "aun", "cada", "como", "con", "cual", "cuales",
  "cuando", "de", "del", "desde", "donde", "dos", "el", "ella", "ellas", "ellos", "en",
  "entre", "era", "es", "esa", "esas", "ese", "esos", "esta", "estas", "este", "estos",
  "fue", "ha", "han", "hasta", "hay", "la", "las", "le", "les", "lo", "los", "mas",
  "mismo", "muy", "ni", "no", "nos", "o", "os", "otra", "otro", "para", "pero", "por",
  "porque", "que", "se", "segun", "ser", "si", "sin", "sobre", "son", "su", "sus",
  "tambien", "tanto", "te", "tiene", "tienen", "todo", "todos", "un", "una", "uno",
  "unos", "ya", "y",
  // inglés mínimo (docs mixtos)
  "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of",
  "on", "or", "the", "to", "with",
]);

// Sinónimos genéricos de recuperación (no taxonómicos): vocabulario de búsqueda
// que no corresponde a ningún sub-pilar. Los sinónimos de dominio se derivan de
// taxonomia.js + vocabulario.js más abajo (una sola fuente de verdad).
const SINONIMOS_GENERALES = {
  velocidad: ["speed", "sprint", "carrera"],
  deteccion: ["seleccion", "talento", "talentos"],
  prueba: ["test", "bateria", "evaluacion"],
  baremo: ["umbral", "umbrales", "norma", "normas", "percentil", "threshold"],
  nino: ["infantil", "escolar", "iniciacion"],
};

const normalizar = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function tokenizar(texto) {
  const brutos = normalizar(texto).split(/[^a-z0-9]+/);
  const tokens = [];
  for (const t of brutos) {
    if (t.length < 2 || STOPWORDS.has(t)) continue;
    tokens.push(t);
    // Sub-tokens en fronteras letra↔número: "sub15" también indexa/busca
    // como "sub" + "15" (cruza "Sub15" del código con "Sub-15" de los docs).
    const partes = t.split(/(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/);
    if (partes.length > 1) {
      partes.forEach(p => { if (p.length >= 2 && !STOPWORDS.has(p)) tokens.push(p); });
    }
  }
  return tokens;
}

// --------------------------------------------------------------
// Capa semántica: sinónimos de dominio derivados de la taxonomía
// --------------------------------------------------------------

const TODOS_SUBPILARES = [...SUB_PILARES, ...SUB_PILARES_MONITOREO];

// SINONIMOS = generales + dominio (key del sub-pilar → vocabulario ES/EN + tokens
// de su label: 'tiro' gana 'tecnica' desde 'Técnica Tiro'). Derivado en runtime
// para que nunca diverja de taxonomia.js.
// TERMINO_A_SUBPILAR: índice inverso término→keys, para detectar qué sub-pilares
// menciona una consulta y boostear los chunks etiquetados con ellos.
const SINONIMOS = { ...SINONIMOS_GENERALES };
const TERMINO_A_SUBPILAR = new Map();
for (const sp of TODOS_SUBPILARES) {
  const vocab = VOCABULARIO_SUBPILARES[sp.key] || [];
  const labelTokens = tokenizar(sp.label).filter(t => t !== sp.key);
  SINONIMOS[sp.key] = [...new Set([...vocab, ...labelTokens])];
  for (const t of [sp.key, ...SINONIMOS[sp.key]]) {
    const nt = normalizar(t);
    if (!TERMINO_A_SUBPILAR.has(nt)) TERMINO_A_SUBPILAR.set(nt, new Set());
    TERMINO_A_SUBPILAR.get(nt).add(sp.key);
  }
}

// Sub-pilares que menciona una consulta (por key, label o vocabulario).
function subPilaresDeConsulta(query) {
  const s = new Set();
  for (const t of tokenizar(query)) {
    const m = TERMINO_A_SUBPILAR.get(t);
    if (m) m.forEach(k => s.add(k));
  }
  return s;
}

// Query → términos con peso (1 los literales, 0.5 los expandidos).
function expandirConsulta(query) {
  const base = tokenizar(query);
  const pesos = new Map();
  base.forEach(t => pesos.set(t, 1));
  base.forEach(t => {
    (SINONIMOS[t] || []).forEach(sin => {
      const ns = normalizar(sin);
      if (!pesos.has(ns)) pesos.set(ns, 0.5);
    });
  });
  return pesos;
}

// --------------------------------------------------------------
// Carga del corpus: frontmatter, chunking por headings, etiquetas
// --------------------------------------------------------------

// Frontmatter YAML mínimo, sin dependencias: '---' en la línea 0 y cierre '---'
// dentro de las primeras 30 líneas (si no cierra, se trata como texto normal).
// Claves reconocidas: subpilares, area, tipo. `subpilares: [fuerza, tiro]` o
// `subpilares: fuerza, tiro`. El bloque YAML nunca entra al índice.
export function extraerFrontmatter(texto) {
  const lineas = texto.split(/\r?\n/);
  if ((lineas[0] || "").trim() !== "---") return { meta: {}, cuerpo: texto };
  let cierre = -1;
  for (let i = 1; i < Math.min(lineas.length, 31); i++) {
    if (lineas[i].trim() === "---") { cierre = i; break; }
  }
  if (cierre === -1) return { meta: {}, cuerpo: texto };
  const meta = {};
  for (let i = 1; i < cierre; i++) {
    const m = lineas[i].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const clave = m[1].toLowerCase();
    const valor = m[2].trim();
    if (clave === "subpilares") {
      meta.subpilares = valor.replace(/^\[|\]$/g, "").split(",")
        .map(s => normalizar(s.trim())).filter(Boolean);
    } else {
      meta[clave] = valor;
    }
  }
  return { meta, cuerpo: lineas.slice(cierre + 1).join("\n") };
}

// Override de etiquetas por sección: `<!-- subpilares: tiro, agilidad -->` en la
// línea siguiente a un heading (invisible en markdown renderizado). Sustituye la
// herencia del doc para esa sección; no cruza headings.
const RE_SUBPILARES_SECCION = /^<!--\s*subpilares:\s*(.+?)\s*-->$/i;

export function partirEnChunks(texto, docTitulo, docSubPilares = []) {
  // Secciona por headings de nivel 1-3; los H4+ quedan dentro del chunk.
  const lineas = texto.split(/\r?\n/);
  const chunks = [];
  let camino = [docTitulo]; // pila de headings activos por nivel
  let seccion = docTitulo;
  let buffer = [];
  let subPilaresSeccion = null; // override activo (null = heredar del doc)

  const cerrar = () => {
    const cuerpo = buffer.join("\n").trim();
    buffer = [];
    if (!cuerpo) return;
    const subPilares = subPilaresSeccion ?? docSubPilares;
    // Partición adicional de secciones largas, por párrafos.
    if (cuerpo.length <= MAX_CHUNK_CHARS) {
      chunks.push({ seccion, texto: cuerpo, subPilares });
      return;
    }
    let actual = "";
    cuerpo.split(/\n\s*\n/).forEach(parr => {
      if (actual && (actual.length + parr.length) > MAX_CHUNK_CHARS) {
        chunks.push({ seccion, texto: actual.trim(), subPilares });
        actual = "";
      }
      actual += (actual ? "\n\n" : "") + parr;
    });
    if (actual.trim()) chunks.push({ seccion, texto: actual.trim(), subPilares });
  };

  for (const linea of lineas) {
    const m = linea.match(/^(#{1,3})\s+(.*)$/);
    if (m) {
      cerrar();
      subPilaresSeccion = null;
      const nivel = m[1].length;
      camino = camino.slice(0, nivel);
      camino[nivel - 1] = m[2].trim();
      seccion = camino.filter(Boolean).join(" › ");
      continue;
    }
    const ov = linea.trim().match(RE_SUBPILARES_SECCION);
    if (ov) {
      subPilaresSeccion = ov[1].split(",").map(s => normalizar(s.trim())).filter(Boolean);
      continue; // el comentario no entra al chunk
    }
    buffer.push(linea);
  }
  cerrar();
  return chunks;
}

function leerFuentesDeConfig() {
  const fuentes = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    (cfg.fuentes || []).forEach(f => {
      if (f && f.ruta) fuentes.push({
        ruta: path.resolve(KNOWLEDGE_DIR, f.ruta),
        area: f.area || "otros",
        // Etiquetas de sub-pilar declarables por fuente (para docs/carpetas que no
        // conviene editar); el frontmatter del doc se les suma.
        subpilares: Array.isArray(f.subpilares) ? f.subpilares.map(s => normalizar(String(s).trim())).filter(Boolean) : [],
      });
    });
  } catch (err) {
    console.error(`[rack] No se pudo leer ${CONFIG_PATH}: ${err.message} — se indexa solo knowledge/.`);
    fuentes.push({ ruta: KNOWLEDGE_DIR, area: "metodologia", subpilares: [] });
  }
  // Carpetas extra del usuario, fuera del repo (p. ej. bibliografía propia).
  (process.env.RACK_DIRS || "").split(";").map(s => s.trim()).filter(Boolean)
    .forEach(dir => fuentes.push({ ruta: path.resolve(dir), area: "extra", subpilares: [] }));
  return fuentes;
}

function archivosDeFuente(fuente) {
  try {
    const st = fs.statSync(fuente.ruta);
    if (st.isFile()) return [fuente.ruta];
    if (st.isDirectory()) {
      return fs.readdirSync(fuente.ruta)
        .filter(f => /\.(md|txt)$/i.test(f))
        .map(f => path.join(fuente.ruta, f));
    }
  } catch {
    console.error(`[rack] Fuente no disponible (se omite): ${fuente.ruta}`);
  }
  return [];
}

function tituloDeDoc(texto, rutaArchivo) {
  const m = texto.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : path.basename(rutaArchivo, path.extname(rutaArchivo));
}

// --------------------------------------------------------------
// Índice BM25 en memoria (carga perezosa, una vez por proceso)
// --------------------------------------------------------------

let indice = null;

function construirIndice() {
  const docs = [];   // { id, titulo, area, fuente, subPilares }
  const chunks = []; // { docIdx, seccion, texto, tf: Map, len, tokensSeccion: Set, subPilares: Set }
  const df = new Map();
  const vistos = new Set(); // dedup por ruta absoluta (config + RACK_DIRS pueden solaparse)
  const avisos = [];        // etiquetas fuera de la taxonomía (el selftest falla si hay)

  const huerfanas = validarVocabulario();
  if (huerfanas.length) avisos.push(`vocabulario.js tiene keys fuera de la taxonomía: ${huerfanas.join(", ")}`);

  // Valida etiquetas contra taxonomia.js; devuelve solo las válidas y registra avisos.
  const validarEtiquetas = (lista, origen) => {
    const validas = [];
    for (const sp of lista || []) {
      if (esSubPilarValido(sp)) validas.push(sp);
      else avisos.push(`${origen}: sub-pilar desconocido "${sp}" (no está en taxonomia.js)`);
    }
    return validas;
  };

  for (const fuente of leerFuentesDeConfig()) {
    for (const archivo of archivosDeFuente(fuente)) {
      const clave = path.normalize(archivo).toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      // El manifest del propio rack no es documentación.
      if (path.basename(archivo).toLowerCase() === "readme.md" && path.dirname(archivo) === KNOWLEDGE_DIR) continue;
      let texto;
      try {
        texto = fs.readFileSync(archivo, "utf8");
      } catch (err) {
        console.error(`[rack] No se pudo leer ${archivo}: ${err.message}`);
        continue;
      }
      const nombre = path.basename(archivo);
      const { meta, cuerpo } = extraerFrontmatter(texto);
      const docSubPilares = validarEtiquetas(
        [...new Set([...(fuente.subpilares || []), ...(meta.subpilares || [])])],
        nombre,
      );
      const docIdx = docs.length;
      docs.push({
        id: nombre,
        titulo: tituloDeDoc(cuerpo, archivo),
        area: meta.area || fuente.area,
        fuente: archivo,
        subPilares: docSubPilares,
      });
      for (const ch of partirEnChunks(cuerpo, docs[docIdx].titulo, docSubPilares)) {
        const tokens = tokenizar(ch.texto);
        if (tokens.length === 0) continue;
        const tf = new Map();
        tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
        [...tf.keys()].forEach(t => df.set(t, (df.get(t) || 0) + 1));
        chunks.push({
          docIdx,
          seccion: ch.seccion,
          texto: ch.texto,
          tf,
          len: tokens.length,
          tokensSeccion: new Set(tokenizar(ch.seccion)),
          subPilares: new Set(validarEtiquetas(ch.subPilares, `${nombre} › ${ch.seccion}`)),
        });
      }
    }
  }

  const avgLen = chunks.length ? chunks.reduce((s, c) => s + c.len, 0) / chunks.length : 1;
  return { docs, chunks, df, avgLen, N: chunks.length, avisos: [...new Set(avisos)] };
}

function getIndice() {
  if (!indice) {
    indice = construirIndice();
    console.error(`[rack] Indexados ${indice.docs.length} documento(s), ${indice.N} fragmento(s).`);
  }
  return indice;
}

// --------------------------------------------------------------
// API pública
// --------------------------------------------------------------

const K1 = 1.5;
const B = 0.75;
const BOOST_SECCION = 0.6;  // puntos extra (por peso) si el término aparece en el heading
const BOOST_SUBPILAR = 1.0; // puntos extra si la consulta menciona un sub-pilar con el que el chunk está etiquetado

export function buscarRack(query, { k = 5, area = null, subpilar = null } = {}) {
  const idx = getIndice();
  if (idx.N === 0) return [];
  const terminos = expandirConsulta(query);
  if (terminos.size === 0) return [];
  const spConsulta = subPilaresDeConsulta(query);
  if (subpilar) spConsulta.add(subpilar);

  const resultados = [];
  for (const ch of idx.chunks) {
    if (area && idx.docs[ch.docIdx].area !== area) continue;
    if (subpilar && !ch.subPilares.has(subpilar)) continue;
    let score = 0;
    for (const [t, peso] of terminos) {
      const tf = ch.tf.get(t) || 0;
      if (tf > 0) {
        const dfT = idx.df.get(t) || 1;
        const idf = Math.log(1 + (idx.N - dfT + 0.5) / (dfT + 0.5));
        score += peso * idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * ch.len / idx.avgLen));
      }
      if (ch.tokensSeccion.has(t)) score += peso * BOOST_SECCION;
    }
    if (spConsulta.size && ch.subPilares.size) {
      for (const sp of spConsulta) {
        if (ch.subPilares.has(sp)) score += BOOST_SUBPILAR;
      }
    }
    if (score > 0) resultados.push({ ch, score });
  }

  resultados.sort((a, b) => b.score - a.score);
  return resultados.slice(0, k).map(({ ch, score }) => {
    const doc = idx.docs[ch.docIdx];
    return {
      documento: doc.titulo,
      archivo: doc.id,
      area: doc.area,
      seccion: ch.seccion,
      texto: ch.texto,
      subpilares: [...ch.subPilares],
      score: Math.round(score * 100) / 100,
    };
  });
}

// Bloque de contexto listo para inyectar en el prompt de una tool.
// Devuelve "" si el rack no tiene nada relevante (las tools deben
// funcionar igual sin rack — nunca es un error).
export function contextoRack(query, { k = 3, maxChars = 2800, area = null, subpilar = null, titulo = "CONTEXTO DEL RACK DOCUMENTAL" } = {}) {
  try {
    const hits = buscarRack(query, { k, area, subpilar });
    if (hits.length === 0) return "";
    let out = `\n=== ${titulo} (fundamentar con estas fuentes y citarlas) ===\n`;
    for (const h of hits) {
      const restante = maxChars - out.length;
      if (restante < 200) break;
      const cuerpo = h.texto.length > restante ? h.texto.slice(0, restante - 1) + "…" : h.texto;
      out += `\n[${h.archivo} › ${h.seccion}]\n${cuerpo}\n`;
    }
    return out;
  } catch (err) {
    console.error(`[rack] contextoRack falló (se continúa sin rack): ${err.message}`);
    return "";
  }
}

export function inventarioRack() {
  const idx = getIndice();
  const porDoc = idx.docs.map((d, i) => {
    const suyos = idx.chunks.filter(c => c.docIdx === i);
    const secciones = [...new Set(suyos.map(c => c.seccion))];
    return {
      archivo: d.id,
      titulo: d.titulo,
      area: d.area,
      subpilares: d.subPilares,
      fragmentos: suyos.length,
      secciones: secciones.length,
      caracteres: suyos.reduce((s, c) => s + c.texto.length, 0),
    };
  });
  const areas = [...new Set(idx.docs.map(d => d.area))];
  // Salud del corpus: cuántos chunks etiquetados tiene cada sub-pilar de la taxonomía.
  const porSubPilar = {};
  TODOS_SUBPILARES.forEach(s => { porSubPilar[s.key] = 0; });
  idx.chunks.forEach(c => c.subPilares.forEach(sp => {
    if (porSubPilar[sp] != null) porSubPilar[sp]++;
  }));
  return { documentos: porDoc, areas, totalFragmentos: idx.N, porSubPilar, avisos: idx.avisos };
}
