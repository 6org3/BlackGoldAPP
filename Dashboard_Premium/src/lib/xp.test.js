// Tests de la tabla única de XP base por sesión (analytics-core/xp.js).
// Debe replicar EXACTAMENTE los valores que antes estaban hardcodeados en
// ModoCanchaModal.handleCerrarClase y sesionesService.evaluarSesion.
import { describe, it, expect } from 'vitest';
import { xpBaseSesion, XP_BASE_SESION } from '../../../packages/analytics-core/xp.js';

describe('xpBaseSesion', () => {
  it('Privada 1v1 → 50', () => {
    expect(xpBaseSesion('Privada 1v1')).toBe(50);
    expect(xpBaseSesion('Pilar:Físico | Privada 1v1')).toBe(50); // formato notas de Modo Cancha
  });

  it('Grupal Individualizada → 35 (antes que el genérico Grupal)', () => {
    expect(xpBaseSesion('Grupal Individualizada')).toBe(35);
  });

  it('Grupal (Niveles) por nivel: Micro 20 / Desarrollo 30 / Elite 40', () => {
    expect(xpBaseSesion('Grupal (Niveles) - Micro')).toBe(20);
    expect(xpBaseSesion('Grupal (Niveles) - Desarrollo')).toBe(30);
    expect(xpBaseSesion('Grupal (Niveles) - Elite')).toBe(40);
  });

  it('Grupal (Niveles) sin nivel explícito → Micro (20)', () => {
    expect(xpBaseSesion('Grupal (Niveles)')).toBe(20);
  });

  it('desconocido / vacío / null → default 20', () => {
    expect(xpBaseSesion('')).toBe(20);
    expect(xpBaseSesion(null)).toBe(20);
    expect(xpBaseSesion(undefined)).toBe(20);
    expect(xpBaseSesion('cualquier cosa')).toBe(20);
  });

  it('la tabla exporta los 5 valores canónicos', () => {
    expect(XP_BASE_SESION).toMatchObject({
      privada_1v1: 50, grupal_individualizada: 35, micro: 20, desarrollo: 30, elite: 40,
    });
  });
});
