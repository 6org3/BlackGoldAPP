import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Mail, ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { supabase, llegoPorEnlaceDeAuth } from '../api/supabaseClient';
import { useAuth } from '../AuthContext';
import { enviarEnlaceRecuperacion } from '../api/authService';
import { cambiarPasswordPropia } from '../api/accesosService';
import { validarPasswordNueva, MIN_PASSWORD } from '../lib/passwordPolicy';
import CutCard from '../components/arcade/CutCard';
import HexAvatar from '../components/arcade/HexAvatar';
import MicroLabel from '../components/arcade/MicroLabel';
import { C, BORDER, GRAD, GLOW, cut, gridBackground } from '../components/arcade/arcadeTokens';

/**
 * Recuperación de la contraseña por correo (entrega 3). Una sola ruta con dos
 * caras, porque el enlace del correo vuelve a esta misma dirección:
 *
 *  - 'pedir'  → la persona escribe su correo y se le manda el enlace.
 *  - 'elegir' → llegó desde ese enlace (supabase-js ya canjeó el token de la
 *               URL y hay sesión), así que ahora elige contraseña nueva.
 *
 * OJO con lo que esto NO cubre: solo funciona para cuentas con un correo REAL.
 * La de un atleta menor nace con el sintético `<cédula>@sinacceso…`, que no
 * existe como dominio. Por eso desde esta entrega el correo del representante
 * es obligatorio: él es quien puede recuperar.
 */
