// La invariante: cerrar sesión deja el dispositivo limpio aunque el logout
// remoto no llegue. supabase-js no lo garantiza (return anticipado antes de
// _removeSession cuando el POST falla por red), y en el club padres y atletas
// comparten teléfono: un token superviviente significa que la siguiente
// persona entra a la cuenta de la anterior.
import { describe, it, expect } from 'vitest';
import { esClaveDeSesion, purgarSesionLocal } from './sesionLocal';

/** localStorage de mentira. Los helpers van como propiedades NO enumerables
 *  para que Object.keys() vea solo las claves guardadas, como el real. */
function storageFalso(inicial = {}) {
  const s = { ...inicial };
  Object.defineProperty(s, 'removeItem', { value: (k) => { delete s[k]; }, enumerable: false, configurable: true });
  Object.defineProperty(s, '_claves', { get: () => Object.keys(s), enumerable: false, configurable: true });
  return s;
}

describe('esClaveDeSesion', () => {
  it('reconoce la clave de sesión y sus fragmentos', () => {
    expect(esClaveDeSesion('sb-rpacqduboxkhetdlcgxb-auth-token')).toBe(true);
    expect(esClaveDeSesion('sb-rpacqduboxkhetdlcgxb-auth-token.0')).toBe(true);
    expect(esClaveDeSesion('sb-otroproyecto-auth-token')).toBe(true);
  });

  it('no toca claves que no son de sesión', () => {
    // Estas tres las escribe la app y deben sobrevivir al logout: son
    // preferencias de interfaz, no identidad.
    expect(esClaveDeSesion('bg-tab-atleta')).toBe(false);
    expect(esClaveDeSesion('theme')).toBe(false);
    expect(esClaveDeSesion('sb-algo-sin-token')).toBe(false);
    expect(esClaveDeSesion(undefined)).toBe(false);
    expect(esClaveDeSesion(null)).toBe(false);
  });
});

describe('purgarSesionLocal', () => {
  it('borra el token de sesión y conserva el resto', () => {
    const s = storageFalso({
      'sb-rpacqduboxkhetdlcgxb-auth-token': '{"access_token":"x"}',
      'sb-rpacqduboxkhetdlcgxb-auth-token.0': 'fragmento',
      'bg-tab-atleta': 'progreso',
      theme: 'dark',
    });

    const borradas = purgarSesionLocal(s);

    expect(borradas.sort()).toEqual([
      'sb-rpacqduboxkhetdlcgxb-auth-token',
      'sb-rpacqduboxkhetdlcgxb-auth-token.0',
    ]);
    expect(s._claves.sort()).toEqual(['bg-tab-atleta', 'theme']);
  });

  it('es idempotente: purgar dos veces no falla ni borra de más', () => {
    const s = storageFalso({ 'sb-x-auth-token': 'v', otra: '1' });
    purgarSesionLocal(s);
    expect(purgarSesionLocal(s)).toEqual([]);
    expect(s._claves).toEqual(['otra']);
  });

  it('no revienta si el storage no existe o está bloqueado', () => {
    expect(purgarSesionLocal(null)).toEqual([]);
    expect(purgarSesionLocal(undefined)).toEqual([]);
    const bloqueado = storageFalso({ 'sb-x-auth-token': 'v' });
    Object.defineProperty(bloqueado, 'removeItem', {
      value: () => { throw new Error('SecurityError: storage bloqueado'); },
      enumerable: false,
      configurable: true,
    });
    expect(() => purgarSesionLocal(bloqueado)).not.toThrow();
  });
});
