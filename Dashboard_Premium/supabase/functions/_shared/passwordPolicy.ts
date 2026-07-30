// _shared/passwordPolicy.ts — copia SERVIDOR de src/lib/passwordPolicy.js.
//
// Es la que manda. La del navegador existe para dar un mensaje decente mientras
// la persona escribe; esta decide, porque cualquier validación que solo viva en
// el cliente se salta abriendo la consola.
//
// Son dos archivos y no uno porque el árbol de Edge Functions se empaqueta solo
// con lo que cuelga de supabase/functions/ (por eso existe
// scripts/sync_edge_shared.mjs), y src/ queda fuera. El test
// src/lib/passwordPolicy.test.js compara ambos y falla si divergen: si tocas
// una regla aquí, tócala allá.

export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 72;

const normalizar = (valor: unknown): string =>
  String(valor ?? '').trim().toLowerCase().replace(/\s+/g, '');

const CORRIDA_MAXIMA = 6;
const DISTINTOS_MINIMO = 5;

const esTrivial = (password: string): boolean => {
  const p = password.toLowerCase();
  if (new Set(p).size < DISTINTOS_MINIMO) return true;
  let corridaAsc = 1;
  let corridaDesc = 1;
  for (let i = 1; i < p.length; i++) {
    const salto = p.charCodeAt(i) - p.charCodeAt(i - 1);
    corridaAsc = salto === 1 ? corridaAsc + 1 : 1;
    corridaDesc = salto === -1 ? corridaDesc + 1 : 1;
    if (corridaAsc >= CORRIDA_MAXIMA || corridaDesc >= CORRIDA_MAXIMA) return true;
  }
  return false;
};

export function validarPasswordNueva(
  nueva: unknown,
  { repetir, datosPersonales = [] }: { repetir?: string; datosPersonales?: (string | null | undefined)[] } = {},
): string | null {
  const password = String(nueva ?? '');

  if (!password) return 'Escribe tu contraseña nueva.';

  if (password.length < MIN_PASSWORD) {
    return `Tu contraseña necesita al menos ${MIN_PASSWORD} caracteres. Una frase que recuerdes sirve: tres palabras seguidas ya llegan.`;
  }

  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return `Tu contraseña es demasiado larga. Recórtala un poco (el máximo son ${MAX_PASSWORD} caracteres).`;
  }

  if (repetir !== undefined && password !== repetir) {
    return 'Las dos contraseñas no coinciden.';
  }

  const objetivo = normalizar(password);
  const conocidos = datosPersonales
    .flatMap((dato) => {
      const limpio = normalizar(dato);
      if (!limpio) return [];
      const local = limpio.includes('@') ? limpio.split('@')[0] : null;
      return local ? [limpio, local] : [limpio];
    })
    .filter(Boolean);

  if (conocidos.includes(objetivo)) {
    return 'Tu contraseña no puede ser tu cédula, tu teléfono ni tu correo: en el club esos datos los conoce cualquiera.';
  }

  if (esTrivial(password)) {
    return 'Esa contraseña es demasiado fácil de adivinar. Prueba con una frase que solo tú recuerdes.';
  }

  return null;
}
