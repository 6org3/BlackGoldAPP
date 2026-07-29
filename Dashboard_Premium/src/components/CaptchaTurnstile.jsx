import { useEffect, useRef, useState } from 'react';
import { C } from './arcade/arcadeTokens';

// Widget anti-robot (Cloudflare Turnstile) del formulario público de registro.
//
// OPCIONAL POR DISEÑO: sin `VITE_TURNSTILE_SITE_KEY` no renderiza nada y el
// formulario funciona igual. El captcha exige una cuenta de Cloudflare y dos
// claves que solo el dueño puede emitir; hacerlo obligatorio sin ellas dejaría
// caída la inscripción. El freno que SÍ está siempre activo es el límite por
// IP y por club de la Edge Function (v52 §5 + v53).
//
// La verificación real ocurre server-side: este widget solo produce un token
// que `registro-publico` valida contra siteverify con el SECRETO (que nunca
// llega al navegador). Un cliente que no mande token —o mande uno inventado—
// es rechazado allí, así que quitar este componente desde el navegador no
// salta nada.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Una sola carga del script por sesión, aunque el componente se monte varias
// veces. La promesa se comparte entre montajes.
let cargaScript = null;
const cargarTurnstile = () => {
  if (window.turnstile) return Promise.resolve();
  if (cargaScript) return cargaScript;

  cargaScript = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      cargaScript = null; // permite reintentar en un montaje posterior
      reject(new Error('No se pudo cargar la verificación anti-robot.'));
    };
    document.head.appendChild(s);
  });
  return cargaScript;
};

/**
 * @param {(token: string|null) => void} onToken  recibe el token, o null cuando
 *   expira/falla (el padre debe deshabilitar el envío mientras sea null).
 * @param {number} reintento  al cambiar, resetea el widget. Necesario porque el
 *   token de Turnstile es de UN SOLO USO: tras un envío fallido (cédula
 *   duplicada, 429…) el token ya se consumió en siteverify y hay que pedir uno
 *   nuevo, o el reintento fallaría siempre por captcha.
 */
export default function CaptchaTurnstile({ onToken, reintento = 0 }) {
  const contenedor = useRef(null);
  const widgetId = useRef(null);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    if (!SITE_KEY || !contenedor.current) return undefined;
    let vivo = true;

    cargarTurnstile()
      .then(() => {
        if (!vivo || !contenedor.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(contenedor.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          language: 'es',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => {
            onToken(null);
            setFallo('No se pudo completar la verificación anti-robot.');
          },
        });
      })
      .catch((e) => { if (vivo) setFallo(e.message); });

    return () => {
      vivo = false;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
    // onToken se omite a propósito: recrear el widget en cada render del padre
    // reiniciaría el desafío y borraría el token que el usuario ya resolvió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset explícito tras un intento fallido (ver JSDoc de `reintento`).
  useEffect(() => {
    if (!reintento || !widgetId.current || !window.turnstile) return;
    window.turnstile.reset(widgetId.current);
    onToken(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reintento]);

  if (!SITE_KEY) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={contenedor} />
      {fallo && <p role="alert" className="text-xs text-center" style={{ color: C.danger }}>{fallo}</p>}
    </div>
  );
}
