import { useState } from 'react';
import { Activity, Moon, Droplets, Loader2 } from 'lucide-react';
import { guardarReadinessDiario } from '../api/readinessService';
import ModalShell from './arcade/ModalShell';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut, PIXEL } from './arcade/arcadeTokens';

// Escala de Armstrong: hex CLÍNICOS de referencia, no tokens de marca. El atleta
// compara su orina contra estos colores reales, así que no se re-expresan en la
// paleta Arcade (decisión de la Ola 1 de convergencia).
const URINE_COLORS = [
  { value: 1, color: '#FDFBE3', label: 'Excelente' },
  { value: 2, color: '#FDF1AB', label: 'Muy Bien' },
  { value: 3, color: '#FDE47F', label: 'Bien' },
  { value: 4, color: '#FCD754', label: 'Poca Deshidratación' },
  { value: 5, color: '#EFC132', label: 'Deshidratado' },
  { value: 6, color: '#E1AA12', label: 'Muy Deshidratado' },
  { value: 7, color: '#C58200', label: 'Deshidratación Severa' },
  { value: 8, color: '#975F00', label: 'Peligro' },
];

/** Slider 1-10 del HUD: label con icono, valor en pixel y pista de 44px. */
function EscalaSlider({ icon: Icon, label, accent, value, onChange, minLabel, maxLabel }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <label htmlFor={`readiness-${label}`} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: C.text }}>
          <Icon size={15} strokeWidth={2.4} style={{ color: accent, flex: 'none' }} aria-hidden="true" />
          <span>{label}</span>
        </label>
        <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 15, color: accent }}>{value}/10</span>
      </div>
      <input
        id={`readiness-${label}`}
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', height: 44, accentColor: accent, cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <MicroLabel color={C.text3} size={8.5} tracking=".06em">{minLabel}</MicroLabel>
        <MicroLabel color={C.text3} size={8.5} tracking=".06em">{maxLabel}</MicroLabel>
      </div>
    </div>
  );
}

/**
 * Check-in diario de readiness (sueño · fatiga · hidratación). Escribe en
 * atleta_readiness vía readinessService; la tabla tiene UNIQUE (atleta_id,
 * fecha), así que un segundo envío del día lo rechaza el servicio con mensaje
 * propio. Lo montan el portal Arcade del atleta (VistaAtletaArcade) y el shell
 * legacy /dashboard (App.jsx / AppSecondaryModals).
 */
export default function ReadinessModal({ atletaId, onClose, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [sueno, setSueno] = useState(5);
  const [fatiga, setFatiga] = useState(5);
  const [colorOrina, setColorOrina] = useState(1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const registro = await guardarReadinessDiario({
        atleta_id: atletaId,
        sueno_calidad: parseInt(sueno),
        fatiga_fisica: parseInt(fatiga),
        color_orina: parseInt(colorOrina),
      });
      if (onComplete) onComplete(registro);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar el check-in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Check-in Diario"
      eyebrow="ATHLETE READINESS ENGINE"
      icon={Activity}
      align="end"
    >
      {error && (
        <div style={{ background: TINT.danger, border: `1px solid ${BORDER.danger}`, clipPath: cut(8), padding: '10px 12px', marginBottom: 16 }}>
          <MicroLabel color={C.danger} size={9} tracking=".06em" style={{ textAlign: 'center' }}>{error}</MicroLabel>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <EscalaSlider
          icon={Moon}
          label="¿Cómo dormiste anoche?"
          accent={C.info}
          value={sueno}
          onChange={setSueno}
          minLabel="PÉSIMO (1)"
          maxLabel="INCREÍBLE (10)"
        />

        <EscalaSlider
          icon={Activity}
          label="Nivel de Fatiga Física"
          accent={C.danger}
          value={fatiga}
          onChange={setFatiga}
          minLabel="AGOTADO (1)"
          maxLabel="AL 100% (10)"
        />

        {/* Hidratación · Escala de Armstrong */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <Droplets size={15} strokeWidth={2.4} style={{ color: C.cyan, flex: 'none' }} aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Color de tu primera orina hoy</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 11.5, lineHeight: 1.5, color: C.text2 }}>
            La Escala de Armstrong nos ayuda a medir objetivamente tu hidratación antes de entrenar. Selecciona el color que más se parezca.
          </p>

          <div role="radiogroup" aria-label="Color de orina" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {URINE_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                onClick={() => setColorOrina(c.value)}
                aria-label={`Nivel ${c.value}: ${c.label}`}
                aria-checked={colorOrina === c.value}
                title={c.label}
                className="cut-focus"
                // Sin atenuar los no seleccionados: son la referencia clínica
                // contra la que el atleta compara y bajarles la opacidad sobre
                // el fondo oscuro del HUD falsea la escala. La selección se
                // marca con un marco dorado hacia adentro (offset negativo):
                // el clip-path recorta todo lo que se pinte fuera del borde,
                // por eso .cut-focus hace lo mismo con el foco.
                style={{
                  height: 44,
                  clipPath: cut(6),
                  cursor: 'pointer',
                  background: c.color,
                  border: 'none',
                  outline: colorOrina === c.value ? `3px solid ${C.gold}` : 'none',
                  outlineOffset: -3,
                }}
              />
            ))}
          </div>
          <MicroLabel color={C.gold} size={9} tracking=".06em" style={{ marginTop: 10, textAlign: 'center' }}>
            {URINE_COLORS.find((c) => c.value === colorOrina)?.label}
          </MicroLabel>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            padding: 16,
            clipPath: cut(12),
            border: '1px solid transparent',
            fontFamily: PIXEL,
            fontSize: 11,
            letterSpacing: '.04em',
            cursor: loading ? 'default' : 'pointer',
            background: loading ? 'rgba(255,255,255,.04)' : GRAD.goldCTA,
            color: loading ? C.text4 : C.ink,
          }}
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              GUARDANDO…
            </>
          ) : (
            'COMPLETAR CHECK-IN ►'
          )}
        </button>
      </form>
    </ModalShell>
  );
}
