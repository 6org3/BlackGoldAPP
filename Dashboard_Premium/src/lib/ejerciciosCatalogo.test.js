// Tests de las funciones puras del catálogo de ejercicios (src/lib/ejerciciosCatalogo.js).
import { describe, it, expect } from 'vitest';
import { filtrarEjerciciosPorTipoYNivel, resolverNombresEjercicios } from './ejerciciosCatalogo';

const CATALOGO = [
  { id: 'e1', nombre: 'Sentadilla', tipo: 'Físico', grupos_recomendados: ['Micro'] },
  { id: 'e2', nombre: 'Press de banca', tipo: 'Físico', grupos_recomendados: ['Elite'] },
  { id: 'e3', nombre: 'Tiro libre', tipo: 'Técnico', grupos_recomendados: ['Micro', 'Desarrollo'] },
  { id: 'e4', nombre: 'Dribling básico', tipo: 'Técnico', grupos_recomendados: null },
  { id: 'e5', nombre: 'Ejercicio del grupo Aurora', tipo: 'Físico', grupos_recomendados: ['Aurora'] },
];

describe('filtrarEjerciciosPorTipoYNivel', () => {
  it('filtra por tipo', () => {
    const r = filtrarEjerciciosPorTipoYNivel(CATALOGO, 'Técnico');
    expect(r.map((e) => e.id)).toEqual(['e3', 'e4']);
  });

  it('grupo con nivel excluye drills sin ese nivel', () => {
    const grupo = { nombre: 'Grupo Micro', nivel: 'Micro' };
    const r = filtrarEjerciciosPorTipoYNivel(CATALOGO, 'Físico', grupo);
    expect(r.map((e) => e.id)).toEqual(['e1']);
  });

  it('grupo sin nivel (null) no filtra por nivel', () => {
    const grupo = { nombre: 'Grupo Mixto', nivel: null };
    const r = filtrarEjerciciosPorTipoYNivel(CATALOGO, 'Físico', grupo);
    expect(r.map((e) => e.id)).toEqual(['e1', 'e2', 'e5']);
  });

  it('sin grupo (null) no filtra por nivel', () => {
    const r = filtrarEjerciciosPorTipoYNivel(CATALOGO, 'Físico', null);
    expect(r.map((e) => e.id)).toEqual(['e1', 'e2', 'e5']);
  });

  it('match legacy por nombre de grupo', () => {
    const grupo = { nombre: 'Aurora', nivel: 'Elite' };
    const r = filtrarEjerciciosPorTipoYNivel(CATALOGO, 'Físico', grupo);
    // e2 matchea por nivel Elite, e5 matchea por nombre de grupo "Aurora" (legacy)
    expect(r.map((e) => e.id)).toEqual(['e2', 'e5']);
  });
});

describe('resolverNombresEjercicios', () => {
  it('resuelve ids conocidos en el mismo orden', () => {
    const r = resolverNombresEjercicios(['e3', 'e1'], CATALOGO);
    expect(r).toEqual([
      { id: 'e3', nombre: 'Tiro libre' },
      { id: 'e1', nombre: 'Sentadilla' },
    ]);
  });

  it('un id huérfano devuelve nombre null en su posición (longitud preservada)', () => {
    const r = resolverNombresEjercicios(['e1', 'inexistente', 'e2'], CATALOGO);
    expect(r).toEqual([
      { id: 'e1', nombre: 'Sentadilla' },
      { id: 'inexistente', nombre: null },
      { id: 'e2', nombre: 'Press de banca' },
    ]);
  });

  it('ids vacío, null o undefined → []', () => {
    expect(resolverNombresEjercicios([], CATALOGO)).toEqual([]);
    expect(resolverNombresEjercicios(null, CATALOGO)).toEqual([]);
    expect(resolverNombresEjercicios(undefined, CATALOGO)).toEqual([]);
  });
});
