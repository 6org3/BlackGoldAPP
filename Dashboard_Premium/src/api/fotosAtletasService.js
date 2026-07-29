// src/api/fotosAtletasService.js
//
// Foto de identificación del atleta (v53). El bucket es privado, así que en la
// columna `atletas.foto_path` vive un PATH y las URLs se firman al leer.
//
// Vive en su propio servicio y no dentro de atletasService porque la caché de
// firmas la necesitan también padreService, el portal del atleta y el PDF de
// scouting, y atletasService ya importa de authService (ciclo de imports).

import { supabase } from './supabaseClient';
import { prepararImagen } from '../lib/imagenPerfil';

export const BUCKET_FOTOS = 'fotos-atletas';

const TTL_FIRMA_S = 3600;            // vida de la firma en el servidor
const MARGEN_MS = 5 * 60 * 1000;     // se da por muerta 5 min antes de que caduque
const TTL_FALLO_MS = 60 * 1000;      // negative caching corto
const LOTE_MAX = 100;                // tope por petición de firma

/** path -> { url: string|null, expiraEn: number } */
const cacheUrls = new Map();

// Micro-batching: todos los avatares que se monten en el mismo tick comparten
// UNA sola petición de firma. Sin esto, /admin/atletas con 100 tarjetas haría
// 100 round-trips por render — el bug de rendimiento más probable de esta
// feature. Cada componente pide su URL sin tener que coordinarse con los demás.
let cola = new Set();
let promesaCola = null;

const vigente = (entrada, ahora) => Boolean(entrada) && entrada.expiraEn > ahora;

function sufijoAleatorio() {
  // randomUUID no existe en contextos no seguros (http://ip-local:5173).
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(16).slice(2, 10);
}

async function firmarLote(lote) {
  const ahora = Date.now();
  const { data, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .createSignedUrls(lote, TTL_FIRMA_S);

  if (error || !Array.isArray(data)) {
    // Fallo global (red, sesión caída): negative caching para no reintentar en
    // cada re-render.
    for (const path of lote) cacheUrls.set(path, { url: null, expiraEn: ahora + TTL_FALLO_MS });
    return;
  }

  data.forEach((item, i) => {
    // El error de createSignedUrls es POR ÍTEM, no global: un path borrado o
    // rechazado por RLS vuelve con error y el resto del lote se firma igual.
    // `item.path` puede venir null en los fallidos → fallback al índice.
    const path = item?.path || lote[i];
    const url = item?.error ? null : (item?.signedUrl || null);
    cacheUrls.set(path, url
      ? { url, expiraEn: ahora + TTL_FIRMA_S * 1000 - MARGEN_MS }
      : { url: null, expiraEn: ahora + TTL_FALLO_MS });
  });
}

async function firmarTodos(paths) {
  const lotes = [];
  for (let i = 0; i < paths.length; i += LOTE_MAX) lotes.push(paths.slice(i, i + LOTE_MAX));
  await Promise.all(lotes.map(firmarLote));
}

function programarFirma(path) {
  cola.add(path);
  if (!promesaCola) {
    promesaCola = new Promise((resolve) => {
      setTimeout(() => {
        const lote = [...cola];
        cola = new Set();
        promesaCola = null;
        firmarTodos(lote).then(resolve, resolve);
      }, 0);
    });
  }
  return promesaCola;
}

/**
 * URLs firmadas de varias fotos. Los paths ya cacheados no generan petición.
 * @returns {Promise<Map<string, string|null>>}
 */
export async function getFotosUrls(paths) {
  const salida = new Map();
  const unicos = [...new Set((paths || []).filter(Boolean))];
  if (!unicos.length) return salida;

  const ahora = Date.now();
  const faltan = unicos.filter((p) => !vigente(cacheUrls.get(p), ahora));
  if (faltan.length) await Promise.all(faltan.map(programarFirma));

  for (const p of unicos) salida.set(p, cacheUrls.get(p)?.url ?? null);
  return salida;
}

/** URL firmada de una foto. Comparte lote con las demás del mismo tick. */
export async function getFotoUrl(path) {
  if (!path) return null;
  const urls = await getFotosUrls([path]);
  return urls.get(path) ?? null;
}

/**
 * Olvida una URL. Llamar desde el onError del <img>: cubre la firma caducada
 * mientras la pestaña seguía abierta (incluido el portátil que despierta de
 * suspensión con el reloj saltado, que ningún TTL detecta).
 */
export function invalidarFotoUrl(path) {
  if (path) cacheUrls.delete(path);
}

/**
 * Vacía la caché. OBLIGATORIO en el cierre de sesión: son URLs firmadas y
 * vivas a rostros de menores, y sin esto sobrevivirían al cambio de usuario en
 * el mismo navegador.
 */
export function limpiarCacheFotos() {
  cacheUrls.clear();
  cola = new Set();
  promesaCola = null;
}

/**
 * Sube la foto y deja la fila apuntando a ella.
 *
 * Se sube ANTES de escribir la fila a propósito: el estado intermedio malo
 * (objeto sin fila) es basura invisible y recuperable; el inverso (fila
 * apuntando a un objeto inexistente) es un avatar roto para todo el que vea a
 * ese atleta.
 *
 * @returns {Promise<{path: string, signedUrl: string|null}>}
 */
export async function subirFotoAtleta(atletaId, file, opciones = {}) {
  if (!atletaId) throw new Error('Falta el atleta.');

  const { blob, ext } = await prepararImagen(file, opciones);
  const path = `${atletaId}/${Date.now()}-${sufijoAleatorio()}.${ext}`;

  const { error: eUp } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (eUp) throw eUp;

  const { data, error } = await supabase.rpc('establecer_foto_atleta', {
    p_atleta_id: atletaId,
    p_path: path,
  });

  if (error) {
    // Compensación best-effort: que un fallo de la RPC no deje el objeto
    // huérfano en el bucket.
    try { await supabase.storage.from(BUCKET_FOTOS).remove([path]); } catch { /* nada que hacer */ }
    throw error;
  }

  await borrarObjeto(data?.path_anterior, path);
  const signedUrl = await getFotoUrl(path);
  return { path, signedUrl };
}

/** Quita la foto: limpia la fila y borra el objeto. */
export async function eliminarFotoAtleta(atletaId) {
  if (!atletaId) throw new Error('Falta el atleta.');
  const { data, error } = await supabase.rpc('establecer_foto_atleta', {
    p_atleta_id: atletaId,
    p_path: null,
  });
  if (error) throw error;
  await borrarObjeto(data?.path_anterior);
}

/**
 * Borra TODA la carpeta del atleta, incluidos huérfanos de subidas fallidas.
 * Llamar ANTES de eliminar la fila: al perderse foto_path el objeto quedaría
 * inalcanzable para siempre, con la cara de un menor dentro.
 */
export async function purgarFotosDeAtleta(atletaId) {
  if (!atletaId) return;
  const { data, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .list(String(atletaId), { limit: 100 });
  if (error || !data?.length) return;

  const paths = data.map((o) => `${atletaId}/${o.name}`);
  try { await supabase.storage.from(BUCKET_FOTOS).remove(paths); } catch { /* best-effort */ }
  paths.forEach(invalidarFotoUrl);
}

async function borrarObjeto(path, excepto = null) {
  if (!path || path === excepto) return;
  try { await supabase.storage.from(BUCKET_FOTOS).remove([path]); } catch { /* best-effort */ }
  invalidarFotoUrl(path);
}
