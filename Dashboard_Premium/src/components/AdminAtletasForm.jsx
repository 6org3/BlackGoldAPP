import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Save, X, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { calcularCategoriaFEB } from '../api/utilsAtletas';
import { POSICIONES } from './AdminAtletasConstants';
import InputField from './AdminAtletasInputField';
import SelectField from './AdminAtletasSelectField';

export default function AdminAtletasForm({
  form,
  handleChange,
  esMenor,
  showParentForm,
  setShowParentForm,
  saving,
  editingId,
  setEditingId,
  setShowForm,
  handleSubmit,
  user,
}) {
  return (
    <motion.form
      initial={{ opacity: 0, y: -20, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -20, height: 0 }}
      onSubmit={handleSubmit}
      className="glass-card rounded-panel p-5 sm:p-8 mb-8 overflow-hidden"
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center space-x-3">
          <span className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center">
            <UserPlus size={16} className="text-brand" />
          </span>
          <span>{editingId ? 'Editar Atleta' : 'Registrar Nuevo Atleta'}</span>
        </h3>
        <button type="button" aria-label="Cerrar formulario" onClick={() => { setShowForm(false); setEditingId(null); }} className="p-2.5 -m-2.5 rounded-lg text-fg-muted hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Datos personales */}
      <p className="text-2xs font-black uppercase tracking-eyebrow text-fg-muted mb-3">Datos Personales</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InputField label="Cédula" value={form.cedula} onChange={v => handleChange('cedula', v)} disabled={!!editingId} placeholder="Ej. 1234567890" inputMode="numeric" autoComplete="off" maxLength={10} />
        <InputField label="Nombre Completo" value={form.nombre} onChange={v => handleChange('nombre', v)} placeholder="Ej. Juan Pérez" autoComplete="name" />
        <InputField label="Correo Electrónico" type="email" value={form.correo} onChange={v => handleChange('correo', v)} placeholder="ejemplo@correo.com" autoComplete="email" />
        <InputField
          label="Fecha de Nacimiento"
          type="date"
          value={form.fecha_nacimiento}
          onChange={v => {
            handleChange('fecha_nacimiento', v);
            handleChange('categoria', calcularCategoriaFEB(v));
          }}
        />
      </div>

      {/* Perfil deportivo */}
      <p className="text-2xs font-black uppercase tracking-eyebrow text-fg-muted mb-3">Perfil Deportivo</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <SelectField label="Género" value={form.genero} options={['Masculino', 'Femenino']} onChange={v => handleChange('genero', v)} />
        <SelectField label="Posición" value={form.posicion} options={POSICIONES} onChange={v => handleChange('posicion', v)} />
        <div className="flex flex-col space-y-2">
          <label className="text-2xs text-fg-secondary font-bold uppercase tracking-widest">Categoría FEB (Auto)</label>
          <input type="text" value={form.categoria || '—'} disabled
            className="w-full bg-surface-card/80 border border-white/5 rounded-control py-3 px-4 text-sm text-white/50 cursor-not-allowed" />
        </div>
        <SelectField
          label="Nivel de Desarrollo"
          value={form.nivel_desarrollo}
          options={['', 'Micro', 'Desarrollo', 'Elite']}
          optionLabels={['— Por Asignar —', 'Micro', 'Desarrollo', 'Elite']}
          onChange={v => handleChange('nivel_desarrollo', v)}
        />
        {user?.rol === "superadmin" && (
          <InputField label="Club (Admin)" value={form.club} onChange={v => handleChange("club", v)} placeholder="Ej. Black Gold" />
        )}
      </div>

      {/* Toggle padre (solo crear y si es menor) */}
      {!editingId && esMenor && (
        <div className="mb-6 p-4 rounded-control bg-cyan-500/5 border border-cyan-500/20">
          <button
            type="button"
            onClick={() => setShowParentForm(!showParentForm)}
            className="flex items-center space-x-2 text-sm text-cyan-400 font-bold hover:text-cyan-300 transition-colors"
          >
            <Users size={16} />
            <span>{showParentForm ? 'Ocultar' : 'Agregar'} Datos del Representante</span>
            <span className="text-2xs text-fg-muted ml-2">(Opcional)</span>
            {showParentForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <AnimatePresence>
            {showParentForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 overflow-hidden"
              >
                <InputField label="Nombre del Representante" value={form.padre_nombre} onChange={v => handleChange('padre_nombre', v)} placeholder="Ej. María Méndez" autoComplete="name" />
                <InputField label="Teléfono Representante" type="tel" value={form.padre_telefono} onChange={v => handleChange('padre_telefono', v)} placeholder="Ej. 0991234567" inputMode="tel" autoComplete="tel" />
                <InputField label="Correo Representante" type="email" value={form.padre_correo} onChange={v => handleChange('padre_correo', v)} placeholder="padre@correo.com" autoComplete="email" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <button
        type="submit" disabled={saving}
        className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-brand to-brand-strong text-black font-black uppercase tracking-widest py-4 rounded-control shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)] transition disabled:opacity-50"
      >
        <Save size={16} />
        <span>{saving ? 'Guardando en Supabase...' : editingId ? 'Actualizar Atleta' : 'Registrar Atleta'}</span>
      </button>
    </motion.form>
  );
}
