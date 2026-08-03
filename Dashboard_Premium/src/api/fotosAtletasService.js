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

// TTL bajado de 3600 a 600 en la revisión de seguridad (retratos de menores en
// un bucket privado): una URL firmada es un bearer token — cualquiera que la
// tenga ve la foto sin volver a autenticarse — y una hora entera de vigencia
// es una hora entera de exposición si el link se filtra (un historial de
// navegador compartido, un log de proxy, un reenvío accidental). 10 minutos
// sigue sobrando para que el navegador la descargue y la pinte.
const TTL_FIRMA_S = 600;             // vida de la firma en el servidor
// Con el TTL en 1 hora, 5 min de margen eran ~8% de la vida útil. Con el TTL ya
// en 600 s, ese mismo margen se habría comido la MITAD del caché (300 s de
// vigencia real de 600 s), disparando el doble de refirmas sin necesidad.
// Se ajusta a 1 min: sigue siendo margen de sobra frente a la deriva de reloj
// y la latencia de red que este colchón existe para absorber, sin sacrificar
// la mayor parte del TTL.
const MARGEN_MS = 60 * 1000;         // se da por muerta 1 min antes de que caduque
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
 * La foto como data URL, para html2canvas.
 *
 * Capturar la URL firmada directamente es una trampa silenciosa: html2canvas
 * puede disparar antes de que la imagen remota termine de cargar y produce un
 * PDF sin cara, sin lanzar ningún error. Embebida, no hay red ni CORS de por
 * medio en el momento de la captura.
 */
export async function getFotoDataUrl(path) {
  const url = await getFotoUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve(typeof lector.result === 'string' ? lector.result : null);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null; // el PDF sale con el placeholder, no roto
  }
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
 * `opciones.preparada` permite pasar el resultado de prepararImagen cuando ya
 * se procesó para la vista previa: reprocesar una foto de 8 MB por segunda vez
 * en un móvil es medio segundo regalado.
 *
 * @returns {Promise<{path: string, signedUrl: string|null}>}
 */
export async function subirFotoAtleta(atletaId, file, opciones = {}) {
  if (!atletaId) throw new Error('Falta el atleta.');

  const { preparada = null, ...opcionesImagen } = opciones;
  const { blob, ext } = preparada || await prepararImagen(file, opcionesImagen);
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
 *
 * Pagina el listado en vez de traer una sola página de 100: un atleta con más
 * fotos que eso (histórico migrado, o simplemente muchos reemplazos a lo largo
 * de los años — cada subida deja la anterior pendiente de este borrado si
 * `borrarObjeto` llegó a fallar alguna vez) dejaba huérfanas, para siempre,
 * exactamente las fotos que no cupieran en la primera página — justo lo que
 * esta función existe para evitar.
 */
export async function purgarFotosDeAtleta(atletaId) {
  if (!atletaId) return;

  const limite = LOTE_MAX;
  let offset = 0;
  const objetos = [];
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET_FOTOS)
      .list(String(atletaId), { limit: limite, offset });
    if (error) return; // mismo comportamiento que antes: nada más que hacer
    if (!data?.length) break;
    objetos.push(...data);
    if (data.length < limite) break; // última página
    offset += limite;
  }
  if (!objetos.length) return;

  const paths = objetos.map((o) => `${atletaId}/${o.name}`);
  // Se borra en los mismos lotes de 100 con los que se listó: remove() no
  // documenta un tope, pero no hay motivo para mandarle de una vez más de lo
  // que esta misma función jamás pidió de una vez.
  for (let i = 0; i < paths.length; i += limite) {
    const lote = paths.slice(i, i + limite);
    try { await supabase.storage.from(BUCKET_FOTOS).remove(lote); } catch { /* best-effort */ }
  }
  paths.forEach(invalidarFotoUrl);
}

async function borrarObjeto(path, excepto = null) {
  if (!path || path === excepto) return;
  try { await supabase.storage.from(BUCKET_FOTOS).remove([path]); } catch { /* best-effort */ }
  invalidarFotoUrl(path);
}
