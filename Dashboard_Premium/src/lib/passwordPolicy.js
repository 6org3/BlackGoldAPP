// src/lib/passwordPolicy.js — reglas de la contraseña que ELIGE el usuario.
//
// La que reparte el club es aleatoria y la genera el servidor
// (supabase/functions/_shared/credenciales.ts). Este módulo gobierna la otra
// mitad: la que la persona pone en su lugar la primera vez que entra.
//
// Quien manda es el servidor — la Edge Function cambiar-password repite estas
// comprobaciones antes de tocar Auth, porque una validación que solo vive en
// el navegador se salta abriendo la consola. Aquí están para dar un mensaje
// claro en español en vez del error crudo de GoTrue, y el test
// src/lib/passwordPolicy.test.js falla si las dos copias se desincronizan.

// 12 caracteres. NIST SP 800-63B-4 pone el mínimo en 8 y recomienda 15 para
// secretos memorizados; 12 es el punto medio defendible aquí, donde no hay
// segundo factor y detrás de cada cuenta hay datos de salud de un menor.
// Sin reglas de composición (mayúsculas/símbolos obligatorios): el mismo NIST
// las desaconseja porque empujan a 'Basket2026!' — una frase de tres palabras
// llega a 12 sin esfuerzo y resiste mucho más.
export const MIN_PASSWORD = 12;

// Longitud máxima de bcrypt (72 BYTES): a partir de ahí GoTrue trunca en
// silencio, así que se corta antes con un mensaje en vez de dejar que la
// persona crea que su frase larguísima cuenta entera.
export const MAX_PASSWORD = 72;

// Se comparan en minúsculas y sin espacios: 'Basket Coca' y 'basketcoca' son
// la misma idea para quien intenta adivinar.
const normalizar = (valor) => String(valor ?? '').trim().toLowerCase().replace(/\s+/g, '');

// Longitud a partir de la cual una corrida seguida ('123456', 'abcdef', en
// cualquier sentido) delata que la contraseña se tecleó de un tirón. Seis es
// seguro: ninguna palabra del español encadena seis letras consecutivas del
// abecedario, así que no marca frases legítimas.
const CORRIDA_MAXIMA = 6;

// Mínimo de caracteres DISTINTOS. Con 12 de largo, menos de cinco distintos
// significa un patrón repetido ('aaaaaaaaaaaa', 'aabbaabbaabb').
const DISTINTOS_MINIMO = 5;

const esTrivial = (password) => {
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

/**
 * Valida la contraseña nueva que eligió el usuario.
 *
 * @param {string} nueva
 * @param {object} [contexto]
 * @param {string} [contexto.repetir]   segunda escritura, para detectar erratas
 * @param {string[]} [contexto.datosPersonales]  cédula, teléfono, correo… todo
 *        lo que el club ya conoce de esa persona y por tanto no puede ser su
 *        contraseña. Se ignoran los vacíos.
 * @returns {string|null} el problema en español, o null si la contraseña vale.
 */
export function validarPasswordNueva(nueva, { repetir, datosPersonales = [] } = {}) {
  const password = String(nueva ?? '');

  if (!password) return 'Escribe tu contraseña nueva.';

  if (password.length < MIN_PASSWORD) {
    return `Tu contraseña necesita al menos ${MIN_PASSWORD} caracteres. Una frase que recuerdes sirve: tres palabras seguidas ya llegan.`;
  }

  // Se mide en bytes, no en caracteres: una ñ o una tilde ocupan dos.
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
      // De un correo también se descarta la parte de antes de la arroba:
      // 'ana@gmail.com' y 'ana' son igual de adivinables.
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
