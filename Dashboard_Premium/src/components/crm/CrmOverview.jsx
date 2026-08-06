import { CheckCircle2, ChevronDown, Clock3, Search, UserRound, UsersRound } from 'lucide-react';
import CutCard from '../arcade/CutCard';
import MicroLabel from '../arcade/MicroLabel';
import { BORDER, C, TINT, cut } from '../arcade/arcadeTokens';

const fechaCorta = (value) => value
  ? new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : 'Sin fecha';

const etiquetaTipo = {
  interno: 'Interno',
  lead: 'Lead',
  cliente: 'Cliente',
  no_contactar: 'No contactar',
};

const estiloPill = (active) => ({
  clipPath: cut(6),
  background: active ? TINT.gold : C.cardAlt1,
  border: `1px solid ${active ? BORDER.goldStrong : BORDER.neutral}`,
  color: active ? C.gold : C.text2,
});

export default function CrmOverview({
  resumen,
  selectedId,
  search,
  loadingMore,
  onSearch,
  onSelect,
  onLoadMore,
}) {
  const contacts = (resumen?.contactos ?? []).filter((contact) =>
    (contact.nombre_preferido ?? 'Contacto sin nombre').toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')),
  );

  return (
    <section aria-label="Resumen de relaciones" className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        {(resumen?.pipeline ?? []).map((stage) => (
          <CutCard key={stage.codigo} cut={8} padding="12px">
            <MicroLabel style={{ marginBottom: 4 }}>{stage.nombre}</MicroLabel>
            <p className="text-2xl font-black" style={{ color: stage.es_cierre ? C.text2 : C.gold }}>{stage.total}</p>
          </CutCard>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3" style={{ background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, clipPath: cut(8) }}>
        <Search size={15} aria-hidden="true" style={{ color: C.text3 }} />
        <label className="sr-only" htmlFor="crm-search">Buscar contacto CRM</label>
        <input
          id="crm-search"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar por nombre"
          className="cut-focus arcade-input min-h-11 md:min-h-9 bg-transparent text-base md:text-sm focus:outline-none w-full"
          style={{ color: C.text }}
        />
      </div>

      <div className="space-y-2 max-h-[62vh] overflow-y-auto overscroll-contain pr-1" aria-busy={loadingMore}>
        {contacts.map((contact) => {
          const selected = selectedId === contact.id;
          const opportunity = contact.oportunidad;
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelect(contact.id)}
              aria-current={selected ? 'true' : undefined}
              className="cut-focus w-full text-left p-4 transition-colors"
              style={estiloPill(selected)}
            >
              <span className="flex items-start gap-3">
                <span className="grid place-items-center shrink-0 w-9 h-9" style={{ clipPath: cut(7), background: selected ? C.gold : C.card, color: selected ? C.ink : C.text2 }}>
                  {contact.tipo_relacion === 'cliente' ? <CheckCircle2 size={17} /> : <UserRound size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-black" style={{ color: selected ? C.gold : C.text }}>
                      {contact.nombre_preferido ?? 'Contacto sin nombre'}
                    </span>
                    <MicroLabel style={{ margin: 0 }}>{etiquetaTipo[contact.tipo_relacion] ?? contact.tipo_relacion}</MicroLabel>
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs font-bold" style={{ color: C.text3 }}>
                    <span>{opportunity?.etapa_codigo?.replaceAll('_', ' ') ?? 'Sin oportunidad'}</span>
                    {contact.proxima_actividad && (
                      <span className="inline-flex items-center gap-1"><Clock3 size={11} />{fechaCorta(contact.proxima_actividad.vencimiento_at)}</span>
                    )}
                  </span>
                  {contact.actividades_pendientes > 0 && (
                    <span className="mt-2 inline-flex items-center gap-1.5 text-2xs font-bold" style={{ color: C.ok }}>
                      <UsersRound size={12} />{contact.actividades_pendientes} seguimiento{contact.actividades_pendientes === 1 ? '' : 's'}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}

        {!contacts.length && (
          <CutCard cut={9} padding="28px">
            <div role="status" className="text-center" style={{ color: C.text3 }}>
              <UsersRound size={28} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-bold">{search ? 'No hay coincidencias' : 'Aún no hay contactos CRM'}</p>
              <p className="mt-1 text-xs">Los nuevos contactos aparecerán al llegar desde WhatsApp, web o app.</p>
            </div>
          </CutCard>
        )}

        {resumen?.tiene_mas && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="cut-focus w-full min-h-11 px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40"
            style={{ clipPath: cut(7), border: `1px solid ${BORDER.neutral}`, background: C.cardAlt1, color: C.text2 }}
          >
            <span className="inline-flex items-center gap-2">
              <ChevronDown size={15} className={loadingMore ? 'animate-bounce' : ''} />
              {loadingMore ? 'Cargando contactos...' : `Cargar ${resumen.limite ?? 50} contactos más`}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
