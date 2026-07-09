// Test anti-drift de las copias compartidas para Edge Functions.
//
// packages/analytics-core y los módulos PORTABLES de packages/brain-core se
// copian (commiteadas) a supabase/functions/_shared/ con
// scripts/sync_edge_shared.mjs, porque `supabase functions deploy` solo
// empaqueta lo que vive bajo supabase/functions/ (Q5 del spec
// docs/spec_loop_misiones_baremo.md). Este test garantiza que las copias nunca
// divergen del origen: si alguien edita un paquete y olvida regenerar la copia
// (o edita la copia a mano), la suite falla con la instrucción exacta.
//
// De brain-core solo viajan los módulos portables a Deno: rack.js, prompts.js
// y el barrel index.js son Node-only (fs) y NO deben aparecer en _shared — hay
// una aserción explícita para eso. El corpus del rack SÍ viaja, pero como
// archivo GENERADO (rack-corpus.generado.js, serializado por el sync desde
// corpusCrudo() del loader Node) — tiene su propio bloque de comparación.
//
// Los tests de Vitest corren en Node (environment: 'node' en vite.config.js),
// así que aquí sí podemos usar fs/path, a diferencia de los propios paquetes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/lib → raíz del monorepo son tres niveles arriba.
const PACKAGES = path.resolve(__dirname, '..', '..', '..', 'packages');
const SHARED = path.resolve(__dirname, '..', '..', 'supabase', 'functions', '_shared');

const AVISO = 'corre npm run functions:sync';

// Módulos portables de brain-core. Mantener en sintonía con ESPEJOS de
// scripts/sync_edge_shared.mjs.
const PORTABLES_BRAIN_CORE = ['diagnostico.js', 'readiness.js', 'rackMotor.js'];

// Archivos GENERADOS por el sync en el destino (no copias de un origen):
// el chequeo de huérfanos los respeta y tienen su propia verificación abajo.
const GENERADOS_BRAIN_CORE = ['rack-corpus.generado.js'];

const ESPEJOS = [
  { paquete: 'analytics-core', filtro: (nombre) => nombre.endsWith('.js') },
  {
    paquete: 'brain-core',
    filtro: (nombre) => PORTABLES_BRAIN_CORE.includes(nombre),
    generados: GENERADOS_BRAIN_CORE,
  },
];

/** Normaliza EOL (git puede materializar CRLF en Windows) y quita el header AUTO-GENERADO. */
function contenidoComparable(rutaArchivo, prefijoHeader) {
  const lineas = fs.readFileSync(rutaArchivo, 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (lineas[0] && lineas[0].startsWith(prefijoHeader)) lineas.shift();
  return lineas.join('\n');
}

describe.each(ESPEJOS)('sync packages/$paquete → _shared/$paquete', ({ paquete, filtro, generados = [] }) => {
  const ORIGEN = path.join(PACKAGES, paquete);
  const DESTINO = path.join(SHARED, paquete);
  const PREFIJO_HEADER = `// AUTO-GENERADO desde packages/${paquete}`;

  const archivosEsperados = fs.readdirSync(ORIGEN).filter(filtro).sort();

  it('el directorio destino existe (corre npm run functions:sync)', () => {
    expect(fs.existsSync(DESTINO), `Falta ${DESTINO} — ${AVISO}`).toBe(true);
  });

  it('el origen tiene módulos .js que sincronizar', () => {
    expect(archivosEsperados.length).toBeGreaterThan(0);
  });

  describe.each(archivosEsperados)('%s', (nombre) => {
    const rutaOrigen = path.join(ORIGEN, nombre);
    const rutaDestino = path.join(DESTINO, nombre);

    it('existe en la copia de _shared', () => {
      expect(
        fs.existsSync(rutaDestino),
        `Falta ${nombre} en _shared/${paquete} — ${AVISO}`
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
        contenidoComparable(rutaDestino, PREFIJO_HEADER),
        `${nombre} divergió entre packages/${paquete} y _shared — ${AVISO}`
      ).toBe(contenidoComparable(rutaOrigen, PREFIJO_HEADER));
    });
  });

  it('no hay huérfanos en _shared que ya no existan en el origen', () => {
    const huerfanos = fs
      .readdirSync(DESTINO)
      .filter((nombre) => !archivosEsperados.includes(nombre) && !generados.includes(nombre));
    expect(
      huerfanos,
      `Archivos huérfanos en _shared/${paquete}: ${huerfanos.join(', ')} — ${AVISO}`
    ).toEqual([]);
  });
});

describe('brain-core: corpus del rack generado para Deno', () => {
  const RUTA_CORPUS = path.join(SHARED, 'brain-core', 'rack-corpus.generado.js');

  it('rack-corpus.generado.js existe (corre npm run functions:sync)', () => {
    expect(fs.existsSync(RUTA_CORPUS), `Falta ${RUTA_CORPUS} — ${AVISO}`).toBe(true);
  });

  it('lleva el header AUTO-GENERADO', () => {
    const primeraLinea = fs
      .readFileSync(RUTA_CORPUS, 'utf8')
      .replace(/\r\n/g, '\n')
      .split('\n')[0];
    expect(
      primeraLinea.startsWith('// AUTO-GENERADO'),
      `rack-corpus.generado.js no empieza con el header AUTO-GENERADO — ${AVISO}`
    ).toBe(true);
  });

  it('el CORPUS coincide con corpusCrudo() del loader Node', async () => {
    // rack.js es Node-only (fs), pero Vitest corre en Node: aquí sí se puede
    // importar el loader real y comparar contra el archivo generado.
    const { corpusCrudo } = await import(
      pathToFileURL(path.join(PACKAGES, 'brain-core', 'rack.js')).href
    );
    const { CORPUS } = await import(pathToFileURL(RUTA_CORPUS).href);
    expect(
      CORPUS,
      `rack-corpus.generado.js divergió del corpus real (blackgold-mcp/knowledge) — ${AVISO}`
    ).toEqual(corpusCrudo());
  });
});

describe('brain-core: los módulos Node-only no viajan al espejo Deno', () => {
  it.each(['rack.js', 'prompts.js', 'index.js'])('%s NO está en _shared/brain-core', (nombre) => {
    expect(
      fs.existsSync(path.join(SHARED, 'brain-core', nombre)),
      `${nombre} depende de fs (Node-only) y rompería el bundle Deno — quítalo del espejo`
    ).toBe(false);
  });
});
