import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Send, CheckCircle2, Check, X, HelpCircle, Clock, MapPin } from 'lucide-react';
import AudienceSelector from './AudienceSelector';
import {
  crearEvento, fetchEventos, fetchTableroConvocados, TIPO_EVENTO_LABEL,
} from '../api/eventosService';

const TIPOS = Object.entries(TIPO_EVENTO_LABEL);

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
    } catch (e) { console.error(e); alert('No se pudo publicar el evento. Revisa la consola.'); }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-surface-base text-white p-6 md:p-10">
      <div className="fixed top-[-20%] left-[20%] w-[600px] h-[500px] bg-info/3 blur-[150px] pointer-events-none rounded-full" />

      <header className="mb-8 border-b border-white/5 pb-8 relative z-10">
        <div className="flex items-center space-x-3">
          <CalendarDays className="text-brand" size={28} />
          <div>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-strong">Eventos</span>
            </h2>
            <p className="text-2xs text-fg-muted font-bold uppercase tracking-[0.3em] mt-1">
              Convocatorias · Confirmaciones
            </p>
          </div>
        </div>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* IZQUIERDA: crear evento */}
        <div className="space-y-5">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Nueva Convocatoria</h3>

          {/* Tipo */}
          <div className="flex flex-wrap gap-2">
            {TIPOS.map(([val, label]) => (
              <button key={val} type="button" onClick={() => setTipo(val)}
                className={`px-3 py-2 rounded-control border text-2xs font-black uppercase tracking-wider transition ${
                  tipo === val ? 'bg-brand/10 border-brand/40 text-brand' : 'border-white/10 text-fg-muted hover:bg-white/5'
                }`}>{label}</button>
            ))}
          </div>

          <input type="text" placeholder="Título (ej. vs Tigres — Fecha 3)"
            value={titulo} onChange={(e) => setTitulo(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />

          {(tipo === 'partido' || tipo === 'torneo') && (
            <input type="text" placeholder="Rival (opcional)"
              value={rival} onChange={(e) => setRival(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-2">Fecha y hora</label>
              <input type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-control px-3 py-2.5 text-base md:text-sm text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-2">Sede (opcional)</label>
              <input type="text" placeholder="Coliseo / cancha" value={sede} onChange={(e) => setSede(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-control px-3 py-2.5 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>

          <textarea rows={2} placeholder="Detalles (opcional): uniforme, transporte, hora de llegada..."
            value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 resize-none" />

          <div>
            <h4 className="text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">¿A quién se convoca?</h4>
            <AudienceSelector atletas={atletas} onChange={setAudiencia} />
          </div>

          <button onClick={handlePublicar} disabled={saving || !puedePublicar}
            className={`w-full flex items-center justify-center space-x-2 py-4 rounded-panel font-black uppercase tracking-widest text-sm transition ${
              saved
                ? 'bg-success/20 border border-success/40 text-success-soft'
                : 'bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20 disabled:opacity-40'
            }`}>
            {saving ? <span className="animate-pulse">Publicando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Convocatoria publicada!</span></>
              : <><Send size={16} /><span>Publicar convocatoria ({seleccion.length})</span></>}
          </button>
        </div>

        {/* DERECHA: eventos + tablero RSVP */}
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Próximos / Recientes</h3>
          <div className="space-y-3 lg:max-h-[75vh] lg:overflow-y-auto overscroll-contain lg:pr-1">
            {eventos.length === 0 && (
              <div className="text-center py-16 text-fg-faint">
                <CalendarDays size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">Sin eventos aún</p>
              </div>
            )}
            {eventos.map((ev) => {
              const t = tablero[ev.id] || { total: 0, asiste: 0, no_asiste: 0, duda: 0, pendiente: 0 };
              const fecha = new Date(ev.fecha_evento);
              return (
                <motion.div key={ev.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                  className="glass-card rounded-panel p-4 border border-white/8">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-3xs font-black uppercase px-2 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-brand">
                      {TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo}
                    </span>
                    <span className="text-3xs text-fg-muted flex items-center gap-1">
                      <Clock size={10} />{fecha.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm font-black text-white">{ev.titulo}{ev.rival ? ` vs ${ev.rival}` : ''}</p>
                  {ev.sede && <p className="text-2xs text-fg-muted flex items-center gap-1 mt-0.5"><MapPin size={10} />{ev.sede}</p>}

                  {/* Tablero RSVP */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <Conteo icon={<Check size={12} />} label="Asisten" valor={t.asiste} color="text-success-soft" />
                    <Conteo icon={<HelpCircle size={12} />} label="Duda" valor={t.duda} color="text-warning-soft" />
                    <Conteo icon={<X size={12} />} label="No van" valor={t.no_asiste} color="text-danger-soft" />
                    <Conteo icon={<Clock size={12} />} label="Sin resp." valor={t.pendiente} color="text-fg-secondary" />
                  </div>
                  <p className="text-3xs text-fg-faint text-right mt-2">{t.total} convocados</p>
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
    <div className="bg-white/5 rounded-control py-2 border border-white/5">
      <div className={`flex items-center justify-center gap-1 ${color}`}>{icon}<span className="text-lg font-black leading-none">{valor}</span></div>
      <p className="text-2xs text-fg-muted font-bold uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}
