import { useCallback, useEffect, useRef, useState } from 'react';
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
const CB_LISTO = '__turnstileListo';
const SRC = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${CB_LISTO}`;

// Si el script no llegó en este tiempo se da por no disponible. Sin timeout,
// una red que traga la petición sin cerrarla (portal cautivo, DNS que responde
// pero no enruta) dejaría el formulario esperando para siempre.
const TIMEOUT_MS = 10000;

// Una sola carga por sesión aunque el componente se monte varias veces.
let cargaScript = null;
const cargarTurnstile = () => {
  if (window.turnstile) return Promise.resolve();
  if (cargaScript) return cargaScript;

  cargaScript = new Promise((resolve, reject) => {
    const fallar = (motivo) => {
      cargaScript = null; // permite reintentar
      delete window[CB_LISTO];
      reject(new Error(motivo));
    };
    const temporizador = setTimeout(() => fallar('timeout'), TIMEOUT_MS);

    // Se espera al callback `onload` de Cloudflare, no al evento load del
    // <script>: es el único momento en que `window.turnstile` existe seguro.
    // Con el evento load la API puede no estar aún montada, y el render se
    // saltaría en silencio dejando un hueco sin explicación.
    window[CB_LISTO] = () => {
      clearTimeout(temporizador);
      resolve();
    };

    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = 'true';
    s.onerror = () => {
      clearTimeout(temporizador);
      s.remove();
      fallar('error de red');
    };
    document.head.appendChild(s);
  });
  return cargaScript;
};

/**
 * @param {(token: string|null) => void} onToken  recibe el token, o null cuando
 *   expira/falla (el padre bloquea el envío mientras sea null).
 * @param {(disponible: boolean) => void} onDisponible  avisa si el captcha
 *   llegó a cargar. En false el padre debe DESBLOQUEAR el envío: si no, una red
 *   que bloquee challenges.cloudflare.com (AdGuard, NextDNS, un proxy escolar)
 *   dejaría el formulario público muerto sin explicación ni salida. El servidor
 *   sigue siendo la autoridad — rechazará si el captcha es obligatorio — pero
 *   así el visitante recibe un motivo en vez de un botón gris mudo.
 * @param {number} reintento  al cambiar, resetea el widget. Necesario porque el
 *   token de Turnstile es de UN SOLO USO: tras un envío fallido (cédula
 *   duplicada, 429…) el token ya se consumió en siteverify y hay que pedir uno
 *   nuevo, o el reintento fallaría siempre por captcha.
 */
export default function CaptchaTurnstile({ onToken, onDisponible, reintento = 0 }) {
  const contenedor = useRef(null);
  const widgetId = useRef(null);
  const [fallo, setFallo] = useState('');
  const [cargando, setCargando] = useState(Boolean(SITE_KEY));
  const [intentoCarga, setIntentoCarga] = useState(0);

  // Refs para no recrear el widget cuando el padre re-renderiza: montar de
  // nuevo reiniciaría el desafío y borraría el token ya resuelto.
  const onTokenRef = useRef(onToken);
  const onDisponibleRef = useRef(onDisponible);
  // Sin array de dependencias: se sincroniza tras cada render, y nunca durante
  // él (mutar un ref en el cuerpo del componente rompe el React Compiler).
  useEffect(() => {
    onTokenRef.current = onToken;
    onDisponibleRef.current = onDisponible;
  });

  useEffect(() => {
    if (!SITE_KEY || !contenedor.current) return undefined;
    let vivo = true;
    setCargando(true);
    setFallo('');

    cargarTurnstile()
      .then(() => {
        if (!vivo || !contenedor.current) return;
        setCargando(false);
        onDisponibleRef.current?.(true);
        widgetId.current = window.turnstile.render(contenedor.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          language: 'es',
          callback: (token) => { setFallo(''); onTokenRef.current(token); },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            onTokenRef.current(null);
            setFallo('No se pudo completar la verificación. Inténtalo de nuevo.');
          },
        });
      })
      .catch(() => {
        if (!vivo) return;
        setCargando(false);
        setFallo('No pudimos cargar la verificación anti-robot. Puede estar bloqueada por tu red o tu bloqueador de anuncios.');
        // Desbloquea el envío: que decida el servidor, no un botón mudo.
        onDisponibleRef.current?.(false);
      });

    return () => {
      vivo = false;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [intentoCarga]);

  // Reset explícito tras un intento fallido (ver JSDoc de `reintento`).
  useEffect(() => {
    if (!reintento || !widgetId.current || !window.turnstile) return;
    window.turnstile.reset(widgetId.current);
    setFallo('');
    onTokenRef.current(null);
  }, [reintento]);

  const reintentarCarga = useCallback(() => setIntentoCarga((n) => n + 1), []);

  if (!SITE_KEY) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={contenedor} />
      {cargando && (
        <p className="text-xs text-center" style={{ color: C.text2 }}>Cargando verificación…</p>
      )}
      {fallo && (
        <>
          <p role="alert" className="text-xs text-center" style={{ color: C.danger }}>{fallo}</p>
          <button
            type="button"
            onClick={reintentarCarga}
            className="cut-focus inline-flex items-center justify-center min-h-11 px-3 text-xs font-bold uppercase tracking-wide"
            style={{ color: C.gold, background: 'transparent', border: 'none' }}
          >
            Reintentar verificación
          </button>
        </>
      )}
    </div>
  );
}
