import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, User, Phone, Loader2, CheckCircle2 } from 'lucide-react';
import { registrarDesdeFormularioPublico, fetchClubesPublicos } from '../api/registroPublicoService';
import { calcularEdad } from '../api/utilsAtletas';
import CutCard from '../components/arcade/CutCard';
import HexAvatar from '../components/arcade/HexAvatar';
import MicroLabel from '../components/arcade/MicroLabel';
import { C, BORDER, GRAD, GLOW, TINT, cut, gridBackground } from '../components/arcade/arcadeTokens';

/* Campo del Formulario-HUD (design_system_arcade.md §6.3): borde y foco por
   clase (el foco dorado no debe quedar pisado por un borde inline); color,
   forma cortada y fondo por arcadeTokens. */
const FIELD_CLASS =
  'cut-focus arcade-input w-full min-h-11 px-4 py-3 text-base md:text-sm border border-white/10 focus:outline-none focus:border-brand/60 transition-colors';
const FIELD_STYLE = { clipPath: cut(7), background: C.cardAlt1, color: C.text };

function LabelHUD({ htmlFor, required, children }) {
  return (
    <MicroLabel as="label" htmlFor={htmlFor} style={{ display: 'block', marginBottom: 6 }}>
      {children}
      {required && <span style={{ color: C.danger }}> *</span>}
    </MicroLabel>
  );
}

