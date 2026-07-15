import { motion } from 'framer-motion';
import { X, Save, Boxes } from 'lucide-react';
import InputField from './AdminAtletasInputField';
import SelectField from './AdminAtletasSelectField';
import MicroLabel from './arcade/MicroLabel';
import HexAvatar from './arcade/HexAvatar';
import { NIVELES_GRUPO } from '../api/gruposService';
import { C, BORDER, TINT, GRAD, cut } from './arcade/arcadeTokens';

const NIVEL_OPCIONES = ['', ...NIVELES_GRUPO];
const NIVEL_LABELS = ['Sin nivel', ...NIVELES_GRUPO];

// Molde: AdminEquipoForm. Entrada sin transform (solo opacity + height).
export default function AdminGruposForm({ form, handleChange, handleSubmit, saving, editingId, onClose }) {
  return (
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
            <Boxes size={16} strokeWidth={2.5} />
          </HexAvatar>
          <span>{editingId ? 'Editar Grupo' : 'Nuevo Grupo'}</span>
        </h3>
        <button
          type="button" aria-label="Cerrar formulario" onClick={onClose}
          className="cut-focus p-2.5 -m-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors"
          style={{ color: C.text3, clipPath: cut(5) }}
        >
          <X size={18} />
        </button>
      </div>

      <MicroLabel style={{ marginBottom: 12 }}>Identidad del grupo</MicroLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <InputField
          label="Nombre *" value={form.nombre}
          onChange={(v) => handleChange('nombre', v)}
          placeholder="Ej. Elite Mañana"
        />
        <SelectField
          label="Nivel del grupo"
          value={form.nivel} options={NIVEL_OPCIONES} optionLabels={NIVEL_LABELS}
          onChange={(v) => handleChange('nivel', v)}
        />
      </div>

      {/* El nivel es del GRUPO, no de sus atletas: se dice aquí porque es
          justo lo que un coach asume al revés. */}
      <p className="text-xs mb-6 -mt-2" style={{ color: C.text3 }}>
        El nivel etiqueta al grupo (y da el XP de sus sesiones). No cambia el nivel de sus atletas:
        un grupo puede mezclar Micro, Desarrollo y Elite.
      </p>

      <MicroLabel style={{ marginBottom: 12 }}>Cuándo y cuánto</MicroLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <InputField
          label="Horario *" value={form.horario}
          onChange={(v) => handleChange('horario', v)}
          placeholder="Ej. L-M-V 17:00"
        />
        <InputField
          label="Precio mensual ($) *" type="number" value={form.precio_mensual}
          onChange={(v) => handleChange('precio_mensual', v)}
          placeholder="Ej. 30" min="0" step="0.01" inputMode="decimal"
        />
        <InputField
          label="Cupo máximo" type="number" value={form.cupo_max}
          onChange={(v) => handleChange('cupo_max', v)}
          placeholder="Sin límite" min="1" inputMode="numeric"
        />
      </div>
      <p className="text-xs mb-6" style={{ color: C.text3 }}>
        El precio es obligatorio: las mensualidades se generan solas el día 1, así que un grupo sin
        precio no factura y uno mal puesto cobra de más.
      </p>

      <MicroLabel style={{ marginBottom: 12 }}>Alcance de la membresía</MicroLabel>
      <label
        className="cut-focus flex items-start gap-3 p-4 mb-6 cursor-pointer"
        style={{
          clipPath: cut(8),
          background: form.es_principal ? TINT.gold : C.cardAlt1,
          border: `1px solid ${form.es_principal ? BORDER.goldStrong : BORDER.neutralSoft}`,
        }}
      >
        <input
          type="checkbox" checked={form.es_principal}
          onChange={(e) => handleChange('es_principal', e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-current"
          style={{ accentColor: C.gold }}
        />
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: form.es_principal ? C.gold : C.text2 }}>
            Grupo principal
          </span>
          <span className="block text-xs" style={{ color: C.text3 }}>
            La membresía básica cubre <strong>uno</strong> de los principales. Solo puede haber uno por
            nivel (Micro, Desarrollo y Elite), así que debe declarar su nivel.
            Si lo dejas sin marcar, es un <strong>grupo extra</strong> y se cobra aparte.
          </span>
        </span>
      </label>

      <button
        type="submit" disabled={saving}
        className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-4 font-black uppercase tracking-widest transition disabled:opacity-50"
        style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}
      >
        <Save size={16} />
        <span>{saving ? 'Guardando…' : editingId ? 'Actualizar Grupo' : 'Crear Grupo'}</span>
      </button>
    </motion.form>
  );
}