export default function RecuperarPasswordPage() {
  const navigate = useNavigate();
  const { confirmarPasswordCambiada } = useAuth();

  // Sin SMTP configurado en el proyecto, Supabase no manda nada (o lo manda
  // solo a los miembros del equipo, 2 por hora). Ofrecer el formulario en ese
  // estado sería prometer un correo que no llega: el club enciende esto cuando
  // el envío funciona, igual que hace con el captcha del registro.
  const recuperacionActiva = Boolean(import.meta.env.VITE_RECUPERACION_POR_CORREO);

  // Quien no viene de un enlace no tiene nada que resolver: va directo a pedir
  // uno. El `null` es solo para el que sí viene, mientras se espera su sesión.
  const [modo, setModo] = useState(llegoPorEnlaceDeAuth ? null : 'pedir');
  const [correo, setCorreo] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [visible, setVisible] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  // "Vengo del enlace" NO es lo mismo que "tengo sesión". El enlace abre una
  // sesión corriente, así que fiarse de que exista una haría que esta pantalla
  // le dijera "ya verificamos tu correo" a cualquiera que estuviera conectado —
  // y, peor, que quien quisiera PEDIR un enlace desde su propio teléfono no
  // llegara nunca al formulario. La marca la pone supabaseClient.js mirando la
  // URL antes de que supabase-js la limpie.
  //
  // Y hay una carrera real, comprobada en el navegador: supabase-js canjea el
  // token del hash de forma asíncrona, así que un `getSession()` de una sola
  // pasada al montar responde "no hay sesión" y el evento PASSWORD_RECOVERY
  // puede haber saltado antes de que este efecto registre su listener. Con
  // ambas señales perdidas, el enlace BUENO acababa mostrando "pídeselo al
  // club". Por eso se espera: los tokens están en la URL, la sesión va a
  // aparecer. Si tras unos segundos no aparece, el enlace caducó o ya se usó, y
  // eso sí hay que decirlo.
  useEffect(() => {
    let activo = true;
    const { data: listener } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY' && activo) setModo('elegir');
    });

    if (llegoPorEnlaceDeAuth) {
      (async () => {
        for (let intento = 0; intento < 12 && activo; intento++) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!activo) return;
          if (session) { setModo('elegir'); return; }
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!activo) return;
        setModo('pedir');
        setError('Ese enlace ya no sirve: caducó o alguien lo usó antes. Pide uno nuevo.');
      })();
    }

    return () => { activo = false; listener.subscription.unsubscribe(); };
  }, []);

  const pedirEnlace = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await enviarEnlaceRecuperacion(correo);
      setEnviado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const guardarPassword = async (e) => {
    e.preventDefault();
    setError('');
    const problema = validarPasswordNueva(nueva, { repetir });
    if (problema) {
      setError(problema);
      return;
    }
    setEnviando(true);
    try {
      // La misma vía que el cambio obligatorio: aplica la política server-side,
      // apaga `debe_cambiar_password` y devuelve sesión nueva (el cambio revoca
      // la anterior). Con `supabase.auth.updateUser` a secas, quien recuperase
      // su cuenta se toparía después con la pantalla de cambio obligatorio,
      // porque la marca seguiría puesta.
      const { session } = await cambiarPasswordPropia(nueva);
      // Se adopta esa sesión y se entra: la persona acaba de demostrar que
      // controla el correo Y de elegir la contraseña, así que devolverla al
      // login a escribir lo que acaba de teclear es fricción por nada. Si no
      // llegó sesión, sí toca volver a entrar — la vieja ya no existe.
      const sigueDentro = await confirmarPasswordCambiada(session);
      navigate(sigueDentro ? '/' : '/login', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña.');
      setEnviando(false);
    }
  };

  const campo = {
    width: '100%',
    background: C.cardAlt1,
    border: `1px solid ${BORDER.neutral}`,
    borderRadius: 8,
    padding: '13px 44px 13px 14px',
    color: C.text,
    fontSize: 16, // 16px o el navegador móvil hace zoom al enfocar
    minHeight: 44,
  };

  const volverAlLogin = (
    <button
      onClick={() => navigate('/login')}
      className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 active:scale-[0.99] transition mt-3"
      style={{ clipPath: cut(12), background: C.cardAlt1, color: C.text2, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: `1px solid ${BORDER.neutral}`, padding: '13px' }}
    >
      <ArrowLeft size={16} strokeWidth={2.5} />
      Volver a iniciar sesión
    </button>
  );

  const marco = (contenido) => (
    <div
      className="flex flex-col items-center justify-center min-h-dvh px-6 py-10 relative overflow-hidden"
      style={{ ...gridBackground, color: C.text }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md relative z-10">
        <CutCard cut={14} background={C.card} border={BORDER.neutral} padding="40px 28px" style={{ boxShadow: GLOW.phone }}>
          {contenido}
        </CutCard>
      </motion.div>
    </div>
  );

  if (modo === null) return null;

  // ─── Elegir la contraseña nueva (se llegó desde el enlace) ────────────────
  if (modo === 'elegir') {
    return marco(
      <>
        <div className="flex justify-center mb-6">
          <HexAvatar size={60} background={GRAD.goldHex} color={C.ink}>
            <KeyRound size={26} strokeWidth={2.5} />
          </HexAvatar>
        </div>
        <div className="text-center">
          <MicroLabel style={{ marginBottom: 10, color: C.gold }}>Recuperar acceso</MicroLabel>
          <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: C.text }}>
            Elige tu contraseña
          </h1>
          <p className="text-sm mb-7" style={{ color: C.text2 }}>
            Ya verificamos tu correo. Escribe una contraseña nueva y vuelve a entrar con ella.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-5 text-xs font-bold p-3"
            style={{ clipPath: cut(8), background: 'rgba(239,68,68,.12)', border: `1px solid ${BORDER.danger}`, color: C.danger }}>
            {error}
          </div>
        )}

        <form onSubmit={guardarPassword} className="space-y-4">
          <div>
            <label htmlFor="rec-nueva" className="block text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
              Contraseña nueva
            </label>
            <div className="relative">
              <input id="rec-nueva" type={visible ? 'text' : 'password'} autoComplete="new-password" autoFocus
                value={nueva} onChange={(e) => setNueva(e.target.value)} aria-describedby="rec-ayuda" style={campo} />
              <button type="button" onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                className="absolute right-0 top-0 h-full px-3 flex items-center"
                style={{ color: C.text2, background: 'none', border: 'none' }}>
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p id="rec-ayuda" className="mt-2 text-2xs" style={{ color: C.text2 }}>
              Mínimo {MIN_PASSWORD} caracteres. Una frase que recuerdes sirve: tres palabras seguidas ya llegan.
            </p>
          </div>
          <div>
            <label htmlFor="rec-repetir" className="block text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
              Repítela
            </label>
            <input id="rec-repetir" type={visible ? 'text' : 'password'} autoComplete="new-password"
              value={repetir} onChange={(e) => setRepetir(e.target.value)} style={campo} />
          </div>
          <button type="submit" disabled={enviando}
            className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 active:scale-[0.99] transition disabled:opacity-50"
            style={{ clipPath: cut(12), background: GRAD.goldCTA, color: C.ink, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', padding: '13px' }}>
            <ShieldCheck size={16} strokeWidth={2.5} />
            {enviando ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </>
    );
  }

  // ─── El club todavía no encendió el envío de correos ──────────────────────
  if (!recuperacionActiva) {
    return marco(
      <>
        <div className="flex justify-center mb-6">
          <HexAvatar size={60} background={GRAD.goldHex} color={C.ink}>
            <Mail size={26} strokeWidth={2.5} />
          </HexAvatar>
        </div>
        <div className="text-center">
          <MicroLabel style={{ marginBottom: 10, color: C.gold }}>Recuperar acceso</MicroLabel>
          <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: C.text }}>
            Pídeselo al club
          </h1>
          <p className="text-sm" style={{ color: C.text2 }}>
            Todavía no enviamos correos de recuperación. Escribe al club y te generan
            una contraseña nueva en el momento.
          </p>
        </div>
        {volverAlLogin}
      </>
    );
  }

  // ─── Pedir el enlace ──────────────────────────────────────────────────────
  return marco(
    <>
      <div className="flex justify-center mb-6">
        <HexAvatar size={60} background={GRAD.goldHex} color={C.ink}>
          <Mail size={26} strokeWidth={2.5} />
        </HexAvatar>
      </div>
      <div className="text-center">
        <MicroLabel style={{ marginBottom: 10, color: C.gold }}>Recuperar acceso</MicroLabel>
        <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: C.text }}>
          {enviado ? 'Revisa tu correo' : '¿Olvidaste tu contraseña?'}
        </h1>
        <p className="text-sm mb-7" style={{ color: C.text2 }}>
          {enviado
            /* Mismo mensaje exista o no la cuenta: si cambiara, esta pantalla
               diría desde fuera qué correos están registrados en el club. */
            ? 'Si hay una cuenta con ese correo, te acabamos de enviar un enlace para elegir una contraseña nueva. Si en unos minutos no llega, revisa el spam o pídele al club que te genere una.'
            : 'Escribe el correo que le diste al club. Si es el del representante, es ahí donde llega el enlace.'}
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-5 text-xs font-bold p-3"
          style={{ clipPath: cut(8), background: 'rgba(239,68,68,.12)', border: `1px solid ${BORDER.danger}`, color: C.danger }}>
          {error}
        </div>
      )}

      {!enviado && (
        <form onSubmit={pedirEnlace} className="space-y-4">
          <div>
            <label htmlFor="rec-correo" className="block text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
              Tu correo
            </label>
            <input id="rec-correo" type="email" autoComplete="email" required autoFocus
              value={correo} onChange={(e) => setCorreo(e.target.value)}
              placeholder="ejemplo@correo.com"
              style={{ ...campo, padding: '13px 14px' }} />
          </div>
          <button type="submit" disabled={enviando}
            className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 active:scale-[0.99] transition disabled:opacity-50"
            style={{ clipPath: cut(12), background: GRAD.goldCTA, color: C.ink, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', padding: '13px' }}>
            <Mail size={16} strokeWidth={2.5} />
            {enviando ? 'Enviando…' : 'Enviarme el enlace'}
          </button>
        </form>
      )}

      {volverAlLogin}
    </>
  );
}
