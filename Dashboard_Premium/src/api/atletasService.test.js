// src/api/atletasService.test.js
// Dos regresiones de fetchTodosLosAtletas (lote 2 — servicios/páginas):
//
// api-04: la consulta de atleta_readiness (readiness de HOY) hacía
// .select().in().eq() SIN traerTodo()/range() — PostgREST corta en
// `db-max-rows` (1000 por defecto) SIN avisar, así que los atletas cuyo
// readiness caía más allá de la fila 1000 aparecían como "sin check-in hoy",
// indistinguible de quien de verdad no hizo check-in. Doce líneas arriba la
// consulta de evaluaciones_pruebas SÍ usa traerTodo(); el fix replica
// exactamente ese patrón para readiness.
//
// rutas-01: cualquier error de Supabase (red/RLS/5xx) en la consulta
// principal de atletas se tragaba con console.error y devolvía []/{data:[],
// hasMore:false} — indistinguible del club vacío, sin lanzar jamás. El fix
// hace que ese error se propague (throw) para que los callers con try/catch
// puedan mostrarlo.
import { describe, it, expect, vi, afterEach } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }));

import { fetchTodosLosAtletas } from './atletasService';
import { fechaNacimientoDeEdad } from '../lib/edad';

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

const HOY = new Date().toISOString().split('T')[0]; // no importa el TZ para este spec

function atletaFila(i) {
  return {
    id: `atleta-${i}`,
    usuario_id: `usuario-${i}`,
    posicion: null,
    grupo_id: null,
    grupo_nombre: null,
    es_becado: false,
    descuento_pct: 0,
    overall_score: 50,
    xp_total: 0,
    nivel_desarrollo: 'Desarrollo',
    perfil_mental: null,
    estado_recuperacion: null,
    estado_membresia: 'activo',
    fecha_baja: null,
    restriccion_movilidad: null,
    prevencion_impacto: null,
    peso_kg: null,
    talla_cm: null,
    envergadura_cm: null,
    edad: 15,
    usuarios: {
      id: `usuario-${i}`,
      cedula: `000${i}`,
      nombre: `Atleta ${i}`,
      rol: 'atleta',
      club: 'ClubTest',
      categoria: 'Sub-15',
      categoria_feb: 'Sub-15',
      correo: null,
      fecha_nacimiento: '2012-01-01',
      genero: 'Masculino',
      estado: 'activo',
    },
  };
}

/** Doble de una tabla de PostgREST fiel al comportamiento real que causa el
 *  bug: con `.range()` explícito devuelve la página pedida (pagina de
 *  verdad); SIN `.range()` (código viejo que solo hace `await` de la
 *  cadena) simula el corte silencioso de `db-max-rows` en `corte` filas —
 *  así el mismo test distingue código con traerTodo() de código sin él. */
function tablaConCortePostgrest(todasLasFilas, { corte = 1000, error = null } = {}) {
  return () => {
    const builder = {};
    const encadenable = () => builder;
    ['select', 'eq', 'in', 'order', 'ilike', 'or', 'is', 'gt', 'lte'].forEach((m) => {
      builder[m] = vi.fn(encadenable);
    });
    builder.range = vi.fn((desde, hasta) => {
      if (error) return Promise.resolve({ data: null, error, count: 0 });
      const data = todasLasFilas.slice(desde, hasta + 1);
      return Promise.resolve({ data, error: null, count: todasLasFilas.length });
    });
    // Sin `.range()`: PostgREST corta en silencio a `corte` filas (o lanza el
    // error, si la consulta principal debe fallar).
    builder.then = (resolve) => {
      if (error) return resolve({ data: null, error, count: 0 });
      resolve({ data: todasLasFilas.slice(0, corte), error: null, count: todasLasFilas.length });
    };
    return builder;
  };
}

