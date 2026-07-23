// Tests de la lógica pura de la Vista Padre Arcade: ultimasSesiones() mezcla las
// sesiones INDIVIDUALES del hijo (atleta_id) con las GRUPALES (atleta_id null)
// de su grupo, atribuidas por hijo.grupo_id. La RLS v50 garantiza que toda
// grupal recibida pertenece a un grupo de ALGÚN hijo del padre; esta función
// solo decide a qué hijo se le muestra cada grupal y cómo se etiqueta.
import { describe, it, expect, vi } from 'vitest';

// padreData importa la capa de servicios, que crea el cliente de Supabase en la
// carga del módulo (createClient revienta sin las VITE_SUPABASE_*). Se stubea
// ese único choke-point para importar la función pura sin red ni envs.
vi.mock('../../api/supabaseClient', () => ({ supabase: {} }));

import { ultimasSesiones } from './padreData';

const CATALOGO = [
  { id: 'e1', nombre: 'Sentadilla' },
  { id: 'e2', nombre: 'Tiro libre' },
  { id: 'e3', nombre: 'Contraataque 3v2' },
];

const HIJO = { atleta_id: 'A1', grupo_id: 'G1' };

// Ordenadas por fecha desc, como las entrega padreService.
const SESIONES = [
  { id: 'ind1', fecha: '2026-07-21', atleta_id: 'A1', grupo_id: null, objetivo_tipo: 'Físico', objetivo_descripcion: 'Fuerza', ejercicios_ids: ['e1'] },
  { id: 'grp1', fecha: '2026-07-20', atleta_id: null, grupo_id: 'G1', objetivo_tipo: 'Táctico', objetivo_descripcion: 'Transiciones', ejercicios_ids: ['e3'], grupos_entrenamiento: { nombre: 'Sub-13 Desarrollo' } },
  { id: 'ind2', fecha: '2026-07-18', atleta_id: 'A1', grupo_id: null, objetivo_tipo: 'Técnico', objetivo_descripcion: 'Tiro', ejercicios_ids: ['e2'] },
];

describe('ultimasSesiones', () => {
  it('incluye la individual del hijo y la grupal de su grupo, en orden de fecha', () => {
    const r = ultimasSesiones(SESIONES, HIJO, CATALOGO, 3);
    expect(r.map((s) => s.id)).toEqual(['ind1', 'grp1', 'ind2']);
  });

  it('marca esGrupal y resuelve grupoNombre del embed en la grupal; individual sin ellos', () => {
    const r = ultimasSesiones(SESIONES, HIJO, CATALOGO, 3);
    const grp = r.find((s) => s.id === 'grp1');
    expect(grp.esGrupal).toBe(true);
    expect(grp.grupoNombre).toBe('Sub-13 Desarrollo');
    const ind = r.find((s) => s.id === 'ind1');
    expect(ind.esGrupal).toBe(false);
    expect(ind.grupoNombre).toBe(null);
  });

  it('cae a "Sesión grupal" si el embed del grupo llegó null (RLS sin nombre)', () => {
    const sinNombre = [
      { id: 'grpX', fecha: '2026-07-22', atleta_id: null, grupo_id: 'G1', objetivo_tipo: 'Táctico', objetivo_descripcion: 'x', ejercicios_ids: [], grupos_entrenamiento: null },
    ];
    const r = ultimasSesiones(sinNombre, HIJO, CATALOGO, 3);
    expect(r[0].esGrupal).toBe(true);
    expect(r[0].grupoNombre).toBe('Sesión grupal');
  });

  it('NO atribuye una grupal de OTRO grupo al hijo', () => {
    const otroGrupo = [
      { id: 'grpOtro', fecha: '2026-07-22', atleta_id: null, grupo_id: 'G9', objetivo_tipo: 'Táctico', objetivo_descripcion: 'x', ejercicios_ids: [] },
    ];
    expect(ultimasSesiones(otroGrupo, HIJO, CATALOGO, 3)).toEqual([]);
  });

  it('NO atribuye ninguna grupal si el hijo no tiene grupo_id', () => {
    const hijoSinGrupo = { atleta_id: 'A1', grupo_id: null };
    const r = ultimasSesiones(SESIONES, hijoSinGrupo, CATALOGO, 3);
    expect(r.map((s) => s.id)).toEqual(['ind1', 'ind2']);
    expect(r.every((s) => s.esGrupal === false)).toBe(true);
  });

  it('respeta el límite tomando las más recientes tras mezclar individuales y grupales', () => {
    const r = ultimasSesiones(SESIONES, HIJO, CATALOGO, 2);
    expect(r.map((s) => s.id)).toEqual(['ind1', 'grp1']);
  });

  it('resuelve los drills contra el catálogo (nombre o "Ejercicio eliminado" para huérfanos)', () => {
    const conHuerfano = [
      { id: 'g', fecha: '2026-07-22', atleta_id: null, grupo_id: 'G1', objetivo_tipo: 'T', objetivo_descripcion: 'x', ejercicios_ids: ['e1', 'zzz'] },
    ];
    const r = ultimasSesiones(conHuerfano, HIJO, CATALOGO, 3);
    expect(r[0].drills).toEqual(['Sentadilla', 'Ejercicio eliminado']);
  });

  it('no revienta con entradas vacías', () => {
    expect(ultimasSesiones(null, HIJO, CATALOGO)).toEqual([]);
    expect(ultimasSesiones([], HIJO, CATALOGO)).toEqual([]);
    expect(ultimasSesiones(SESIONES, null, CATALOGO)).toEqual([]);
  });
});
