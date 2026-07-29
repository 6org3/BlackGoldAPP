/**
 * Prepara una foto de identificación (retrato tipo carnet) antes de subirla:
 * recorta a cuadrado, reduce a 512px y reencoda a WebP (con fallback a JPEG).
 *
 * Por qué se procesa en cliente y no se sube el archivo tal cual: una foto de
 * cámara moderna pesa 3-8 MB y el avatar se ve entre 24 y 66 px. Reencodar deja
 * ~40 KB, normaliza HEIC/PNG a un formato que el bucket acepta y aplica el
 * encuadre de carnet una sola vez, en vez de en cada render.
 *
 * Las funciones puras (rectRecorte, pasosReduccion, codificar) van separadas de
 * las que tocan el DOM y estas últimas se inyectan por `deps`, porque el
 * entorno de Vitest del repo es `node` y no hay jsdom (ver vite.config.js).
 */

export const FOTO_LADO = 512;
export const FOTO_MAX_BYTES = 120 * 1024;
export const ENTRADA_MAX_BYTES = 20 * 1024 * 1024;

/**
 * 0 = recorte pegado al borde superior, 0.5 = centrado. En una foto vertical de
 * una persona la cara vive en el tercio superior, y el hexágono del avatar
 * recorta además las esquinas: centrar dejaría el encuadre en el pecho.
 */
export const CROP_SESGO_Y = 0.30;

/**
 * Orden de intento. WebP primero (pesa ~30% menos a igual calidad); si el
 * navegador no lo sabe generar se cae a JPEG. PNG nunca: para una foto pesa
 * ~10x más que un JPEG equivalente.
 */
export const INTENTOS = [
  ['image/webp', 0.82],
  ['image/webp', 0.70],
  ['image/jpeg', 0.82],
  ['image/jpeg', 0.68],
  ['image/jpeg', 0.55],
];

const EXT_POR_TIPO = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export class ErrorFoto extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorFoto';
    this.codigo = codigo;
  }
}

/** Mensajes de cara al usuario, en español (convención del repo). */
export function validarEntrada(file) {
  if (!file) {
    throw new ErrorFoto('vacio', 'No se seleccionó ninguna imagen.');
  }
  if (!String(file.type || '').startsWith('image/')) {
    throw new ErrorFoto('formato', 'Ese archivo no es una imagen. Elige una foto JPG o PNG.');
  }
  if (file.size > ENTRADA_MAX_BYTES) {
    throw new ErrorFoto('tamano', 'La foto es demasiado grande (máximo 20 MB).');
  }
  return true;
}

/**
 * Ventana cuadrada máxima: centrada en X y sesgada hacia arriba en Y.
 * Devuelve las coordenadas de origen para drawImage.
 */
export function rectRecorte(ancho, alto, sesgoY = CROP_SESGO_Y) {
  const lado = Math.min(ancho, alto);
  return {
    sx: Math.round((ancho - lado) / 2),
    sy: Math.round((alto - lado) * sesgoY),
    lado,
  };
}

/**
 * Escalones de reducción por mitades. Una sola pasada de 4032→512 produce
 * aliasing visible en un rostro; bajar por halvings mantiene el detalle.
 * Nunca amplía: si el origen ya es menor que el destino, devuelve un solo paso.
 */
export function pasosReduccion(ladoOrigen, ladoDestino) {
  if (ladoOrigen <= ladoDestino) return [ladoOrigen];
  const pasos = [];
  let actual = ladoOrigen;
  while (actual / 2 > ladoDestino) {
    actual = Math.round(actual / 2);
    pasos.push(actual);
  }
  pasos.push(ladoDestino);
  return pasos;
}

export function extDeBlob(blob) {
  return EXT_POR_TIPO[blob?.type] || 'jpg';
}

/**
 * Codifica el canvas al primer formato que quepa en `maxBytes`.
 *
 * La comprobación `blob.type !== tipo` no es paranoia: Safari < 16.4 acepta
 * 'image/webp' en toBlob y devuelve un PNG en silencio. Sin este guard se
 * subiría un PNG de varios MB creyendo que es un WebP de 30 KB.
 */
