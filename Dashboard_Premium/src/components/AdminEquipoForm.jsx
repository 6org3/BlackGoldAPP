import { motion } from 'framer-motion';
import { UserCog, Save, X } from 'lucide-react';
import { CATEGORIAS_COACH } from '../api/coachesService';
import InputField from './AdminAtletasInputField';
import SelectField from './AdminAtletasSelectField';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, cut } from './arcade/arcadeTokens';

export default function AdminEquipoForm({
  form,
  handleChange,
  saving,
  editingId,
  setEditingId,
  setShowForm,
  handleSubmit,
  clubNombre,
}) {
  return (
    // Entrada sin transform (solo opacity + height): ver nota en AdminAtletasForm.
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
            <UserCog size={16} strokeWidth={2.5} />
          </HexAvatar>
          <span>{editingId ? 'Editar Coach' : 'Nuevo Coach'}</span>
        </h3>
        <button type="button" aria-label="Cerrar formulario" onClick={() => { setShowForm(false); setEditingId(null); }}
          className="cut-focus p-2.5 -m-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors"
          style={{ color: C.text3, clipPath: cut(5) }}>
          <X size={18} />
        </button>
      </div>

      <MicroLabel style={{ marginBottom: 12 }}>Datos del coach</MicroLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <InputField label="Cédula" value={form.cedula} onChange={v => handleChange('cedula', v)} disabled={!!editingId} placeholder="Ej. 1234567890" inputMode="numeric" autoComplete="off" maxLength={10} />
        <InputField label="Nombre Completo" value={form.nombre} onChange={v => handleChange('nombre', v)} placeholder="Ej. Andrés Andrade" autoComplete="name" />
        <InputField label="Correo Electrónico" type="email" value={form.correo} onChange={v => handleChange('correo', v)} placeholder="coach@correo.com" autoComplete="email" />
        <InputField label="Teléfono" type="tel" value={form.telefono} onChange={v => handleChange('telefono', v)} placeholder="0999999999" inputMode="tel" autoComplete="tel" />
      </div>

      <MicroLabel style={{ marginBottom: 12 }}>Alcance en el club</MicroLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <SelectField
          label="Categoría que dirige"
          value={form.categoria}
          options={CATEGORIAS_COACH}
          onChange={v => handleChange('categoria', v)}
        />
        <div className="flex flex-col gap-2">
          <label className="text-2xs font-bold uppercase tracking-widest" style={{ color: C.text2 }}>Club</label>
          {/* El club no se elige: es el del dueño que da el alta, y después solo
              el superadmin puede cambiarlo (trigger v34). */}
          <input type="text" value={clubNombre || '—'} disabled
            className="w-full min-h-11 py-3 px-4 text-sm cursor-not-allowed"
            style={{ clipPath: cut(6), background: C.cardAlt1, border: `1px solid ${BORDER.neutralFaint}`, color: C.text3 }} />
        </div>
      </div>

      <p className="mb-6 text-2xs" style={{ color: C.text3 }}>
        {form.categoria === 'Todas'
          ? 'Verá y evaluará a todos los atletas del club.'
          : `Solo verá y evaluará a los atletas de ${form.categoria}.`}
        {!editingId && ' Al guardar se crea su acceso: entra con su cédula (contraseña inicial: su cédula).'}
      </p>

      <button
        type="submit" disabled={saving}
        className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-4 font-black uppercase tracking-widest transition disabled:opacity-50"
        style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}
      >
        <Save size={16} />
        <span>{saving ? 'Guardando en Supabase...' : editingId ? 'Actualizar Coach' : 'Registrar Coach'}</span>
      </button>
    </motion.form>
  );
}
