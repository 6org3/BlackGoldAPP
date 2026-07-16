import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Save, User, KeyRound } from 'lucide-react';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '../AuthContext';
import { C, BORDER, cut } from './arcade/arcadeTokens';

// Mínimo de Supabase Auth por defecto. Se valida aquí solo para dar un mensaje
// decente en vez del error crudo del servidor; quien manda es Auth.
const MIN_PASSWORD = 6;

export default function EditarPerfilModal({ onClose, onRefresh }) {
  const { user } = useAuth();
  const closeBtnRef = useRef(null);

  // Semántica de diálogo (mismo patrón que ModoCanchaModal): foco inicial
  // en Cerrar y cierre con Escape.
  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const [form, setForm] = useState({
    nombre: user.nombre || '',
    cedula: user.cedula || '',
    telefono: user.telefono || '',
    fecha_nacimiento: user.fecha_nacimiento || '',
    correo: user.correo || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // v41: cambio de contraseña. Hasta ahora la app no tenía NINGUNA vía para
  // cambiarla, así que la inicial era para siempre. Con las temporales
  // aleatorias del staff eso ya no se sostiene: quien recibe una cadena de 14
  // caracteres necesita poder poner la suya.
  const [pass, setPass] = useState({ nueva: '', repetir: '' });
  const [cambiandoPass, setCambiandoPass] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCambiarPassword = async (e) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');
    if (pass.nueva.length < MIN_PASSWORD) {
      setPassError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (pass.nueva !== pass.repetir) {
      setPassError('Las dos contraseñas no coinciden.');
      return;
    }
    setCambiandoPass(true);
    try {
      // updateUser actúa sobre la sesión en curso: nadie puede cambiar la
      // contraseña de otro por esta vía, ni hace falta mandar la actual.
      const { error: eAuth } = await supabase.auth.updateUser({ password: pass.nueva });
      if (eAuth) throw eAuth;
      setPass({ nueva: '', repetir: '' });
      setPassSuccess('Contraseña actualizada. Úsala la próxima vez que entres.');
    } catch (err) {
      setPassError(err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setCambiandoPass(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Validaciones básicas
      if (!form.nombre.trim() || !form.cedula.trim()) {
        throw new Error("El nombre y la cédula son obligatorios.");
      }

      // Actualizar usando la API de Supabase en la tabla usuarios.
      // Como el usuario está actualizando su propia fila, el RLS debe permitirlo.
      const { error: dbError } = await supabase
        .from('usuarios')
        .update({
          nombre: form.nombre,
          cedula: form.cedula,
          telefono: form.telefono,
          fecha_nacimiento: form.fecha_nacimiento || null,
          correo: form.correo
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setSuccess('Perfil actualizado correctamente.');
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
          onClose();
        }, 1500);
      } else {
        setTimeout(() => onClose(), 1500);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al actualizar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editar-perfil-title"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ clipPath: cut(14), background: C.card, border: `1px solid ${BORDER.neutral}` }}
        className="max-w-lg w-full p-6 relative max-h-[90dvh] overflow-y-auto"
      >
        <button ref={closeBtnRef} onClick={onClose} aria-label="Cerrar" className="absolute right-2 top-2 p-3 text-fg-muted hover:text-white">
          <X size={20} />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand/20 to-brand-strong/5 flex items-center justify-center border border-brand/30">
            <User className="text-brand" size={20} />
          </div>
          <div>
            <h3 id="editar-perfil-title" className="text-xl font-black text-white uppercase tracking-tight">Editar Perfil</h3>
            <p className="text-2xs text-fg-secondary font-bold uppercase tracking-widest">Actualiza tus datos personales</p>
          </div>
        </div>

        {error && <div className="mb-4 text-danger-soft text-xs font-bold bg-danger/10 border border-danger/20 p-2 rounded-lg">{error}</div>}
        {success && <div className="mb-4 text-success-soft text-xs font-bold bg-success/10 border border-success/20 p-2 rounded-lg">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label htmlFor="perfil-nombre" className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Nombre Completo</label>
              <input id="perfil-nombre" type="text" autoComplete="name" value={form.nombre} onChange={e => handleChange('nombre', e.target.value)}
                className="w-full bg-surface-card/80 border border-white/10 rounded-control px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="perfil-cedula" className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Cédula</label>
                <input id="perfil-cedula" type="text" inputMode="numeric" autoComplete="off" value={form.cedula} onChange={e => handleChange('cedula', e.target.value)}
                  className="w-full bg-surface-card/80 border border-white/10 rounded-control px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
              </div>
              <div>
                <label htmlFor="perfil-telefono" className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Teléfono</label>
                <input id="perfil-telefono" type="tel" inputMode="tel" autoComplete="tel" value={form.telefono} onChange={e => handleChange('telefono', e.target.value)}
                  className="w-full bg-surface-card/80 border border-white/10 rounded-control px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
              </div>
            </div>
            <div>
              <label htmlFor="perfil-correo" className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Correo Electrónico</label>
              <input id="perfil-correo" type="email" autoComplete="email" value={form.correo} onChange={e => handleChange('correo', e.target.value)}
                className="w-full bg-surface-card/80 border border-white/10 rounded-control px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
            </div>
            <div>
              <label htmlFor="perfil-fecha-nacimiento" className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Fecha de Nacimiento</label>
              <input id="perfil-fecha-nacimiento" type="date" max={new Date().toISOString().split('T')[0]} value={form.fecha_nacimiento} onChange={e => handleChange('fecha_nacimiento', e.target.value)}
                className="w-full bg-surface-card/80 border border-white/10 rounded-control px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
            </div>
          </div>

          <button type="submit" disabled={saving} className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-brand to-brand-strong text-black font-black uppercase tracking-widest py-3 rounded-control hover:scale-[1.02] transition disabled:opacity-50 mt-6">
            <Save size={16} /><span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </form>

        {/* ─── Contraseña (v41) — form aparte: se envía a Auth, no a la tabla ─── */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="flex items-center space-x-2 mb-4">
            <KeyRound className="text-brand" size={16} />
            <h4 className="text-sm font-black text-white uppercase tracking-tight">Cambiar contraseña</h4>
          </div>

          {passError && <div className="mb-4 text-danger-soft text-xs font-bold bg-danger/10 border border-danger/20 p-2 rounded-lg">{passError}</div>}
          {passSuccess && <div className="mb-4 text-success-soft text-xs font-bold bg-success/10 border border-success/20 p-2 rounded-lg">{passSuccess}</div>}

          <form onSubmit={handleCambiarPassword} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="perfil-pass-nueva" className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Nueva</label>
                <input id="perfil-pass-nueva" type="password" autoComplete="new-password" value={pass.nueva}
                  onChange={e => setPass(p => ({ ...p, nueva: e.target.value }))}
                  className="w-full bg-surface-card/80 border border-white/10 rounded-control px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
              </div>
              <div>
                <label htmlFor="perfil-pass-repetir" className="block text-2xs text-fg-secondary font-bold uppercase tracking-widest mb-1">Repetir</label>
                <input id="perfil-pass-repetir" type="password" autoComplete="new-password" value={pass.repetir}
                  onChange={e => setPass(p => ({ ...p, repetir: e.target.value }))}
                  className="w-full bg-surface-card/80 border border-white/10 rounded-control px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
              </div>
            </div>
            <button type="submit" disabled={cambiandoPass || !pass.nueva}
              className="w-full flex items-center justify-center space-x-2 bg-surface-card/80 border border-white/10 text-white font-black uppercase tracking-widest text-xs py-3 rounded-control hover:border-brand/50 transition disabled:opacity-50">
              <KeyRound size={14} /><span>{cambiandoPass ? 'Cambiando...' : 'Cambiar contraseña'}</span>
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
