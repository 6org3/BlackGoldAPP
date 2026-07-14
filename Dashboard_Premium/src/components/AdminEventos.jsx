import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Send, CheckCircle2, Check, X, HelpCircle, Clock, MapPin, AlertTriangle } from 'lucide-react';
import AudienceSelector from './AudienceSelector';
import {
  crearEvento, fetchEventos, fetchTableroConvocados, TIPO_EVENTO_LABEL,
} from '../api/eventosService';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

const TIPOS = Object.entries(TIPO_EVENTO_LABEL);

// Campo del Formulario-HUD (§6.3).
const FIELD_CLASS = 'cut-focus arcade-input w-full min-h-11 md:min-h-9 px-3.5 py-2.5 text-base md:text-sm border border-white/10 focus:outline-none focus:border-brand/60 transition-colors';
const fieldStyle = { clipPath: cut(7), background: C.cardAlt1, color: C.text };

export default function AdminEventos({ user, atletas = [] }) {
  const [eventos, setEventos] = useState([]);
  const [tablero, setTablero] = useState({});

  const [tipo, setTipo] = useState('partido');
  const [titulo, setTitulo] = useState('');
  const [rival, setRival] = useState('');
  const [fechaHora, setFechaHora] = useState('');
  const [sede, setSede] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [audiencia, setAudiencia] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const evs = await fetchEventos({ limit: 30 });
    setEventos(evs);
    const tab = await fetchTableroConvocados(evs.map((e) => e.id));
    setTablero(tab);
  }, []);

  useEffect(() => { load(); }, [load]);

  const seleccion = audiencia?.seleccion || [];
  const puedePublicar = titulo.trim() && fechaHora && seleccion.length > 0;

  const handlePublicar = async () => {
    if (!puedePublicar) return;
    setSaving(true);
    setError('');
    try {
      // datetime-local => fecha_evento (ISO) + hora_inicio (HH:MM)
      const fechaIso = new Date(fechaHora).toISOString();
      const horaInicio = fechaHora.includes('T') ? fechaHora.split('T')[1] : null;

      await crearEvento({
        creado_por: user.id,
        club: user.club || null,
        tipo,
        titulo,
        descripcion: descripcion || null,
        rival: rival || null,
        fecha_evento: fechaIso,
        hora_inicio: horaInicio,
        sede: sede || null,
        segmento_tipo: audiencia?.segmento_tipo,
        segmento_params: audiencia?.segmento_params || {},
        incluir_representantes: audiencia?.incluir_representantes ?? true,
        atleta_ids: seleccion.map((a) => a.atleta_id),
      });
      setSaved(true);
      setTitulo(''); setRival(''); setFechaHora(''); setSede(''); setDescripcion('');
      await load();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
      setError('No se pudo publicar el evento. Revisa la conexión e intenta de nuevo.');
    }
    setSaving(false);
  };

  return (
    <div className="p-6 md:p-10" style={{ color: C.text }}>
      <header className="mb-8 pb-8" style={{ borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center gap-3">
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            <CalendarDays size={22} strokeWidth={2.5} />
          </HexAvatar>
          <div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight" style={{ color: C.text }}>
              Even<span style={{ color: C.gold }}>tos</span>
            </h2>
            <MicroLabel style={{ marginTop: 4 }}>Convocatorias · Confirmaciones</MicroLabel>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* IZQUIERDA: crear evento */}
        <div className="space-y-5">
          <MicroLabel as="h3" size={11}>Nueva convocatoria</MicroLabel>

          {/* Tipo */}
          <div className="flex flex-wrap gap-2">
            {TIPOS.map(([val, label]) => {
              const on = tipo === val;
              return (
                <button key={val} type="button" onClick={() => setTipo(val)}
                  className="cut-focus inline-flex items-center min-h-11 md:min-h-9 px-3.5 text-2xs font-black uppercase tracking-wider transition-colors"
                  style={{ clipPath: cut(7), background: on ? TINT.gold : C.card, border: `1px solid ${on ? BORDER.goldStrong : BORDER.neutral}`, color: on ? C.gold : C.text2 }}>
                  {label}
                </button>
              );
            })}
          </div>

          <input type="text" placeholder="Título (ej. vs Tigres — Fecha 3)"
            value={titulo} onChange={(e) => setTitulo(e.target.value)}
            className={FIELD_CLASS} style={fieldStyle} />

          {(tipo === 'partido' || tipo === 'torneo') && (
            <input type="text" placeholder="Rival (opcional)"
              value={rival} onChange={(e) => setRival(e.target.value)}
              className={FIELD_CLASS} style={fieldStyle} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <MicroLabel as="label" style={{ display: 'block', marginBottom: 8 }}>Fecha y hora</MicroLabel>
              <input type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)}
                className={FIELD_CLASS} style={fieldStyle} />
            </div>
            <div>
              <MicroLabel as="label" style={{ display: 'block', marginBottom: 8 }}>Sede (opcional)</MicroLabel>
              <input type="text" placeholder="Coliseo / cancha" value={sede} onChange={(e) => setSede(e.target.value)}
                className={FIELD_CLASS} style={fieldStyle} />
            </div>
          </div>

          <textarea rows={2} placeholder="Detalles (opcional): uniforme, transporte, hora de llegada..."
            value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className={`${FIELD_CLASS} resize-none`} style={fieldStyle} />

          <div>
            <MicroLabel as="h4" style={{ marginBottom: 12 }}>¿A quién se convoca?</MicroLabel>
            <AudienceSelector atletas={atletas} club={user?.club} onChange={setAudiencia} />
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-3 px-4 py-3" style={{ clipPath: cut(8), background: TINT.danger, border: `1px solid ${BORDER.danger}` }}>
              <AlertTriangle size={16} className="shrink-0" style={{ color: C.danger }} />
              <p className="text-xs font-bold" style={{ color: C.danger }}>{error}</p>
            </div>
          )}

          <button onClick={handlePublicar} disabled={saving || !puedePublicar}
            className={`cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-3.5 font-black uppercase tracking-widest text-sm transition active:scale-[0.99] ${saved ? '' : 'disabled:opacity-40'}`}
            style={saved
              ? { clipPath: cut(10), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }
              : { clipPath: cut(10), background: GRAD.goldCTA, color: C.ink, border: 'none' }}>
            {saving ? <span className="animate-pulse">Publicando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Convocatoria publicada!</span></>
              : <><Send size={16} /><span>Publicar convocatoria ({seleccion.length})</span></>}
          </button>
        </div>

        {/* DERECHA: eventos + tablero RSVP */}
        <div>
          <MicroLabel as="h3" size={11} style={{ marginBottom: 16 }}>Próximos / Recientes</MicroLabel>
          <div className="space-y-3 lg:max-h-[75vh] lg:overflow-y-auto overscroll-contain lg:pr-1">
            {eventos.length === 0 && (
              <div className="text-center py-16" style={{ color: C.text3 }}>
                <CalendarDays size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">Sin eventos aún</p>
              </div>
            )}
            {eventos.map((ev) => {
              const t = tablero[ev.id] || { total: 0, asiste: 0, no_asiste: 0, duda: 0, pendiente: 0 };
              const fecha = new Date(ev.fecha_evento);
              return (
                <motion.div key={ev.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <CutCard cut={10} padding="16px">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-3xs font-black uppercase px-2 py-0.5" style={{ clipPath: cut(5), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.gold }}>
                        {TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo}
                      </span>
                      <MicroLabel className="flex items-center gap-1" style={{ margin: 0 }}>
                        <Clock size={10} />{fecha.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </MicroLabel>
                    </div>
                    <p className="text-sm font-black" style={{ color: C.text }}>{ev.titulo}{ev.rival ? ` vs ${ev.rival}` : ''}</p>
                    {ev.sede && <p className="text-2xs flex items-center gap-1 mt-0.5" style={{ color: C.text3 }}><MapPin size={10} />{ev.sede}</p>}

                    {/* Tablero RSVP */}
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <Conteo icon={<Check size={12} />} label="Asisten" valor={t.asiste} color={C.ok} />
                      <Conteo icon={<HelpCircle size={12} />} label="Duda" valor={t.duda} color={C.warn} />
                      <Conteo icon={<X size={12} />} label="No van" valor={t.no_asiste} color={C.danger} />
                      <Conteo icon={<Clock size={12} />} label="Sin resp." valor={t.pendiente} color={C.text2} />
                    </div>
                    <MicroLabel className="text-right" style={{ marginTop: 8 }}>{t.total} convocados</MicroLabel>
                  </CutCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Conteo({ icon, label, valor, color }) {
  return (
    <div style={{ background: C.cardAlt1, border: `1px solid ${BORDER.neutral}`, clipPath: cut(6), padding: '8px 4px' }}>
      <div className="flex items-center justify-center gap-1" style={{ color }}>{icon}<span className="text-lg font-black leading-none">{valor}</span></div>
      <MicroLabel style={{ marginTop: 4 }}>{label}</MicroLabel>
    </div>
  );
}
