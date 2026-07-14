import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Save, X, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { calcularCategoriaFEB } from '../api/utilsAtletas';
import { POSICIONES } from './AdminAtletasConstants';
import InputField from './AdminAtletasInputField';
import SelectField from './AdminAtletasSelectField';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

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
    // Entrada sin transform (solo opacity + height): bajo prefers-reduced-motion
    // un translate se congelaría en su initial y dejaría el formulario desplazado.
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={handleSubmit}
      className="mb-8 overflow-hidden p-5 sm:p-8"
      style={{ background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(14) }}
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-3" style={{ color: C.text }}>
          <HexAvatar size={32} background={GRAD.goldHex} color={C.ink}>
            <UserPlus size={16} strokeWidth={2.5} />
          </HexAvatar>
          <span>{editingId ? 'Editar Atleta' : 'Registrar Nuevo Atleta'}</span>
        </h3>
        <button type="button" aria-label="Cerrar formulario" onClick={() => { setShowForm(false); setEditingId(null); }}
          className="cut-focus p-2.5 -m-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors"
          style={{ color: C.text3, clipPath: cut(5) }}>
          <X size={18} />
        </button>
      </div>

      {/* Datos personales */}
      <MicroLabel style={{ marginBottom: 12 }}>Datos Personales</MicroLabel>
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
      <MicroLabel style={{ marginBottom: 12 }}>Perfil Deportivo</MicroLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <SelectField label="Género" value={form.genero} options={['Masculino', 'Femenino']} onChange={v => handleChange('genero', v)} />
        <SelectField label="Posición" value={form.posicion} options={POSICIONES} onChange={v => handleChange('posicion', v)} />
        <div className="flex flex-col gap-2">
          <label className="text-2xs font-bold uppercase tracking-widest" style={{ color: C.text2 }}>Categoría FEB (Auto)</label>
          <input type="text" value={form.categoria || '—'} disabled
            className="w-full min-h-11 py-3 px-4 text-sm cursor-not-allowed"
            style={{ clipPath: cut(6), background: C.cardAlt1, border: `1px solid ${BORDER.neutralFaint}`, color: C.text3 }} />
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
        <div className="mb-6 p-4" style={{ clipPath: cut(8), background: TINT.info, border: `1px solid ${BORDER.info}` }}>
          <button
            type="button"
            onClick={() => setShowParentForm(!showParentForm)}
            aria-expanded={showParentForm}
            className="cut-focus flex items-center gap-2 min-h-11 py-2 text-sm font-bold transition-colors"
            style={{ color: C.info }}
          >
            <Users size={16} />
            <span>{showParentForm ? 'Ocultar' : 'Agregar'} Datos del Representante</span>
            <span className="text-2xs ml-2" style={{ color: C.text3 }}>(Opcional)</span>
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
        className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-4 font-black uppercase tracking-widest transition disabled:opacity-50"
        style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}
      >
        <Save size={16} />
        <span>{saving ? 'Guardando en Supabase...' : editingId ? 'Actualizar Atleta' : 'Registrar Atleta'}</span>
      </button>
    </motion.form>
  );
}
