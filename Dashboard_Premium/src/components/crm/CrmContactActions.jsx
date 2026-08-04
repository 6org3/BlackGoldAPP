import { useState } from 'react';
import { AlertOctagon, CalendarPlus, FilePenLine, Save, ShieldOff, SlidersHorizontal } from 'lucide-react';
import CutCard from '../arcade/CutCard';
import MicroLabel from '../arcade/MicroLabel';
import { BORDER, C, GRAD, TINT, cut } from '../arcade/arcadeTokens';

const FIELD_CLASS = 'cut-focus arcade-input min-h-11 md:min-h-9 px-3.5 py-2.5 text-base md:text-sm border border-white/10 focus:outline-none focus:border-brand/60 transition-colors';
const fieldStyle = { clipPath: cut(7), background: C.cardAlt1, color: C.text };
const buttonStyle = { clipPath: cut(8), background: GRAD.goldCTA, color: C.ink };

const toIso = (value) => value ? new Date(value).toISOString() : null;
const oportunidadActual = (opportunities) => opportunities.find((item) => !item.cerrada_at) ?? opportunities[0] ?? null;

function ActionCard({ icon: Icon, title, children }) {
  return (
    <CutCard cut={9} padding="16px">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} style={{ color: C.gold }} />
        <MicroLabel as="h3" style={{ margin: 0 }}>{title}</MicroLabel>
      </div>
      {children}
    </CutCard>
  );
}

