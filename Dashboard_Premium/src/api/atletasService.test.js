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

afterEach(() => {
  vi.clearAllMocks();
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