describe('fetchTodosLosAtletas — readiness diario (api-04)', () => {
  it('trae el readiness de TODOS los atletas, incluso más allá de la fila 1000', async () => {
    const N = 1200;
    const atletas = Array.from({ length: N }, (_, i) => atletaFila(i));
    // Un readiness por atleta, incluidos los de las filas 1000-1199 (la
    // "segunda página" que el corte silencioso de PostgREST se comería).
    const readiness = Array.from({ length: N }, (_, i) => ({
      id: `r-${i}`,
      atleta_id: `atleta-${i}`,
      fecha: HOY,
      readiness_score: 8,
    }));

    supabaseMock.from.mockImplementation((tabla) => {
      if (tabla === 'atletas') return tablaConCortePostgrest(atletas)();
      if (tabla === 'evaluaciones_pruebas') return tablaConCortePostgrest([])();
      if (tabla === 'atleta_readiness') return tablaConCortePostgrest(readiness)();
      throw new Error(`tabla no mockeada: ${tabla}`);
    });

    const resultado = await fetchTodosLosAtletas(null, {});

    // Un atleta de la "segunda página" (fila 1150) debe tener su readiness
    // de hoy resuelto, no aparecer como "sin check-in".
    const atleta1150 = resultado.find((a) => a.atleta_id === 'atleta-1150');
    expect(atleta1150).toBeDefined();
    expect(atleta1150.readiness_hoy).toEqual(
      expect.objectContaining({ atleta_id: 'atleta-1150', readiness_score: 8 })
    );
    // Y el mismo caso para uno de la primera página, como control.
    const atleta5 = resultado.find((a) => a.atleta_id === 'atleta-5');
    expect(atleta5.readiness_hoy).toEqual(expect.objectContaining({ atleta_id: 'atleta-5' }));
  });
});

describe('fetchTodosLosAtletas — error de Supabase (rutas-01)', () => {
  it('lanza en vez de devolver un array vacío cuando la consulta principal falla', async () => {
    const errorSupabase = { message: 'network error', code: '500' };
    supabaseMock.from.mockImplementation((tabla) => {
      if (tabla === 'atletas') return tablaConCortePostgrest([], { error: errorSupabase })();
      throw new Error(`tabla no mockeada: ${tabla}`);
    });

    await expect(fetchTodosLosAtletas(null, {})).rejects.toBeTruthy();
  });

  it('con limit>0 también lanza en vez de devolver {data:[],hasMore:false}', async () => {
    const errorSupabase = { message: 'network error', code: '500' };
    supabaseMock.from.mockImplementation((tabla) => {
      if (tabla === 'atletas') return tablaConCortePostgrest([], { error: errorSupabase })();
      throw new Error(`tabla no mockeada: ${tabla}`);
    });

    await expect(fetchTodosLosAtletas(null, { limit: 12 })).rejects.toBeTruthy();
  });
});

