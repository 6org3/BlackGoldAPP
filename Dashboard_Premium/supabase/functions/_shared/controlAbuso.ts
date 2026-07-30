// _shared/controlAbuso.ts — control de abuso del único endpoint público.
// (`leerLimite` es genérico y lo reusa también `copiloto` para su cuota diaria.)
//
// Motivo (hallazgo P1-6 de la auditoría pre-producción, 2026-07-29):
// `registro-publico` es la ÚNICA Edge Function sin `autenticar()` — tiene que
// serlo, es el formulario de inscripción de un desconocido. Sin freno, cada
// POST con una cédula nueva inserta filas reales y crea una cuenta de Auth
// confirmada (consume MAU). El daño dirigido es peor que el spam: como
// `usuarios.cedula` es UNIQUE, mandar la cédula REAL de una persona la ocupa
// de forma permanente y esa persona ya no puede inscribirse — deshacerlo
// exige que el owner la rechace y que un superadmin la purgue (v45).
//
// Dos frenos, deliberadamente distintos:
//   · por IP    — cuenta TODO intento que llegó a la fase de escritura, con
//                 éxito o sin él. Es el que corta el barrido de cédulas: al
//                 atacante le sirven igual los fallos ("esa cédula existe").
//   · por club  — cuenta solo los ÉXITOS. Si contara los fallos, cualquiera
//                 podría agotar la cuota de un club con puros errores y
//                 dejarlo sin inscripciones: un DoS más barato que el abuso
//                 que se quiere frenar.
//
// Los umbrales se leen del entorno para poder ajustarlos desde el panel de
// Supabase sin tocar código ni redesplegar la función.

// Defaults. El de IP es intencionalmente holgado: en Ecuador el móvil sale
// por CGNAT (cientos de abonados comparten IP pública) y en el club varias
// familias se inscriben desde el mismo wifi, así que un umbral agresivo
// bloquea inscripciones legítimas. Cinco por hora deja pasar a una familia
// con varios hijos y aun así frena el alta masiva.
export const LIMITE_IP_HORA_DEFAULT = 5;
export const LIMITE_CLUB_DIA_DEFAULT = 20;

export const leerLimite = (nombre: string, porDefecto: number): number => {
  const crudo = Deno.env.get(nombre);
  const n = crudo ? Number(crudo) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto;
};

// IP del registrante. Orden de preferencia por CONFIABILIDAD, no por comodidad:
//
// 1. `cf-connecting-ip` — la escribe Cloudflare (el borde por el que entran las
//    Edge Functions) SOBRESCRIBIENDO lo que mande el cliente: no es falsificable.
// 2. `x-real-ip` — misma idea, la pone el proxy, valor único.
// 3. `x-forwarded-for` — se toma el ÚLTIMO segmento, no el primero. La cadena
//    es "cliente, proxy1, proxy2…" y cada salto ANEXA a quien le habló, así que
//    los primeros elementos son exactamente los que un atacante puede inventar
//    (`X-Forwarded-For: 1.2.3.4` rotando en cada request haría inútil el
//    límite). El último lo escribió el salto de confianza más cercano.
//
// Sin ninguno de los tres se devuelve 'desconocida': todas esas peticiones caen
// en el mismo cubo y se limitan juntas. Es deliberado — preferimos frenar de
// más a dejar una vía sin contador.
export const ipDeRequest = (headers: Headers): string => {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;

  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const partes = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1];
  }
  return 'desconocida';
};

// Verificación server-side del captcha (Cloudflare Turnstile).
//
// OPCIONAL A PROPÓSITO: si `TURNSTILE_SECRET_KEY` no está configurada en el
// entorno de la función, se omite la verificación y el registro sigue
// funcionando solo con los límites de arriba. El captcha exige una cuenta de
// Cloudflare y dos claves que solo el dueño puede emitir; exigirlo sin ellas
// dejaría el formulario de inscripción caído. Los límites por IP y por club NO
// son opcionales: esos aplican siempre.
//
// El secreto viaja SOLO por variable de entorno. Este repositorio es PÚBLICO:
// una clave escrita aquí queda publicada y habría que rotarla.
export type ResultadoCaptcha = { ok: true } | { ok: false; motivo: string };

export async function verificarCaptcha(
  token: string | null | undefined,
  ip: string,
  secreto: string | null | undefined,
): Promise<ResultadoCaptcha> {
  if (!secreto) return { ok: true }; // captcha no configurado: ver nota de arriba.
  if (!token) return { ok: false, motivo: 'Falta la verificación anti-robot. Recarga la página e inténtalo de nuevo.' };

  const cuerpo = new URLSearchParams({ secret: secreto, response: token });
  if (ip && ip !== 'desconocida') cuerpo.set('remoteip', ip);

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
    });
    const datos = await r.json() as { success?: boolean; 'error-codes'?: string[] };
    if (datos?.success) return { ok: true };
    console.error('[registro-publico] captcha rechazado:', datos?.['error-codes']);
    return { ok: false, motivo: 'No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.' };
  } catch (e) {
    // Cloudflare caído o sin salida de red. Se FRENA el registro (fail-closed):
    // con el captcha activado, dejar pasar ante un fallo del verificador abre
    // justo el agujero que el captcha cierra — y basta tumbar/bloquear ese
    // dominio para desactivarlo.
    console.error('[registro-publico] captcha no verificable:', (e as Error).message);
    return { ok: false, motivo: 'No pudimos completar la verificación anti-robot. Inténtalo en unos minutos.' };
  }
}
