import { describe, it, expect } from 'vitest';
import {
  rectRecorte,
  pasosReduccion,
  codificar,
  validarEntrada,
  extDeBlob,
  ErrorFoto,
  CROP_SESGO_Y,
  FOTO_LADO,
} from './imagenPerfil';

// Blob falso: en `node` no hay canvas ni Blob del navegador, y solo nos
// interesan `type` y `size`.
const blobFake = (type, size) => ({ type, size });

describe('rectRecorte', () => {
  it('en una foto vertical sesga el cuadrado hacia arriba (la cara, no el pecho)', () => {
    // 3000x4000: sobran 1000px de alto; con sesgo .30 se recortan 300 arriba.
    expect(rectRecorte(3000, 4000)).toEqual({ sx: 0, sy: 300, lado: 3000 });
  });

  it('en una foto apaisada centra en X y no recorta en Y', () => {
    expect(rectRecorte(4000, 3000)).toEqual({ sx: 500, sy: 0, lado: 3000 });
  });

  it('deja intacta una foto ya cuadrada', () => {
    expect(rectRecorte(1200, 1200)).toEqual({ sx: 0, sy: 0, lado: 1200 });
  });

  it('con sesgo 0 pega el recorte al borde superior y con .5 lo centra', () => {
    expect(rectRecorte(3000, 4000, 0).sy).toBe(0);
    expect(rectRecorte(3000, 4000, 0.5).sy).toBe(500);
  });

  it('el sesgo por defecto deja la cara más arriba que el centrado', () => {
    expect(rectRecorte(3000, 4000, CROP_SESGO_Y).sy)
      .toBeLessThan(rectRecorte(3000, 4000, 0.5).sy);
  });
});

describe('pasosReduccion', () => {
  it('baja por mitades hasta el último escalón que no pasa del destino', () => {
    // Una sola pasada 4032→512 produce aliasing visible en un rostro.
    expect(pasosReduccion(4032, FOTO_LADO)).toEqual([2016, 1008, 512]);
  });

  it('nunca amplía: si el origen es menor que el destino, un solo paso', () => {
    expect(pasosReduccion(300, 512)).toEqual([300]);
  });

  it('con el origen igual al destino no hace escalones intermedios', () => {
    expect(pasosReduccion(512, 512)).toEqual([512]);
  });

  it('todos los escalones son decrecientes y terminan en el destino', () => {
    const pasos = pasosReduccion(4032, 320);
    expect(pasos).toEqual([2016, 1008, 504, 320]);
    expect(pasos[pasos.length - 1]).toBe(320);
  });
});

describe('codificar', () => {
  it('acepta el primer formato que cabe en el límite', async () => {
    const aBlob = async (_c, tipo) => blobFake(tipo, 30 * 1024);
    const blob = await codificar({}, { aBlob, maxBytes: 120 * 1024 });
    expect(blob.type).toBe('image/webp');
  });

  it('salta a JPEG cuando el navegador devuelve PNG pidiendo WebP', async () => {
    // Safari < 16.4 acepta 'image/webp' en toBlob y devuelve un PNG en
    // silencio. Sin el guard de blob.type se subiría un PNG de varios MB.
    const aBlob = async (_c, tipo) =>
      tipo === 'image/webp' ? blobFake('image/png', 4 * 1024 * 1024) : blobFake(tipo, 40 * 1024);
    const blob = await codificar({}, { aBlob, maxBytes: 120 * 1024 });
    expect(blob.type).toBe('image/jpeg');
  });

  it('baja la calidad hasta caber en el límite', async () => {
    const aBlob = async (_c, tipo, calidad) =>
      blobFake(tipo, calidad > 0.75 ? 300 * 1024 : 50 * 1024);
    const blob = await codificar({}, { aBlob, maxBytes: 120 * 1024 });
    expect(blob).toEqual(blobFake('image/webp', 50 * 1024));
  });

  it('devuelve el último intento si ninguno cabe, en vez de fallar', async () => {
    const aBlob = async (_c, tipo) => blobFake(tipo, 999 * 1024);
    const blob = await codificar({}, { aBlob, maxBytes: 120 * 1024 });
    expect(blob.type).toBe('image/jpeg'); // el último de INTENTOS
  });

  it('lanza si el navegador no sabe generar ningún formato', async () => {
    const aBlob = async () => null;
    await expect(codificar({}, { aBlob })).rejects.toBeInstanceOf(ErrorFoto);
  });

  it('lanza si no se le inyecta un codificador', async () => {
    await expect(codificar({}, {})).rejects.toBeInstanceOf(ErrorFoto);
  });
});

describe('validarEntrada', () => {
  it('acepta una imagen normal', () => {
    expect(validarEntrada({ type: 'image/jpeg', size: 2 * 1024 * 1024 })).toBe(true);
  });

  it('rechaza lo que no es imagen', () => {
    expect(() => validarEntrada({ type: 'application/pdf', size: 1000 }))
      .toThrow(/no es una imagen/i);
  });

  it('rechaza un archivo sin tipo', () => {
    expect(() => validarEntrada({ size: 1000 })).toThrow(ErrorFoto);
  });

  it('rechaza una imagen de más de 20 MB', () => {
    expect(() => validarEntrada({ type: 'image/jpeg', size: 21 * 1024 * 1024 }))
      .toThrow(/demasiado grande/i);
  });

  it('rechaza la ausencia de archivo', () => {
    expect(() => validarEntrada(null)).toThrow(ErrorFoto);
  });
});

describe('extDeBlob', () => {
  it.each([
    ['image/webp', 'webp'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
  ])('%s → .%s', (tipo, ext) => {
    expect(extDeBlob({ type: tipo })).toBe(ext);
  });

  it('cae a jpg ante un tipo desconocido', () => {
    expect(extDeBlob({ type: 'image/avif' })).toBe('jpg');
    expect(extDeBlob(null)).toBe('jpg');
  });

  // La extensión acaba en el path del bucket, que las políticas de v53b
  // validan con [A-Za-z0-9._-]{1,64}.
  it('produce extensiones que aceptan las políticas de storage', () => {
    for (const tipo of ['image/webp', 'image/jpeg', 'image/png']) {
      expect(extDeBlob({ type: tipo })).toMatch(/^[a-z0-9]+$/);
    }
  });
});
