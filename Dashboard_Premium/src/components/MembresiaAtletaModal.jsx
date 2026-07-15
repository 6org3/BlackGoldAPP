import { useState, useEffect, useCallback } from 'react';
import { Boxes, AlertCircle, Check } from 'lucide-react';
import ModalShell from './arcade/ModalShell';
import MicroLabel from './arcade/MicroLabel';
import { fetchGruposConOcupacion, fetchMembresiaAtleta, asignarGrupoBasico, setGrupoAdicional } from '../api/gruposService';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

// ─── Membresía de un atleta (v38) ───
// La regla que la pantalla encarna: la cuota cubre UN grupo principal (la
// básica), y cualquier grupo extra se cobra aparte. El importe se muestra
// siempre: quien asigna un add-on está subiendo la factura de una familia.
//
// El nivel del atleta NO se toca aquí: es suyo, lo asigna el coach en su ficha,
// y no depende del grupo donde entrene (un grupo mezcla niveles a propósito).

const money = (v) => `$${Number(v ?? 0).toFixed(2)}`;

export default function MembresiaAtletaModal({ atleta, club, onClose, onSaved }) {
  const [grupos, setGrupos] = useState([]);
  const [basica, setBasica] = useState(null);
  const [adicionales, setAdicionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null); // id del grupo en curso
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [gs, m] = await Promise.all([
        fetchGruposConOcupacion(club),
        fetchMembresiaAtleta(atleta.atleta_id),
      ]);
      setGrupos(gs);
      setBasica(m.basica);
      setAdicionales(m.adicionales);
      setError('');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [club, atleta.atleta_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const principales = grupos.filter((g) => g.es_principal);
  const extra = grupos.filter((g) => !g.es_principal);
  const idsAdicionales = new Set(adicionales.map((a) => a.id));

  const cambiarBasica = async (grupoId) => {
    setGuardando(grupoId);
    setError('');
    try {
      await asignarGrupoBasico(atleta.atleta_id, grupoId);
      await cargar();
      onSaved?.();
    } catch (e) { setError(e.message); }
    setGuardando(null);
  };

  const toggleExtra = async (grupo) => {
    const activo = !idsAdicionales.has(grupo.id);
    setGuardando(grupo.id);
    setError('');
    try {
      await setGrupoAdicional(atleta.atleta_id, grupo.id, activo);
      await cargar();
      onSaved?.();
    } catch (e) { setError(e.message); }
    setGuardando(null);
  };

  // Lo que se le factura al mes: la básica + los add-ons encendidos.
  const totalAddons = adicionales.filter((a) => a.facturable).reduce((s, a) => s + Number(a.precio_mensual ?? 0), 0);
  const totalMes = Number(basica?.precio_mensual ?? 0) + totalAddons;

  return (
    <ModalShell onClose={onClose} icon={Boxes} eyebrow="Membresía" title={atleta.nombre} maxWidth="max-w-2xl">
      {error && (
        <div role="alert" className="mb-4 p-3 text-xs font-bold flex items-start gap-2"
          style={{ clipPath: cut(8), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
          <AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm font-bold animate-pulse" style={{ color: C.text3 }}>Cargando membresía…</p>
      ) : (
        <>
          <MicroLabel style={{ marginBottom: 8 }}>Grupo básico · lo cubre la cuota</MicroLabel>
          {principales.length === 0 ? (
            <p className="text-xs mb-6 p-3" style={{ color: C.text3, clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` }}>
              El club aún no tiene grupos principales. Créalos en <strong style={{ color: C.gold }}>Grupos</strong> (Micro,
              Desarrollo o Elite) y luego vuelve aquí.
            </p>
          ) : (
            <div className="space-y-2 mb-6">
              {principales.map((g) => {
                const activa = basica?.id === g.id;
                const lleno = g.cupo_max != null && g.inscritos >= g.cupo_max && !activa;
                return (
                  <button
                    key={g.id} type="button" onClick={() => !activa && cambiarBasica(g.id)}
                    disabled={!!guardando || activa || lleno}
                    aria-pressed={activa}
                    aria-label={`Grupo básico ${g.nombre}`}
                    className="cut-focus w-full flex items-center justify-between gap-3 p-3 text-left transition-colors disabled:cursor-default"
                    style={{
                      clipPath: cut(8),
                      background: activa ? TINT.gold : C.cardAlt1,
                      border: `1px solid ${activa ? BORDER.goldStrong : BORDER.neutralSoft}`,
                      opacity: lleno ? 0.5 : 1,
                    }}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        {activa && <Check size={14} style={{ color: C.gold }} />}
                        <span className="text-sm font-black uppercase tracking-tight" style={{ color: activa ? C.gold : C.text }}>{g.nombre}</span>
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: C.text3 }}>
                        {g.horario} · {g.inscritos}{g.cupo_max != null ? `/${g.cupo_max}` : ''} atletas{lleno ? ' · lleno' : ''}
                      </span>
                    </span>
                    <span className="text-sm font-black shrink-0" style={{ color: activa ? C.gold : C.text2 }}>
                      {money(g.precio_mensual)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <MicroLabel style={{ marginBottom: 8 }}>Grupos extra · se cobran aparte</MicroLabel>
          {extra.length === 0 ? (
            <p className="text-xs mb-6" style={{ color: C.text3 }}>El club no tiene grupos extra.</p>
          ) : (
            <div className="space-y-2 mb-6">
              {extra.map((g) => {
                const on = idsAdicionales.has(g.id);
                return (
                  <label
                    key={g.id}
                    className="cut-focus flex items-center justify-between gap-3 p-3 cursor-pointer"
                    style={{
                      clipPath: cut(8),
                      background: on ? TINT.info : C.cardAlt1,
                      border: `1px solid ${on ? BORDER.info : BORDER.neutralSoft}`,
                    }}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox" checked={on} disabled={!!guardando}
                        onChange={() => toggleExtra(g)}
                        className="size-4 shrink-0" style={{ accentColor: C.info }}
                        aria-label={`Grupo extra ${g.nombre}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-black uppercase tracking-tight" style={{ color: on ? C.info : C.text }}>{g.nombre}</span>
                        <span className="block text-xs mt-0.5" style={{ color: C.text3 }}>{g.horario}</span>
                      </span>
                    </span>
                    <span className="text-sm font-black shrink-0" style={{ color: on ? C.info : C.text2 }}>
                      +{money(g.precio_mensual)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* El importe a la vista: asignar un add-on sube la factura de una familia. */}
          <div className="flex items-center justify-between p-4"
            style={{ clipPath: cut(10), background: C.cardAlt1, border: `1px solid ${BORDER.goldMid}` }}>
            <span className="min-w-0">
              <span className="block text-xs font-black uppercase tracking-widest" style={{ color: C.text2 }}>Total al mes</span>
              <span className="block text-xs mt-0.5" style={{ color: C.text3 }}>
                {basica ? `Cuota ${money(basica.precio_mensual)}` : 'Sin grupo básico'}
                {totalAddons > 0 && ` + extras ${money(totalAddons)}`}
              </span>
            </span>
            <span className="text-2xl font-black shrink-0" style={{ color: C.gold }}>{money(totalMes)}</span>
          </div>

          {!basica && (
            <p className="text-xs mt-3" style={{ color: C.warn }}>
              Este atleta no tiene grupo básico: su mensualidad no saldrá de ningún grupo.
            </p>
          )}
        </>
      )}
    </ModalShell>
  );
}
