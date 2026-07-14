import { useState } from 'react';
import { Save, Ruler, Scale } from 'lucide-react';
import { supabase } from '../api/supabaseClient';
import ModalShell from './arcade/ModalShell';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

const fieldStyle = { clipPath: cut(6), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text };

export default function AntropometriaModal({ atleta, onClose, onRefresh }) {
  const [pesoKg, setPesoKg] = useState(atleta.peso_kg || '');
  const [tallaCm, setTallaCm] = useState(atleta.talla_cm || '');
  const [tallaSentadoCm, setTallaSentadoCm] = useState(atleta.talla_sentado_cm || '');
  const [envergaduraCm, setEnvergaduraCm] = useState(atleta.envergadura_cm || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const indiceCormico = (tallaSentadoCm && tallaCm) ? ((parseFloat(tallaSentadoCm) / parseFloat(tallaCm)) * 100).toFixed(1) : null;
  const envergaduraRelativa = (envergaduraCm && tallaCm) ? (parseFloat(envergaduraCm) - parseFloat(tallaCm)).toFixed(1) : null;

  const getCormicoLabel = (ic) => {
    if (!ic) return 'N/A';
    if (ic <= 50.9) return 'Braquicórmico (Piernas largas)';
    if (ic <= 52.9) return 'Metriocórmico (Proporcionado)';
    return 'Macrocórmico (Tronco largo)';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const { error: dbError } = await supabase
        .from('atletas')
        .update({
          peso_kg: pesoKg ? parseFloat(pesoKg) : null,
          talla_cm: tallaCm ? parseFloat(tallaCm) : null,
          talla_sentado_cm: tallaSentadoCm ? parseFloat(tallaSentadoCm) : null,
          envergadura_cm: envergaduraCm ? parseFloat(envergaduraCm) : null
        })
        .eq('id', atleta.atleta_id);

      if (dbError) throw dbError;

      // Guardar registro histórico en evaluaciones_pruebas
      const pruebas = [];
      const fechaHoy = new Date().toISOString().split('T')[0];

      if (pesoKg) {
        pruebas.push({
          atleta_id: atleta.atleta_id,
          prueba_tipo: 'peso_kg',
          pilar: 'fisico',
          sub_pilar: 'composicion_corporal',
          unidad: 'kg',
          valor_crudo: parseFloat(pesoKg),
          notas: `Actualización antropométrica: ${fechaHoy}`
        });
      }

      if (tallaCm) {
        pruebas.push({
          atleta_id: atleta.atleta_id,
          prueba_tipo: 'altura_cm',
          pilar: 'fisico',
          sub_pilar: 'composicion_corporal',
          unidad: 'cm',
          valor_crudo: parseFloat(tallaCm),
          notas: `Actualización antropométrica: ${fechaHoy}`
        });
      }

      if (pruebas.length > 0) {
        await supabase.from('evaluaciones_pruebas').insert(pruebas);
      }

      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      setError('Error al guardar datos antropométricos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} icon={Ruler} eyebrow={atleta.nombre} title="Evaluación Antropométrica">
      {error && (
        <div role="alert" className="mb-4 text-xs font-bold p-3" style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="antropometria-peso" className="text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1" style={{ color: C.text2 }}>
              <Scale size={12} /> Peso (kg)
            </label>
            <input id="antropometria-peso" type="number" step="0.1" inputMode="decimal" value={pesoKg} onChange={e => setPesoKg(e.target.value)}
              className="cut-focus arcade-input w-full min-h-11 px-4 py-3 text-base md:text-sm font-bold focus:outline-none" style={fieldStyle} placeholder="Ej: 75.5" />
          </div>
          <div>
            <label htmlFor="antropometria-talla" className="text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1" style={{ color: C.text2 }}>
              <Ruler size={12} /> Talla / Altura (cm)
            </label>
            <input id="antropometria-talla" type="number" step="0.1" inputMode="decimal" value={tallaCm} onChange={e => setTallaCm(e.target.value)}
              className="cut-focus arcade-input w-full min-h-11 px-4 py-3 text-base md:text-sm font-bold focus:outline-none" style={fieldStyle} placeholder="Ej: 185.0" />
          </div>
          <div>
            <label htmlFor="antropometria-talla-sentado" className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
              Talla Sentado (cm)
            </label>
            <input id="antropometria-talla-sentado" type="number" step="0.1" inputMode="decimal" value={tallaSentadoCm} onChange={e => setTallaSentadoCm(e.target.value)}
              className="cut-focus arcade-input w-full min-h-11 px-4 py-3 text-base md:text-sm font-bold focus:outline-none" style={fieldStyle} placeholder="Ej: 90.0" />
          </div>
          <div>
            <label htmlFor="antropometria-envergadura" className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
              Brazada / Envergadura (cm)
            </label>
            <input id="antropometria-envergadura" type="number" step="0.1" inputMode="decimal" value={envergaduraCm} onChange={e => setEnvergaduraCm(e.target.value)}
              className="cut-focus arcade-input w-full min-h-11 px-4 py-3 text-base md:text-sm font-bold focus:outline-none" style={fieldStyle} placeholder="Ej: 190.0" />
          </div>
        </div>

        <div className="p-4 mt-4 space-y-2" style={{ clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.neutral}` }}>
          <MicroLabel color={C.gold} style={{ borderBottom: `1px solid ${BORDER.neutral}`, paddingBottom: 8, marginBottom: 8 }}>Resultados Calculados</MicroLabel>
          <div className="flex justify-between items-center text-sm">
            <span className="font-bold" style={{ color: C.text2 }}>Índice Córmico:</span>
            <span className="font-black" style={{ color: C.text }}>{indiceCormico || '--'} %</span>
          </div>
          {indiceCormico && (
            <div className="text-right text-2xs font-bold uppercase tracking-widest" style={{ color: C.ok }}>
              {getCormicoLabel(indiceCormico)}
            </div>
          )}
          <div className="flex justify-between items-center text-sm mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER.neutralFaint}` }}>
            <span className="font-bold" style={{ color: C.text2 }}>Brazada Relativa:</span>
            <span className="font-black" style={{ color: envergaduraRelativa > 0 ? C.ok : envergaduraRelativa < 0 ? C.danger : C.text }}>
              {envergaduraRelativa ? (envergaduraRelativa > 0 ? `+${envergaduraRelativa}` : envergaduraRelativa) : '--'} cm
            </span>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="cut-focus w-full mt-6 min-h-11 py-3 font-black uppercase tracking-widest flex items-center justify-center gap-2 transition disabled:opacity-50"
          style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}>
          <Save size={16} />
          <span>{saving ? 'Guardando...' : 'Guardar Evaluación'}</span>
        </button>
      </form>
    </ModalShell>
  );
}