// coherencia-01: la categoría FEB se deriva SIEMPRE al vuelo de
// fecha_nacimiento, nunca leyendo usuarios.categoria_feb (columna GENERATED
// congelada en el INSERT, v20) — ni en el gate de alcance del coach ni en el
// filtro de categoría del dropdown de /admin/atletas.
describe('fetchTodosLosAtletas — categoría FEB derivada al vuelo, no la columna congelada (coherencia-01)', () => {
  // Instante fijo a mediodía UTC: mismo día calendario en CI (UTC) y en local
  // (Ecuador, UTC-5), y determinista frente a rangoFechaNacimientoPorCategoria
  // / fechaNacimientoDeEdad (ambos usan Date "de hoy" por defecto).
  const AHORA = new Date('2026-07-15T12:00:00Z');

  /** Corre fetchTodosLosAtletas capturando el builder real de `.from('atletas')`
   *  (con sus spies vi.fn() intactos) para poder inspeccionar con qué columnas
   *  y valores se llamó .eq()/.lte()/.gt(). */
  async function correrCapturandoBuilder(user, options) {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    const buildersAtletas = [];
    supabaseMock.from.mockImplementation((tabla) => {
      if (tabla === 'atletas') {
        const b = tablaConCortePostgrest([atletaFila(0)])();
        buildersAtletas.push(b);
        return b;
      }
      if (tabla === 'evaluaciones_pruebas') return tablaConCortePostgrest([])();
      if (tabla === 'atleta_readiness') return tablaConCortePostgrest([])();
      throw new Error(`tabla no mockeada: ${tabla}`);
    });
    await fetchTodosLosAtletas(user, options);
    // OJO: el builder (tablaConCortePostgrest) tiene su propio `.then` para
    // simular el corte silencioso de PostgREST — es un thenable. `return` de
    // un `async function` desenvuelve cualquier valor con `.then` llamando a
    // ESE `.then` (igual que `await`), así que `return buildersAtletas[0]`
    // directo entrega `{data,error,count}` en vez del builder. Envolverlo en
    // un objeto plano evita el desenvolvimiento implícito.
    return { builder: buildersAtletas[0] };
  }

  it('el SELECT ya no pide la columna congelada categoria_feb', async () => {
    const { builder } = await correrCapturandoBuilder(null, {});
    const selectCall = builder.select.mock.calls[0][0];
    expect(selectCall).not.toMatch(/categoria_feb/);
  });

  it('gate del coach: traduce su categoría asignada a un rango de fecha_nacimiento, nunca un .eq sobre categoria_feb', async () => {
    const coach = { rol: 'coach', club: 'ClubTest', categoria: 'Menores (Sub-14)' };
    const { builder } = await correrCapturandoBuilder(coach, {});

    expect(builder.eq.mock.calls.some(([col]) => col === 'usuarios.categoria_feb')).toBe(false);

    const lteFecha = builder.lte.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento');
    const gtFecha = builder.gt.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento');
    // Menores (Sub-14): min 12, max 14 → ha nacido hace al menos 12 años y no
    // ha cumplido 15 todavía.
    expect(lteFecha).toEqual([['usuarios.fecha_nacimiento', fechaNacimientoDeEdad(12, AHORA)]]);
    expect(gtFecha).toEqual([['usuarios.fecha_nacimiento', fechaNacimientoDeEdad(15, AHORA)]]);
  });

  it('coach con categoría "Todas" no aplica ningún gate de categoría', async () => {
    const coach = { rol: 'coach', club: 'ClubTest', categoria: 'Todas' };
    const { builder } = await correrCapturandoBuilder(coach, {});
    expect(builder.lte.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento')).toEqual([]);
    expect(builder.gt.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento')).toEqual([]);
  });

  it('coach con categoría no canónica (dato corrupto): cero resultados, no "sin filtro"', async () => {
    const coach = { rol: 'coach', club: 'ClubTest', categoria: 'Sub-15-legacy-inexistente' };
    const { builder } = await correrCapturandoBuilder(coach, {});
    expect(builder.eq.mock.calls).toContainEqual(['usuarios.id', '00000000-0000-0000-0000-000000000000']);
  });

  it('filtro voluntario de categoría del dropdown: mismo rango de fecha, no .eq sobre categoria_feb', async () => {
    const { builder } = await correrCapturandoBuilder(null, { categoria: 'Juvenil (Sub-18)' });

    expect(builder.eq.mock.calls.some(([col]) => col === 'usuarios.categoria_feb')).toBe(false);
    const lteFecha = builder.lte.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento');
    const gtFecha = builder.gt.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento');
    // Juvenil (Sub-18): min 17, max 18.
    expect(lteFecha).toEqual([['usuarios.fecha_nacimiento', fechaNacimientoDeEdad(17, AHORA)]]);
    expect(gtFecha).toEqual([['usuarios.fecha_nacimiento', fechaNacimientoDeEdad(19, AHORA)]]);
  });

  it('filtro de categoría "Mayores" (sin techo): solo fechaNacLte, sin .gt', async () => {
    const { builder } = await correrCapturandoBuilder(null, { categoria: 'Mayores' });
    const lteFecha = builder.lte.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento');
    const gtFecha = builder.gt.mock.calls.filter(([col]) => col === 'usuarios.fecha_nacimiento');
    expect(lteFecha).toEqual([['usuarios.fecha_nacimiento', fechaNacimientoDeEdad(19, AHORA)]]);
    expect(gtFecha).toEqual([]);
  });

  it('categoría inválida en el dropdown: cero resultados, no "sin filtro"', async () => {
    const { builder } = await correrCapturandoBuilder(null, { categoria: 'no-existe' });
    expect(builder.eq.mock.calls).toContainEqual(['usuarios.id', '00000000-0000-0000-0000-000000000000']);
  });
});
