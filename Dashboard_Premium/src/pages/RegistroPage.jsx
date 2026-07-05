import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles, User, Phone, Loader2, CheckCircle2 } from 'lucide-react';
import { registrarDesdeFormularioPublico } from '../api/registroPublicoService';
import { calcularEdad } from '../api/utilsAtletas';

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
  const clubes = ['Black Gold', 'Club Leones', 'Club Montoya', 'Club Federación'];

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-white p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card p-12 rounded-3xl text-center max-w-md w-full border border-emerald-500/30">
          <CheckCircle2 className="w-20 h-20 text-emerald-400 mx-auto mb-6" />
          <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-emerald-400">¡Inscripción Exitosa!</h2>
          <p className="text-gray-400 text-sm mb-8">El perfil ha sido creado correctamente. Ahora puedes iniciar sesión con tus credenciales.</p>
          <button onClick={() => navigate('/login')} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest py-4 rounded-xl transition-all">
            Ir al Portal
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-white p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#FFD700]/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg mt-10">
        <div className="text-center mb-10">
          <Sparkles className="text-[#FFD700] w-12 h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-black tracking-tighter uppercase mb-2">Black Gold <span className="text-[#FFD700]">Intelligence</span></h1>
          <p className="text-xs text-gray-400 font-bold tracking-[0.2em] uppercase">Registro de Nuevos Prospectos</p>
        </div>

        <div className="glass-card p-8 rounded-3xl relative z-10 glow-border">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg mb-6 text-center">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <h3 className="text-lg font-black uppercase text-[#FFD700] mb-6 flex items-center"><User className="mr-2" size={20}/> Datos del Atleta</h3>
              <div className="space-y-4">
                
                <div>
                  <label htmlFor="reg-cedula" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cédula del Jugador</label>
                  <input id="reg-cedula" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={10} name="cedula" value={datosAtleta.cedula} onChange={handleAtletaChange} required className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="Cédula o ID" />
                </div>
                
                <div>
                  <label htmlFor="reg-nombre" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Nombre Completo <span className="text-red-500">*</span></label>
                  <input id="reg-nombre" type="text" name="nombre" autoComplete="section-atleta name" value={datosAtleta.nombre} onChange={handleAtletaChange} required className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="Ej. Michael Jordan" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-genero" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Género <span className="text-red-500">*</span></label>
                    <select id="reg-genero" name="genero" value={datosAtleta.genero} onChange={handleAtletaChange} className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors">
                      <option value="Masculino">Masculino</option>
                      <option value="Femenino">Femenino</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reg-posicion" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Posición</label>
                    <select id="reg-posicion" name="posicion" value={datosAtleta.posicion} onChange={handleAtletaChange} className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors">
                      {posiciones.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-telefono" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Teléfono (Opcional)</label>
                    <input id="reg-telefono" type="tel" name="telefono" autoComplete="section-atleta tel" value={datosAtleta.telefono} onChange={handleAtletaChange} className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="0999999999" />
                  </div>
                  <div>
                    <label htmlFor="reg-correo" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Correo Electrónico (Opcional)</label>
                    <input id="reg-correo" type="email" name="correo" autoComplete="section-atleta email" value={datosAtleta.correo} onChange={handleAtletaChange} className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="ejemplo@correo.com" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label htmlFor="reg-fecha-nacimiento" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Fecha de Nacimiento <span className="text-red-500">*</span></label>
                    <input id="reg-fecha-nacimiento" type="date" name="fecha_nacimiento" autoComplete="section-atleta bday" value={datosAtleta.fecha_nacimiento} onChange={handleAtletaChange} required className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-club" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Club (Selecciona o Escribe)</label>
                  <input id="reg-club" type="text" name="club" list="clubesList" value={datosAtleta.club} onChange={handleAtletaChange} required className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="Ej. Black Gold" />
                  <datalist id="clubesList">
                    {clubes.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>

              </div>

              {esMenorEdad && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 pt-6 border-t border-white/10 mt-6">
                  <h3 className="text-sm font-black uppercase text-emerald-400 mb-4 flex items-center">
                    <Phone className="mr-2" size={16}/> Representante Legal Obligatorio (Menor de Edad)
                  </h3>
                  
                  <div>
                    <label htmlFor="reg-rep-nombre" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Nombre Completo del Representante <span className="text-red-500">*</span></label>
                    <input id="reg-rep-nombre" type="text" name="nombre" autoComplete="section-representante name" value={datosPadre.nombre} onChange={handlePadreChange} required={esMenorEdad} className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="Nombre del Padre/Madre" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="reg-rep-telefono" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Teléfono <span className="text-red-500">*</span></label>
                      <input id="reg-rep-telefono" type="tel" name="telefono" autoComplete="section-representante tel" value={datosPadre.telefono} onChange={handlePadreChange} required={esMenorEdad} className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="0999999999" />
                    </div>
                    <div>
                      <label htmlFor="reg-rep-correo" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Correo Electrónico (Opcional)</label>
                      <input id="reg-rep-correo" type="email" name="correo" autoComplete="section-representante email" value={datosPadre.correo} onChange={handlePadreChange} className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm focus:border-[#FFD700]/50 outline-none transition-colors" placeholder="correo@ejemplo.com" />
                    </div>
                  </div>
                </motion.div>
              )}

              <button type="submit" disabled={loading} className="w-full mt-8 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] hover:from-[#ffeb66] hover:to-[#e8c14a] text-black font-black uppercase tracking-widest py-4 rounded-xl transition-all flex items-center justify-center disabled:opacity-50 shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Finalizar Registro'}
              </button>
            </motion.div>
          </form>
        </div>
        <div className="mt-6 text-center">
          <button onClick={() => navigate('/login')} className="text-xs text-gray-400 hover:text-white transition-colors">
            ¿Ya tienes una cuenta? <span className="text-[#FFD700] font-bold uppercase tracking-wider">Iniciar Sesión</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