function StageForm({ contact, opportunities, stages, disabled, onAction }) {
  const current = oportunidadActual(opportunities);
  const [opportunityId, setOpportunityId] = useState(() => current?.id ?? '');
  const [stage, setStage] = useState(() => current?.etapa_codigo ?? '');
  const [reason, setReason] = useState('');
  const [nextStep, setNextStep] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const completed = await onAction('actualizar_etapa', {
      contact_id: contact.id,
      oportunidad_id: opportunityId,
      etapa_codigo: stage,
      motivo: reason || undefined,
      proximo_paso_en: toIso(nextStep) ?? undefined,
    });
    if (completed) setReason('');
  };

  if (!opportunities.length) return null;
  return (
    <ActionCard icon={SlidersHorizontal} title="Mover oportunidad">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="sr-only">Oportunidad</span>
          <select value={opportunityId} onChange={(event) => {
            const nextOpportunityId = event.target.value;
            setOpportunityId(nextOpportunityId);
            setStage(opportunities.find((opportunity) => opportunity.id === nextOpportunityId)?.etapa_codigo ?? '');
          }} disabled={disabled} className={`${FIELD_CLASS} w-full appearance-none`} style={fieldStyle}>
            {opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.interes_principal ?? 'Oportunidad'} · {opportunity.etapa_codigo.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Nueva etapa</span>
          <select value={stage} onChange={(event) => setStage(event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full appearance-none`} style={fieldStyle}>
            {stages.filter((item) => item.codigo !== 'no_contactar').map((item) => <option key={item.codigo} value={item.codigo}>{item.nombre}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Próximo paso</span>
          <input type="datetime-local" value={nextStep} onChange={(event) => setNextStep(event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full`} style={fieldStyle} />
        </label>
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Motivo (opcional)</span>
          <input maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full`} style={fieldStyle} />
        </label>
        <button type="submit" disabled={disabled || !opportunityId || !stage} className="cut-focus inline-flex items-center gap-2 min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40" style={buttonStyle}>
          <Save size={15} />Actualizar etapa
        </button>
      </form>
    </ActionCard>
  );
}

function PreferencesForm({ contact, preferences, disabled, onAction }) {
  const [form, setForm] = useState(() => ({
    tratamiento_preferido: preferences?.tratamiento_preferido ?? '',
    canal_preferido: preferences?.canal_preferido ?? '',
    franja_preferida: preferences?.franja_preferida ?? '',
    estilo_mensaje_preferido: preferences?.estilo_mensaje_preferido ?? '',
  }));

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim()));
    await onAction('actualizar_preferencias', { contact_id: contact.id, ...payload });
  };

  return (
    <ActionCard icon={FilePenLine} title="Personalizar atención">
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Cómo tratarle</span>
          <input maxLength="80" value={form.tratamiento_preferido ?? ''} onChange={(event) => set('tratamiento_preferido', event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full`} style={fieldStyle} />
        </label>
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Canal preferido</span>
          <select value={form.canal_preferido ?? ''} onChange={(event) => set('canal_preferido', event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full appearance-none`} style={fieldStyle}>
            <option value="">Sin definir</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="web_chat">Chat web</option>
            <option value="app">App</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Franja preferida</span>
          <input maxLength="120" value={form.franja_preferida ?? ''} onChange={(event) => set('franja_preferida', event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full`} style={fieldStyle} />
        </label>
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Estilo de mensaje</span>
          <input maxLength="120" value={form.estilo_mensaje_preferido ?? ''} onChange={(event) => set('estilo_mensaje_preferido', event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full`} style={fieldStyle} />
        </label>
        <button type="submit" disabled={disabled} className="cut-focus sm:col-span-2 inline-flex justify-center items-center gap-2 min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40" style={buttonStyle}>
          <Save size={15} />Guardar preferencias
        </button>
      </form>
    </ActionCard>
  );
}

function ActivityForm({ contact, opportunities, disabled, onAction }) {
  const [form, setForm] = useState(() => ({
    oportunidad_id: oportunidadActual(opportunities)?.id ?? '',
    tipo: 'seguimiento',
    asunto: '',
    vencimiento_at: '',
    asignado_a: 'lily',
  }));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const completed = await onAction('programar_actividad', { contact_id: contact.id, ...form, oportunidad_id: form.oportunidad_id || null, vencimiento_at: toIso(form.vencimiento_at) });
    if (completed) set('asunto', '');
  };

  return (
    <ActionCard icon={CalendarPlus} title="Programar seguimiento">
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Tipo</span>
          <select value={form.tipo} onChange={(event) => set('tipo', event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full appearance-none`} style={fieldStyle}>
            <option value="seguimiento">Seguimiento</option>
            <option value="llamada">Llamada</option>
            <option value="prueba_o_visita">Prueba o visita</option>
            <option value="documentacion">Documentación</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="block">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Fecha y hora</span>
          <input type="datetime-local" required value={form.vencimiento_at} onChange={(event) => set('vencimiento_at', event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full`} style={fieldStyle} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-2xs font-bold" style={{ color: C.text2 }}>Asunto</span>
          <input required maxLength="240" value={form.asunto} onChange={(event) => set('asunto', event.target.value)} disabled={disabled} className={`${FIELD_CLASS} mt-1 w-full`} style={fieldStyle} />
        </label>
        <button type="submit" disabled={disabled} className="cut-focus sm:col-span-2 inline-flex justify-center items-center gap-2 min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40" style={buttonStyle}>
          <CalendarPlus size={15} />Guardar tarea de seguimiento
        </button>
      </form>
    </ActionCard>
  );
}

function NoteForm({ contact, opportunities, disabled, onAction }) {
  const [note, setNote] = useState('');
  const [intention, setIntention] = useState('');
  const [opportunityId] = useState(() => oportunidadActual(opportunities)?.id ?? '');
  const submit = async (event) => {
    event.preventDefault();
    const completed = await onAction('registrar_nota', {
      contact_id: contact.id,
      oportunidad_id: opportunityId || null,
      canal: 'manual',
      intencion: intention || undefined,
      resumen_operativo: note,
    });
    if (completed) setNote('');
  };

  return (
    <ActionCard icon={FilePenLine} title="Registrar nota operativa">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="sr-only">Intención de la nota</span>
          <select value={intention} onChange={(event) => setIntention(event.target.value)} disabled={disabled} className={`${FIELD_CLASS} w-full appearance-none`} style={fieldStyle}>
            <option value="">Sin intención específica</option>
            <option value="informacion_general">Información general</option>
            <option value="clases">Clases</option>
            <option value="horarios">Horarios</option>
            <option value="inscripcion">Inscripción</option>
            <option value="prueba">Prueba</option>
            <option value="soporte">Soporte</option>
            <option value="seguimiento">Seguimiento</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Nota operativa</span>
          <textarea required maxLength="1000" rows={4} value={note} onChange={(event) => setNote(event.target.value)} disabled={disabled} placeholder="Escribe sólo el resumen necesario; no copies teléfonos ni transcripciones." className={`${FIELD_CLASS} w-full resize-none`} style={fieldStyle} />
        </label>
        <button type="submit" disabled={disabled || !note.trim()} className="cut-focus inline-flex items-center gap-2 min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40" style={buttonStyle}>
          <Save size={15} />Guardar nota
        </button>
      </form>
    </ActionCard>
  );
}

function DoNotContactForm({ contact, disabled, onAction }) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const completed = await onAction('marcar_no_contactar', { contact_id: contact.id, motivo: reason });
    if (completed) {
      setReason('');
      setConfirmed(false);
    }
  };

  if (contact.tipo_relacion === 'no_contactar') return null;
  return (
    <ActionCard icon={ShieldOff} title="No contactar">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs leading-relaxed" style={{ color: C.text2 }}>Detiene nuevos seguimientos y archiva el contacto. Su reactivación exige una decisión humana documentada.</p>
        <label className="block">
          <span className="sr-only">Motivo de no contactar</span>
          <textarea required maxLength="500" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} disabled={disabled} placeholder="Motivo confirmado por la persona" className={`${FIELD_CLASS} w-full resize-none`} style={fieldStyle} />
        </label>
        <label className="flex items-start gap-2 text-xs" style={{ color: C.text2 }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={disabled} className="mt-1" />
          <span>Confirmo que debo detener todo contacto de seguimiento.</span>
        </label>
        <button type="submit" disabled={disabled || !confirmed || !reason.trim()} className="cut-focus inline-flex items-center gap-2 min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40" style={{ clipPath: cut(8), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
          <AlertOctagon size={15} />Aplicar bloqueo
        </button>
      </form>
    </ActionCard>
  );
}

function InternalContactForm({ contact, disabled, onAction }) {
  const [confirmed, setConfirmed] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const completed = await onAction('configurar_contacto_interno', { contact_id: contact.id });
    if (completed) setConfirmed(false);
  };

  if (contact.tipo_relacion === 'interno' || contact.tipo_relacion === 'no_contactar') return null;
  return (
    <ActionCard icon={Save} title="Contacto interno">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs leading-relaxed" style={{ color: C.text2 }}>
          Úsalo sólo para Jorge, su padre o su hermano tras verificar el contacto. Detiene oportunidades y seguimientos comerciales abiertos.
        </p>
        <label className="flex items-start gap-2 text-xs" style={{ color: C.text2 }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={disabled} className="mt-1" />
          <span>Confirmo que esta persona pertenece a la organización.</span>
        </label>
        <button type="submit" disabled={disabled || !confirmed} className="cut-focus inline-flex items-center gap-2 min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40" style={buttonStyle}>
          <Save size={15} />Clasificar como interno
        </button>
      </form>
    </ActionCard>
  );
}

export default function CrmContactActions({ detail, stages, disabled, onAction }) {
  const contact = detail.contact;
  return (
    <div className="space-y-4">
      <StageForm contact={contact} opportunities={detail.oportunidades} stages={stages} disabled={disabled} onAction={onAction} />
      <ActivityForm contact={contact} opportunities={detail.oportunidades} disabled={disabled} onAction={onAction} />
      <NoteForm contact={contact} opportunities={detail.oportunidades} disabled={disabled} onAction={onAction} />
      <PreferencesForm contact={contact} preferences={detail.preferencias} disabled={disabled} onAction={onAction} />
      <InternalContactForm contact={contact} disabled={disabled} onAction={onAction} />
      <DoNotContactForm contact={contact} disabled={disabled} onAction={onAction} />
    </div>
  );
}
