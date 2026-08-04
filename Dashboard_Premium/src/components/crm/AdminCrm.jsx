import { useState } from 'react';
import { AlertTriangle, BriefcaseBusiness, Clock3, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react';
import BotonVolver from '../arcade/BotonVolver';
import CutCard from '../arcade/CutCard';
import HexAvatar from '../arcade/HexAvatar';
import MicroLabel from '../arcade/MicroLabel';
import { BORDER, C, GRAD, TINT, cut } from '../arcade/arcadeTokens';
import CrmContactActions from './CrmContactActions';
import CrmOverview from './CrmOverview';

const fecha = (value) => value
  ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Sin registro';

const etiquetasEtapa = (pipeline) => new Map((pipeline ?? []).map((stage) => [stage.codigo, stage.nombre]));

function EstadoCarga() {
  return (
    <div aria-busy="true" aria-label="Cargando CRM" className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-pulse">
      {[0, 1, 2].map((item) => <div key={item} className="h-44" style={{ background: C.cardAlt1, clipPath: cut(10) }} />)}
    </div>
  );
}

function DetailTimeline({ detail, stages }) {
  const names = etiquetasEtapa(stages);
  return (
    <div className="space-y-4">
      <CutCard cut={9} padding="16px">
        <MicroLabel as="h3" style={{ marginBottom: 12 }}>Oportunidades</MicroLabel>
        <div className="space-y-2">
          {detail.oportunidades.map((opportunity) => (
            <div key={opportunity.id} className="flex items-center justify-between gap-3 p-3" style={{ background: C.cardAlt1, border: `1px solid ${BORDER.neutral}`, clipPath: cut(7) }}>
              <div className="min-w-0">
                <p className="text-xs font-black" style={{ color: C.text }}>{opportunity.interes_principal ?? 'Interés por definir'}</p>
                <p className="mt-1 text-2xs" style={{ color: C.text3 }}>Creada {fecha(opportunity.created_at)}</p>
              </div>
              <span className="shrink-0 px-2 py-1 text-3xs font-black uppercase" style={{ clipPath: cut(5), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.gold }}>
                {names.get(opportunity.etapa_codigo) ?? opportunity.etapa_codigo}
              </span>
            </div>
          ))}
          {!detail.oportunidades.length && <p className="text-xs" style={{ color: C.text3 }}>Este contacto no tiene oportunidades abiertas.</p>}
        </div>
      </CutCard>

      <CutCard cut={9} padding="16px">
        <MicroLabel as="h3" style={{ marginBottom: 12 }}>Agenda</MicroLabel>
        <div className="space-y-2">
          {detail.actividades.map((activity) => (
            <div key={activity.id} className="flex gap-3 text-xs">
              <Clock3 size={15} className="shrink-0 mt-0.5" style={{ color: activity.estado === 'pendiente' ? C.gold : C.text3 }} />
              <div>
                <p className="font-bold" style={{ color: C.text }}>{activity.asunto}</p>
                <p className="mt-1" style={{ color: C.text3 }}>{activity.tipo.replaceAll('_', ' ')} · {activity.estado} · {fecha(activity.vencimiento_at)}</p>
              </div>
            </div>
          ))}
          {!detail.actividades.length && <p className="text-xs" style={{ color: C.text3 }}>No hay actividades registradas.</p>}
        </div>
      </CutCard>

      <CutCard cut={9} padding="16px">
        <MicroLabel as="h3" style={{ marginBottom: 12 }}>Notas recientes</MicroLabel>
        <div className="space-y-3">
          {detail.interacciones.map((interaction) => (
            <div key={interaction.id} className="border-l pl-3" style={{ borderColor: BORDER.neutral }}>
              <p className="text-xs leading-relaxed" style={{ color: C.text2 }}>{interaction.resumen_operativo ?? 'Entrada de canal registrada.'}</p>
              <p className="mt-1 text-3xs font-bold uppercase" style={{ color: C.text3 }}>{interaction.sentido.replaceAll('_', ' ')} · {fecha(interaction.created_at)}</p>
            </div>
          ))}
          {!detail.interacciones.length && <p className="text-xs" style={{ color: C.text3 }}>No hay notas ni interacciones disponibles.</p>}
        </div>
      </CutCard>
    </div>
  );
}

function ContactWorkspace({ detail, stages, loading, saving, onAction }) {
  if (loading) {
    return (
      <CutCard cut={10} padding="28px">
        <p role="status" className="text-sm font-bold animate-pulse" style={{ color: C.text3 }}>Cargando contexto del contacto…</p>
      </CutCard>
    );
  }
  if (!detail) {
    return (
      <CutCard cut={10} padding="28px">
        <div className="text-center" style={{ color: C.text3 }}>
          <MessageSquare size={30} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-bold">Selecciona un contacto</p>
          <p className="mt-1 text-xs">Aquí verás su relación, historial operativo y próximos pasos.</p>
        </div>
      </CutCard>
    );
  }

  const contact = detail.contact;
  const action = async (kind, payload) => {
    try {
      await onAction(kind, payload);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <section aria-label={`Contexto de ${contact.nombre_preferido ?? 'contacto'}`} className="space-y-4">
      <CutCard cut={10} padding="20px">
        <div className="flex items-start gap-3">
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            {(contact.nombre_preferido ?? 'C').charAt(0).toUpperCase()}
          </HexAvatar>
          <div className="min-w-0">
            <h2 className="text-xl font-black break-words" style={{ color: C.text }}>{contact.nombre_preferido ?? 'Contacto sin nombre'}</h2>
            <p className="mt-1 text-xs" style={{ color: C.text3 }}>
              {contact.tipo_relacion}{contact.rol_interno ? ` (${contact.rol_interno})` : ''} · origen {contact.origen_inicial.replaceAll('_', ' ')}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 p-3 text-xs leading-relaxed" style={{ clipPath: cut(7), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.text2 }}>
          <ShieldCheck size={16} className="shrink-0 mt-0.5" style={{ color: C.gold }} />
          <span>Este panel no muestra números ni identificadores de canal. Usa el flujo de Lily para comunicarte.</span>
        </div>
      </CutCard>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
        <DetailTimeline detail={detail} stages={stages} />
        <CrmContactActions
          key={`${contact.id}-${detail.oportunidades.map((item) => `${item.id}-${item.etapa_codigo}`).join('-')}-${detail.preferencias?.updated_at ?? ''}`}
          detail={detail}
          stages={stages}
          disabled={saving}
          onAction={action}
        />
      </div>
    </section>
  );
}

export default function AdminCrm({
  resumen,
  detalle,
  seleccionadoId,
  cargando,
  cargandoDetalle,
  cargandoMas,
  guardando,
  error,
  onReintentar,
  onCargarMas,
  onSeleccionar,
  onAccion,
}) {
  const [search, setSearch] = useState('');
  const totalContacts = resumen?.total_contactos ?? resumen?.contactos?.length ?? 0;
  const openActivities = resumen?.actividades_pendientes_total ?? 0;

  return (
    <div className="p-6 md:p-10" style={{ color: C.text }}>
      <header className="mb-8 pb-8" style={{ borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <BotonVolver />
            <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
              <BriefcaseBusiness size={22} strokeWidth={2.5} />
            </HexAvatar>
            <div className="min-w-0">
              <h1 className="text-xl md:text-4xl font-black uppercase tracking-tight break-words" style={{ color: C.text }}>
                Relaciones <span style={{ color: C.gold }}>CRM</span>
              </h1>
              <MicroLabel style={{ marginTop: 4 }}>{resumen?.club ?? 'Black Gold'} · Dirección y ventas</MicroLabel>
            </div>
          </div>
          <button type="button" onClick={onReintentar} disabled={cargando || guardando} className="cut-focus inline-flex items-center gap-2 min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40" style={{ clipPath: cut(8), border: `1px solid ${BORDER.neutral}`, background: C.card, color: C.text2 }}>
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />Actualizar
          </button>
        </div>

        {!cargando && (
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold" style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutral}`, color: C.text2 }}>
              {totalContacts} contactos en alcance
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold" style={{ clipPath: cut(7), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.gold }}>
              {openActivities} seguimientos pendientes
            </span>
          </div>
        )}
      </header>

      {error && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 p-4" style={{ clipPath: cut(10), background: TINT.danger, border: `1px solid ${BORDER.danger}` }}>
          <AlertTriangle size={18} className="shrink-0" style={{ color: C.danger }} />
          <p className="flex-1 min-w-[180px] text-xs font-bold" style={{ color: C.danger }}>{error}</p>
          <button type="button" onClick={onReintentar} className="cut-focus min-h-11 px-3.5 text-2xs font-black uppercase tracking-widest" style={{ clipPath: cut(7), border: `1px solid ${BORDER.danger}`, color: C.danger }}>
            Reintentar
          </button>
        </div>
      )}

      {cargando ? <EstadoCarga /> : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)] gap-6">
          <CrmOverview
            resumen={resumen}
            selectedId={seleccionadoId}
            search={search}
            loadingMore={cargandoMas}
            onSearch={setSearch}
            onSelect={onSeleccionar}
            onLoadMore={onCargarMas}
          />
          <ContactWorkspace detail={detalle} stages={resumen?.pipeline ?? []} loading={cargandoDetalle} saving={guardando} onAction={onAccion} />
        </div>
      )}
    </div>
  );
}