export default function RegistroPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [datosAtleta, setDatosAtleta] = useState({
    nombre: '',
    cedula: '',
    correo: '',
    telefono: '',
    fecha_nacimiento: '',
    posicion: 'N/A',
    club: '',
    genero: 'Masculino'
  });

  const [datosPadre, setDatosPadre] = useState({
    nombre: '',
    correo: '',
    telefono: ''
  });

  const edadAtleta = datosAtleta.fecha_nacimiento ? calcularEdad(datosAtleta.fecha_nacimiento) : null;
  const esMenorEdad = edadAtleta !== null && edadAtleta < 18;

  const posiciones = ['N/A', 'Generador', 'Alero Físico', 'Ancla Fuerte', 'Escolta', 'Ala-Pívot'];

  // Clubes reales que aceptan inscripción (v33): la RPC pública reemplaza a la
  // lista hardcodeada de antes, que ofrecía clubes inexistentes.
  const [clubes, setClubes] = useState([]);
  useEffect(() => {
    fetchClubesPublicos()
      .then(setClubes)
      .catch(() => setError('No se pudo cargar la lista de clubes. Recarga la página.'));
  }, []);

  const handleAtletaChange = (e) => setDatosAtleta({ ...datosAtleta, [e.target.name]: e.target.value });
  const handlePadreChange = (e) => setDatosPadre({ ...datosPadre, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError('');
    try {
      await registrarDesdeFormularioPublico(datosAtleta, esMenorEdad ? datosPadre : null);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al registrar.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-dvh px-6 relative overflow-hidden"
        style={{ ...gridBackground, color: C.text }}
      >
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md relative z-10">
          <CutCard cut={14} background={C.card} border={BORDER.okSoft} padding="40px 28px" style={{ boxShadow: GLOW.phone, textAlign: 'center' }}>
            <CheckCircle2 className="w-16 h-16 mx-auto mb-6" style={{ color: C.ok }} />
            <h2 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: C.ok }}>¡Solicitud enviada!</h2>
            <p className="text-sm mb-8" style={{ color: C.text2 }}>
              Tu inscripción quedó pendiente de aprobación por el club. Puedes iniciar
              sesión con tu cédula (contraseña inicial: tu misma cédula) para consultar
              el estado de tu solicitud.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="cut-focus w-full flex items-center justify-center min-h-11 active:scale-[0.99] transition"
              style={{ clipPath: cut(12), background: GRAD.greenCTA, color: C.inkGreen, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', padding: '13px' }}
            >
              Ir a iniciar sesión
            </button>
          </CutCard>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center min-h-dvh px-4 py-10 relative overflow-hidden"
      style={{ ...gridBackground, color: C.text }}
    >
      {/* Entrada solo con opacity: el MotionConfig global reducedMotion="user"
          (main.jsx) congela los transforms en su valor `initial`; un y/scale de
          entrada dejaría la tarjeta desplazada y los hit-targets bajo 44px para
          usuarios con reduced-motion. */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-lg relative z-10">
        {/* Identidad */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <HexAvatar size={60} background={GRAD.goldHex} color={C.ink}>
              <Sparkles size={26} strokeWidth={2.5} />
            </HexAvatar>
          </div>
          <h1 className="text-2xl font-black tracking-tight uppercase" style={{ color: C.text }}>
            Black <span style={{ color: C.gold }}>Gold</span>
          </h1>
          <MicroLabel style={{ marginTop: 6 }}>Registro de nuevos prospectos</MicroLabel>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="text-center px-3 py-2.5"
              style={{ clipPath: cut(6), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger, fontSize: 12, fontWeight: 700 }}
            >
              {error}
            </div>
          )}

          {/* Datos del atleta */}
          <CutCard cut={12} background={C.card} border={BORDER.neutral} padding="20px" style={{ boxShadow: GLOW.phone }}>
            <div className="flex items-center gap-2 mb-5">
              <User size={16} style={{ color: C.text3 }} />
              <MicroLabel size={11} style={{ color: C.text2 }}>Datos del atleta</MicroLabel>
            </div>

            <div className="space-y-4">
              <div>
                <LabelHUD htmlFor="reg-cedula">Cédula del jugador</LabelHUD>
                <input id="reg-cedula" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={10} name="cedula" value={datosAtleta.cedula} onChange={handleAtletaChange} required className={FIELD_CLASS} style={FIELD_STYLE} placeholder="Cédula o ID" />
              </div>

              <div>
                <LabelHUD htmlFor="reg-nombre" required>Nombre completo</LabelHUD>
                <input id="reg-nombre" type="text" name="nombre" autoComplete="section-atleta name" value={datosAtleta.nombre} onChange={handleAtletaChange} required className={FIELD_CLASS} style={FIELD_STYLE} placeholder="Ej. Michael Jordan" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <LabelHUD htmlFor="reg-genero" required>Género</LabelHUD>
                  <select id="reg-genero" name="genero" value={datosAtleta.genero} onChange={handleAtletaChange} className={FIELD_CLASS} style={FIELD_STYLE}>
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                  </select>
                </div>
                <div>
                  <LabelHUD htmlFor="reg-posicion">Posición</LabelHUD>
                  <select id="reg-posicion" name="posicion" value={datosAtleta.posicion} onChange={handleAtletaChange} className={FIELD_CLASS} style={FIELD_STYLE}>
                    {posiciones.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <LabelHUD htmlFor="reg-telefono">Teléfono (opcional)</LabelHUD>
                  <input id="reg-telefono" type="tel" name="telefono" autoComplete="section-atleta tel" value={datosAtleta.telefono} onChange={handleAtletaChange} className={FIELD_CLASS} style={FIELD_STYLE} placeholder="0999999999" />
                </div>
                <div>
                  <LabelHUD htmlFor="reg-correo">Correo electrónico (opcional)</LabelHUD>
                  <input id="reg-correo" type="email" name="correo" autoComplete="section-atleta email" value={datosAtleta.correo} onChange={handleAtletaChange} className={FIELD_CLASS} style={FIELD_STYLE} placeholder="ejemplo@correo.com" />
                </div>
              </div>

              <div>
                <LabelHUD htmlFor="reg-fecha-nacimiento" required>Fecha de nacimiento</LabelHUD>
                <input id="reg-fecha-nacimiento" type="date" name="fecha_nacimiento" autoComplete="section-atleta bday" value={datosAtleta.fecha_nacimiento} onChange={handleAtletaChange} required className={FIELD_CLASS} style={FIELD_STYLE} />
              </div>

              <div>
                <LabelHUD htmlFor="reg-club" required>Club al que deseas inscribirte</LabelHUD>
                <select id="reg-club" name="club" value={datosAtleta.club} onChange={handleAtletaChange} required className={FIELD_CLASS} style={FIELD_STYLE}>
                  <option value="">{clubes.length ? 'Selecciona tu club' : 'Cargando clubes…'}</option>
                  {clubes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="mt-1.5" style={{ color: C.text3, fontSize: 11 }}>
                  El club revisará tu solicitud antes de aprobar tu ingreso.
                </p>
              </div>
            </div>
          </CutCard>

          {/* Representante legal (solo menores de edad) */}
          {esMenorEdad && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <CutCard cut={12} background={C.card} border={BORDER.okSoft} padding="20px">
                <div className="flex items-center gap-2 mb-5">
                  <Phone size={15} style={{ color: C.ok }} />
                  <MicroLabel size={10.5} style={{ color: C.ok }}>Representante legal obligatorio (menor de edad)</MicroLabel>
                </div>

                <div className="space-y-4">
                  <div>
                    <LabelHUD htmlFor="reg-rep-nombre" required>Nombre completo del representante</LabelHUD>
                    <input id="reg-rep-nombre" type="text" name="nombre" autoComplete="section-representante name" value={datosPadre.nombre} onChange={handlePadreChange} required={esMenorEdad} className={FIELD_CLASS} style={FIELD_STYLE} placeholder="Nombre del padre/madre" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <LabelHUD htmlFor="reg-rep-telefono" required>Teléfono</LabelHUD>
                      <input id="reg-rep-telefono" type="tel" name="telefono" autoComplete="section-representante tel" value={datosPadre.telefono} onChange={handlePadreChange} required={esMenorEdad} className={FIELD_CLASS} style={FIELD_STYLE} placeholder="0999999999" />
                    </div>
                    <div>
                      <LabelHUD htmlFor="reg-rep-correo">Correo electrónico (opcional)</LabelHUD>
                      <input id="reg-rep-correo" type="email" name="correo" autoComplete="section-representante email" value={datosPadre.correo} onChange={handlePadreChange} className={FIELD_CLASS} style={FIELD_STYLE} placeholder="correo@ejemplo.com" />
                    </div>
                  </div>
                </div>
              </CutCard>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 disabled:opacity-50 active:scale-[0.99] transition"
            style={{ clipPath: cut(12), background: GRAD.goldCTA, color: C.ink, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', padding: '13px' }}
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Finalizar registro'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/login')}
            className="cut-focus inline-flex items-center min-h-11 px-2 text-sm"
            style={{ color: C.text2 }}
          >
            ¿Ya tienes una cuenta?&nbsp;<span className="font-bold uppercase tracking-wide" style={{ color: C.gold }}>Iniciar sesión</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
