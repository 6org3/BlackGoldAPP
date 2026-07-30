// Generación de la contraseña inicial (entrega 1 del arranque con datos reales).
// El módulo vive en supabase/functions/_shared/ porque lo consumen dos Edge
// Functions (Deno), pero es puro y se prueba aquí: es la pieza que sustituye al
// patrón "la contraseña es la cédula", así que conviene fijar sus garantías.
import { describe, it, expect } from 'vitest';
import {
  generarPasswordTemporal,
  MARCA_PASSWORD_TEMPORAL,
} from '../../supabase/functions/_shared/credenciales.ts';

describe('generarPasswordTemporal', () => {
  it('tiene 14 caracteres por defecto y respeta el largo pedido', () => {
    expect(generarPasswordTemporal()).toHaveLength(14);
    expect(generarPasswordTemporal(20)).toHaveLength(20);
  });

  it('no repite: 500 contraseñas seguidas son todas distintas', () => {
    const vistas = new Set();
    for (let i = 0; i < 500; i++) vistas.add(generarPasswordTemporal());
    expect(vistas.size).toBe(500);
  });

  it('excluye los caracteres que se confunden al dictarla o copiarla a mano', () => {
    // Estas contraseñas se dictan por teléfono o se copian de un papel: un cero
    // leído como O es una llamada al club.
    const prohibidos = /[O0lI1]/;
    for (let i = 0; i < 200; i++) {
      expect(generarPasswordTemporal()).not.toMatch(prohibidos);
    }
  });

  it('usa solo el alfabeto declarado', () => {
    const permitidos = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/;
    for (let i = 0; i < 100; i++) {
      expect(generarPasswordTemporal()).toMatch(permitidos);
    }
  });

  it('reparte sin sesgo perceptible: ningún carácter domina la salida', () => {
    // El descarte de bytes por encima del múltiplo del alfabeto existe justo
    // para esto; sin él los primeros caracteres saldrían más.
    const frecuencia = new Map();
    const total = 20000;
    for (let i = 0; i < total / 10; i++) {
      for (const ch of generarPasswordTemporal(10)) {
        frecuencia.set(ch, (frecuencia.get(ch) ?? 0) + 1);
      }
    }
    const esperado = total / 57;           // 57 caracteres en el alfabeto
    for (const [, n] of frecuencia) {
      expect(n).toBeGreaterThan(esperado * 0.5);
      expect(n).toBeLessThan(esperado * 1.5);
    }
  });
});

describe('MARCA_PASSWORD_TEMPORAL', () => {
  it('marca que la contraseña debe cambiarse', () => {
    expect(MARCA_PASSWORD_TEMPORAL).toEqual({ debe_cambiar_password: true });
  });
});
