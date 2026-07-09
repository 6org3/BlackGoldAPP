// ============================================================
// RACK DOCUMENTAL DEPORTIVO — brain-core (Black Gold)
// ============================================================
// Corpus local de documentación específica del deporte (metodología
// de iniciación, baremos científicos, entrenamiento, táctica,
// mentalidad, referencias académicas) indexado en memoria con
// recuperación léxica BM25. Vive en packages/brain-core (la capa
// compartida de "lógica de las tools"): hoy lo consume blackgold-mcp
// para fundamentar diagnósticos, misiones y pruebas en las fuentes
// del club, y las Edge Functions (copiloto) usan el mismo motor con
// el corpus pre-generado.
//
// Este módulo es el LOADER Node-only: lee el corpus desde disco
// (rack.config.json + knowledge/ + RACK_DIRS) y expone la API pública
// de siempre (buscarRack/contextoRack/inventarioRack + los helpers
// extraerFrontmatter/partirEnChunks) sobre el motor PURO de
// rackMotor.js. Ese motor (tokenización, BM25, chunking) es portable
// a Deno y se sincroniza a supabase/functions/_shared/brain-core junto
// con el corpus generado (`npm run functions:sync` en Dashboard_Premium
// escribe rack-corpus.generado.js a partir de corpusCrudo()).
//
// Fuentes: blackgold-mcp/knowledge/rack.config.json (manifest
// declarativo — el corpus sigue viviendo en blackgold-mcp/knowledge/).
// Cada entrada apunta a un archivo o carpeta (.md/.txt) con su área
// temática. La env RACK_DIRS (rutas separadas por ';') añade carpetas
// extra sin tocar el repo.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  normalizar,
  extraerFrontmatter,
  partirEnChunks,
  construirIndiceRack,
  buscarEnIndice,
  contextoEnIndice,
  inventarioDeIndice,
} from "./rackMotor.js";

// La API pública conserva estos helpers (los usan blackgold-mcp y tests).
export { extraerFrontmatter, partirEnChunks };

// El corpus NO se movió con el código: sigue viviendo en blackgold-mcp/knowledge/
// (ver su README para añadir documentación nueva).
const KNOWLEDGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "blackgold-mcp", "knowledge");
const CONFIG_PATH = path.join(KNOWLEDGE_DIR, "rack.config.json");

// --------------------------------------------------------------
// Carga del corpus desde disco (config + carpetas extra + dedup)
// --------------------------------------------------------------

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

// Corpus crudo: los documentos leídos de disco, listos para el motor
// (construirIndiceRack) y para el generador del espejo Deno
// (Dashboard_Premium/scripts/sync_edge_shared.mjs → rack-corpus.generado.js).
// Cada documento: { id, titulo, area, subPilares, cuerpo } — las etiquetas
// van SIN validar (la validación con avisos la hace el motor).
export function corpusCrudo() {
  const documentos = [];
  const vistos = new Set(); // dedup por ruta absoluta (config + RACK_DIRS pueden solaparse)

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
      documentos.push({
        id: nombre,
        titulo: tituloDeDoc(cuerpo, archivo),
        area: meta.area || fuente.area,
        subPilares: [...new Set([...(fuente.subpilares || []), ...(meta.subpilares || [])])],
        cuerpo,
      });
    }
  }
  return documentos;
}

// --------------------------------------------------------------
// Índice perezoso (una vez por proceso) + API pública de siempre
// --------------------------------------------------------------

let indice = null;

function getIndice() {
  if (!indice) {
    indice = construirIndiceRack(corpusCrudo());
    console.error(`[rack] Indexados ${indice.docs.length} documento(s), ${indice.N} fragmento(s).`);
  }
  return indice;
}

export function buscarRack(query, opts = {}) {
  return buscarEnIndice(getIndice(), query, opts);
}

// Nunca lanza: si la carga/búsqueda falla, devuelve "" (las tools deben
// funcionar igual sin rack — nunca es un error).
export function contextoRack(query, opts = {}) {
  let idx;
  try {
    idx = getIndice();
  } catch (err) {
    console.error(`[rack] contextoRack falló (se continúa sin rack): ${err.message}`);
    return "";
  }
  return contextoEnIndice(idx, query, opts);
}

export function inventarioRack() {
  return inventarioDeIndice(getIndice());
}
