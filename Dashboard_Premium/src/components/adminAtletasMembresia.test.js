// Membresía en el roster de /admin/atletas (v34): los helpers puros que deciden
// si una card se marca "de baja" y con qué texto. La regla crítica es que un
// estado ausente cuenta como activo — si se invirtiera, todo el plantel
// aparecería dado de baja.
import { describe, it, expect } from 'vitest';
import { esBaja, etiquetaBaja, accionMembresia } from './adminAtletasMembresia';

describe('esBaja', () => {
  it('trata el estado ausente como activo (columna NOT NULL DEFAULT activo)', () => {
    expect(esBaja({ nombre: 'Sin columna' })).toBe(false);
    expect(esBaja({ estado_membresia: undefined })).toBe(false);
    expect(esBaja({ estado_membresia: null })).toBe(false);
  });

  it('marca baja e inactivo, no activo', () => {
    expect(esBaja({ estado_membresia: 'activo' })).toBe(false);
    expect(esBaja({ estado_membresia: 'baja' })).toBe(true);
    expect(esBaja({ estado_membresia: 'inactivo' })).toBe(true);
  });

  it('no revienta con un atleta indefinido', () => {
    expect(esBaja(undefined)).toBe(false);
    expect(esBaja(null)).toBe(false);
  });
});

describe('etiquetaBaja', () => {
  it('no etiqueta a los activos', () => {
    expect(etiquetaBaja({ estado_membresia: 'activo', fecha_baja: '2026-07-01' })).toBe('');
  });

  it('formatea la fecha en día/mes/año sin cruzar por UTC', () => {
    // fecha_baja es un `date`: con new Date('2026-07-01') el navegador la lee
    // como medianoche UTC y en Ecuador (-5) mostraría el 30/06.
    expect(etiquetaBaja({ estado_membresia: 'baja', fecha_baja: '2026-07-01' })).toBe('De baja · 01/07/2026');
  });

  it('omite la fecha cuando la baja no la tiene (bajas previas a v31)', () => {
    expect(etiquetaBaja({ estado_membresia: 'baja', fecha_baja: null })).toBe('De baja');
  });

  it('distingue inactivo de baja', () => {
    expect(etiquetaBaja({ estado_membresia: 'inactivo' })).toBe('Inactivo');
  });
});

describe('accionMembresia', () => {
  it('ofrece la acción contraria al estado actual', () => {
    expect(accionMembresia({ estado_membresia: 'activo' })).toBe('Dar de baja');
    expect(accionMembresia({ estado_membresia: 'baja' })).toBe('Reactivar');
  });
});