export async function codificar(canvas, { maxBytes = FOTO_MAX_BYTES, aBlob } = {}) {
  if (typeof aBlob !== 'function') {
    throw new ErrorFoto('codificar', 'Falta el codificador de imagen.');
  }
  let ultimo = null;
  for (const [tipo, calidad] of INTENTOS) {
    const blob = await aBlob(canvas, tipo, calidad);
    if (!blob) continue;
    if (blob.type !== tipo) continue; // el navegador no sabe generar ese formato
    ultimo = blob;
    if (blob.size <= maxBytes) return blob;
  }
  if (!ultimo) {
    throw new ErrorFoto('codificar', 'No pudimos preparar la imagen en este dispositivo.');
  }
  return ultimo; // a 512px no debería llegar aquí; mejor subir algo que fallar
}

// ---------------------------------------------------------------------------
// Implementaciones con DOM (las que se inyectan en test)
// ---------------------------------------------------------------------------

/**
 * Decodifica con <img> + decode() y NO con createImageBitmap({imageOrientation:
 * 'from-image'}): Safari 15/16 acepta esa opción y la ignora, así que un
 * retrato de iPhone saldría tumbado 90° — catastrófico en un carnet. Desde
 * Safari 13.1 / Chrome 81 / Firefox 77, `image-orientation: from-image` es el
 * valor inicial de <img> y drawImage ya dibuja con la orientación EXIF
 * aplicada, con una sola rama de código para toda la matriz de navegadores.
 */
export async function decodificarImagen(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    if (img.decode) await img.decode();
    else await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; });
  } catch {
    URL.revokeObjectURL(url);
    throw new ErrorFoto('formato', 'No pudimos leer esa imagen. Prueba con una foto JPG o PNG.');
  }
  // Se revoca después de dibujar en el canvas, no aquí.
  return { img, revocar: () => URL.revokeObjectURL(url) };
}

export function crearCanvas(ancho, alto) {
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  return canvas;
}

export function canvasABlob(canvas, tipo, calidad) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
}

/**
 * Pipeline completo: valida → decodifica → recorta cuadrado → reduce → codifica.
 * @returns {Promise<{blob: Blob, ext: string, lado: number}>}
 */
export async function prepararImagen(file, opciones = {}) {
  const {
    lado = FOTO_LADO,
    maxBytes = FOTO_MAX_BYTES,
    sesgoY = CROP_SESGO_Y,
    deps = {},
  } = opciones;
  const {
    decodificar = decodificarImagen,
    crearCanvas: nuevoCanvas = crearCanvas,
    aBlob = canvasABlob,
  } = deps;

  validarEntrada(file);

  const { img, revocar } = await decodificar(file);
  try {
    const ancho = img.naturalWidth || img.width;
    const alto = img.naturalHeight || img.height;
    if (!ancho || !alto) {
      throw new ErrorFoto('formato', 'Esa imagen no tiene un tamaño válido.');
    }

    const { sx, sy, lado: ladoFuente } = rectRecorte(ancho, alto, sesgoY);
    const ladoFinal = Math.min(lado, ladoFuente); // nunca ampliar
    const pasos = pasosReduccion(ladoFuente, ladoFinal);

    // Primer paso: recorte cuadrado + escala al primer escalón.
    let canvas = nuevoCanvas(pasos[0], pasos[0]);
    let ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, ladoFuente, ladoFuente, 0, 0, pasos[0], pasos[0]);

    // Escalones siguientes: cuadrado a cuadrado.
    for (let i = 1; i < pasos.length; i++) {
      const siguiente = nuevoCanvas(pasos[i], pasos[i]);
      ctx = siguiente.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, pasos[i], pasos[i]);
      canvas = siguiente;
    }

    const blob = await codificar(canvas, { maxBytes, aBlob });
    return { blob, ext: extDeBlob(blob), lado: pasos[pasos.length - 1] };
  } finally {
    revocar();
  }
}
