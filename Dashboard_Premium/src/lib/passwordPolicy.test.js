import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarPasswordNueva, MIN_PASSWORD, MAX_PASSWORD } from './passwordPolicy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('validarPasswordNueva', () => {
  const BUENA = 'canasta de tres puntos';

  it('acepta una frase larga y corriente', () => {
    expect(validarPasswordNueva(BUENA)).toBeNull();
  });

  it('exige el mínimo de caracteres', () => {
    expect(validarPasswordNueva('corta')).toMatch(new RegExp(`${MIN_PASSWORD} caracteres`));
    expect(validarPasswordNueva('a'.repeat(MIN_PASSWORD - 1))).not.toBeNull();
  });

  it('no deja pasar una contraseña vacía', () => {
    expect(validarPasswordNueva('')).toBe('Escribe tu contraseña nueva.');
    expect(validarPasswordNueva(null)).toBe('Escribe tu contraseña nueva.');
    expect(validarPasswordNueva(undefined)).toBe('Escribe tu contraseña nueva.');
  });

  it('mide el máximo en BYTES, que es donde bcrypt trunca', () => {
    const frase = 'una canasta de tres puntos en el ultimo segundo del partido ';
    // 72 caracteres ASCII entran justos; el 73 ya no.
    expect(validarPasswordNueva(frase.repeat(2).slice(0, MAX_PASSWORD))).toBeNull();
    expect(validarPasswordNueva(frase.repeat(2).slice(0, MAX_PASSWORD + 1))).toMatch(/demasiado larga/);
    // Y 72 eñes son 144 bytes: la cuenta va en bytes, no en caracteres.
    expect(validarPasswordNueva('ñ'.repeat(MAX_PASSWORD))).toMatch(/demasiado larga/);
  });

  it('detecta la errata al repetirla', () => {
    expect(validarPasswordNueva(BUENA, { repetir: BUENA })).toBeNull();
    expect(validarPasswordNueva(BUENA, { repetir: 'canasta de dos puntos' })).toBe(
      'Las dos contraseñas no coinciden.'
    );
  });

  it('no compara con el repetir si no se manda', () => {
    // La Edge Function solo recibe la contraseña, no la segunda escritura.
    expect(validarPasswordNueva(BUENA, { repetir: undefined })).toBeNull();
  });

  it('rechaza los datos que el club ya conoce de la persona', () => {
    const datosPersonales = ['1723456789', 'ana.morales@correo.com', '0998877665'];
    // La cédula es el caso que motivó toda la entrega.
    expect(validarPasswordNueva('1723456789012', { datosPersonales: ['1723456789012'] }))
      .toMatch(/no puede ser tu cédula/);
    expect(validarPasswordNueva('ana.morales@correo.com', { datosPersonales }))
      .toMatch(/no puede ser tu cédula/);
    // También la parte de antes de la arroba, por sí sola.
    expect(validarPasswordNueva('ana.morales@otro.com', { datosPersonales: ['ana.morales@otro.com'] }))
      .not.toBeNull();
    expect(validarPasswordNueva(BUENA, { datosPersonales })).toBeNull();
  });

  it('compara sin distinguir mayúsculas ni espacios', () => {
    expect(validarPasswordNueva('Ana Morales Vera', { datosPersonales: ['anamoralesvera'] }))
      .not.toBeNull();
  });

  it('ignora los datos personales vacíos', () => {
    // Casi ningún atleta tiene correo: null/'' no deben invalidar nada.
    expect(validarPasswordNueva(BUENA, { datosPersonales: [null, '', undefined] })).toBeNull();
  });

  it('rechaza lo trivial de adivinar', () => {
    expect(validarPasswordNueva('aaaaaaaaaaaaaa')).toMatch(/fácil de adivinar/);
    expect(validarPasswordNueva('123456789012')).toMatch(/fácil de adivinar/);
    expect(validarPasswordNueva('abcdefghijkl')).toMatch(/fácil de adivinar/);
    expect(validarPasswordNueva('lkjihgfedcba')).toMatch(/fácil de adivinar/);
  });

  it('no confunde una frase normal con una corrida de teclado', () => {
    // 'abc' dentro de algo más largo no la vuelve trivial.
    expect(validarPasswordNueva('abcaneta de baloncesto')).toBeNull();
    expect(validarPasswordNueva('mi hijo juega 123')).toBeNull();
  });

  it('aplica las reglas en orden: primero la longitud', () => {
    // Una contraseña corta E igual a la cédula avisa de lo primero que ve la
    // persona al escribir, no de lo último.
    expect(validarPasswordNueva('1723456', { datosPersonales: ['1723456'] }))
      .toMatch(new RegExp(`${MIN_PASSWORD} caracteres`));
  });
});

// La copia que MANDA es la del servidor (la del navegador se salta abriendo la
// consola), pero tienen que decir lo mismo: si no, el formulario aceptaría algo
// que la Edge Function rechaza y la persona vería un error que no entiende.
describe('la copia del servidor no se desincroniza', () => {
  const servidor = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'supabase', 'functions', '_shared', 'passwordPolicy.ts'),
    'utf8'
  );

  it('comparte los mismos límites', () => {
    expect(servidor).toContain(`export const MIN_PASSWORD = ${MIN_PASSWORD};`);
    expect(servidor).toContain(`export const MAX_PASSWORD = ${MAX_PASSWORD};`);
  });

  it('comparte los mismos mensajes para el usuario', () => {
    const cliente = fs.readFileSync(path.join(__dirname, 'passwordPolicy.js'), 'utf8');
    // Los mensajes son literales entre comillas simples o plantillas; se
    // comparan los que empiezan por las palabras de cada regla.
    const mensajes = (fuente) =>
      (fuente.match(/return\s+[`'][^`']*[`'];/g) ?? []).map((m) => m.replace(/^return\s+|;$/g, ''));
    expect(mensajes(servidor)).toEqual(mensajes(cliente));
  });

  it('comparte las mismas reglas, en el mismo orden', () => {
    // Firma barata de la lógica: la secuencia de condiciones de cada archivo.
    const condiciones = (fuente) => (fuente.match(/if \((.*?)\) return/g) ?? []);
    expect(condiciones(servidor)).toEqual(condiciones(fs.readFileSync(path.join(__dirname, 'passwordPolicy.js'), 'utf8')));
  });
});
