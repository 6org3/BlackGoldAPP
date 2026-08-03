import { describe, it, expect } from 'vitest';
import { puedeEditarFoto } from './fotoAtleta';

const ATLETA = { atleta_id: 'a-1', id: 'u-1', club: 'Black Gold' };
const OTRO_CLUB = { atleta_id: 'a-9', id: 'u-9', club: 'Nueva Loja Basket' };

describe('puedeEditarFoto', () => {
  it('el superadmin puede con cualquier atleta, de cualquier club', () => {
    const su = { rol: 'superadmin', club: 'Black Gold' };
    expect(puedeEditarFoto(su, ATLETA)).toBe(true);
    expect(puedeEditarFoto(su, OTRO_CLUB)).toBe(true);
  });

  it.each(['owner', 'coach'])('el %s puede solo dentro de su club', (rol) => {
    const staff = { rol, club: 'Black Gold' };
    expect(puedeEditarFoto(staff, ATLETA)).toBe(true);
    expect(puedeEditarFoto(staff, OTRO_CLUB)).toBe(false);
  });

  it('un staff sin club no pasa por coincidencia de nulos', () => {
    expect(puedeEditarFoto({ rol: 'coach' }, { atleta_id: 'a-2' })).toBe(false);
  });

  it('el atleta puede con su propia ficha y no con la de otro', () => {
    const yo = { rol: 'atleta', club: 'Black Gold', atleta_id: 'a-1' };
    expect(puedeEditarFoto(yo, ATLETA)).toBe(true);
    expect(puedeEditarFoto(yo, { atleta_id: 'a-2', club: 'Black Gold' })).toBe(false);
  });

  it('el atleta no pasa si no trae atleta_id en sesión', () => {
    expect(puedeEditarFoto({ rol: 'atleta', club: 'Black Gold' }, ATLETA)).toBe(false);
  });

  it('el padre puede con sus hijos y no con un atleta ajeno', () => {
    const padre = { rol: 'padre', club: 'Black Gold' };
    expect(puedeEditarFoto(padre, ATLETA, { hijosIds: ['a-1', 'a-3'] })).toBe(true);
    expect(puedeEditarFoto(padre, OTRO_CLUB, { hijosIds: ['a-1', 'a-3'] })).toBe(false);
  });

  it('sin lista de hijos, el padre pasa: su panel solo monta a sus hijos', () => {
    expect(puedeEditarFoto({ rol: 'padre' }, ATLETA)).toBe(true);
  });

  it('usa atleta.id cuando no viene atleta_id (shape de padreService)', () => {
    const padre = { rol: 'padre' };
    expect(puedeEditarFoto(padre, { id: 'a-7' }, { hijosIds: ['a-7'] })).toBe(true);
    expect(puedeEditarFoto(padre, { id: 'a-8' }, { hijosIds: ['a-7'] })).toBe(false);
  });

  it('un rol desconocido nunca pasa', () => {
    expect(puedeEditarFoto({ rol: 'invitado', club: 'Black Gold' }, ATLETA)).toBe(false);
  });

  it('sin usuario o sin atleta devuelve false', () => {
    expect(puedeEditarFoto(null, ATLETA)).toBe(false);
    expect(puedeEditarFoto({ rol: 'superadmin' }, null)).toBe(false);
  });
});
