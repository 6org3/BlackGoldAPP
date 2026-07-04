// Test anti-drift de la copia compartida para Edge Functions.
//
// packages/analytics-core se copia (commiteada) a supabase/functions/_shared/
// analytics-core con scripts/sync_edge_shared.mjs, porque `supabase functions
// deploy` solo empaqueta lo que vive bajo supabase/functions/ (Q5 del spec
// docs/spec_loop_misiones_baremo.md). Este test garantiza que la copia nunca
// diverge del origen: si alguien edita analytics-core y olvida regenerar la
// copia (o edita la copia a mano), la suite falla con la instrucción exacta.
//
// Los tests de Vitest corren en Node (environment: 'node' en vite.config.js),
// así que aquí sí podemos usar fs/path, a diferencia del propio paquete.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/lib → raíz del monorepo son tres niveles arriba.
const ORIGEN = path.resolve(__dirname, '..', '..', '..', 'packages', 'analytics-core');
const DESTINO = path.resolve(
  __dirname, '..', '..', 'supabase', 'functions', '_shared', 'analytics-core'
);

const AVISO = 'corre npm run functions:sync';
const PREFIJO_HEADER = '// AUTO-GENERADO desde packages/analytics-core';

/** Normaliza EOL (git puede materializar CRLF en Windows) y quita el header AUTO-GENERADO. */
function contenidoComparable(rutaArchivo) {
  const lineas = fs.readFileSync(rutaArchivo, 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (lineas[0] && lineas[0].startsWith(PREFIJO_HEADER)) lineas.shift();
  return lineas.join('\n');
}

const archivosOrigen = fs
  .readdirSync(ORIGEN)
  .filter((nombre) => nombre.endsWith('.js'))
  .sort();

describe('sync packages/analytics-core → supabase/functions/_shared/analytics-core', () => {
  it('el directorio destino existe (corre npm run functions:sync)', () => {
    expect(
      fs.existsSync(DESTINO),
      `Falta ${DESTINO} — ${AVISO}`
    ).toBe(true);
  });

  it('el origen tiene módulos .js que sincronizar', () => {
    expect(archivosOrigen.length).toBeGreaterThan(0);
  });

  describe.each(archivosOrigen)('%s', (nombre) => {
    const rutaOrigen = path.join(ORIGEN, nombre);
    const rutaDestino = path.join(DESTINO, nombre);

    it('existe en la copia de _shared', () => {
      expect(
        fs.existsSync(rutaDestino),
        `Falta ${nombre} en _shared/analytics-core — ${AVISO}`
      ).toBe(true);
    });

    it('la copia lleva el header AUTO-GENERADO', () => {
      const primeraLinea = fs
        .readFileSync(rutaDestino, 'utf8')
        .replace(/\r\n/g, '\n')
        .split('\n')[0];
      expect(
        primeraLinea.startsWith(PREFIJO_HEADER),
        `${nombre} en _shared no empieza con el header AUTO-GENERADO — ${AVISO}`
      ).toBe(true);
    });

    it('el contenido coincide con el origen (ignorando el header)', () => {
      expect(
        contenidoComparable(rutaDestino),
        `${nombre} divergió entre packages/analytics-core y _shared — ${AVISO}`
      ).toBe(contenidoComparable(rutaOrigen));
    });
  });

  it('no hay huérfanos en _shared que ya no existan en el origen', () => {
    const huerfanos = fs
      .readdirSync(DESTINO)
      .filter((nombre) => !archivosOrigen.includes(nombre));
    expect(
      huerfanos,
      `Archivos huérfanos en _shared/analytics-core: ${huerfanos.join(', ')} — ${AVISO}`
    ).toEqual([]);
  });
});
