import { useState } from 'react';
import { C, BORDER, cut as cutPath, PIXEL, ROW_H, ROW_H_DENSE } from './arcadeTokens';
import Pill from './Pill';

/**
 * Barra de filtros colapsable del HUD denso (design_system_arcade.md §6.4):
 * buscador `.arcade-input` siempre visible + botón "FILTROS" (con contador de
 * activos) que despliega los controles, y chips de filtros activos como `Pill`
 * con `×`. Traducción del patrón colapsable del DS v1 al lenguaje Arcade.
 *
 * - `search` / `onSearch` / `placeholder` — el buscador.
 * - `chips` `[{ key, label, onRemove }]` — filtros activos (chip oro con ×).
 * - `children` — los controles de filtro (Pill/SegmentToggle) del panel.
 * - `dense` — hit-target 36px (desktop staff) en vez de 44px.
 */
export default function FilterBar({
  search = '',
  onSearch,
  placeholder = 'Buscar…',
  chips = [],
  children,
  defaultOpen = false,
  dense = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const h = dense ? ROW_H_DENSE : ROW_H;
  const nActivos = chips.length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="arcade-input"
          type="search"
          value={search}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            minHeight: h,
            padding: '0 12px',
            background: C.cardAlt1,
            color: C.text,
            border: `1px solid ${BORDER.neutralSoft}`,
            clipPath: cutPath(7),
            fontSize: 13,
            outline: 'none',
          }}
        />
        {children && (
          <Pill
            label={nActivos ? `FILTROS · ${nActivos}` : 'FILTROS'}
            active={open || nActivos > 0}
            onClick={() => setOpen((o) => !o)}
            style={{ minHeight: h }}
          />
        )}
      </div>

      {open && children && (
        <div
          style={{
            marginTop: 10,
            padding: '12px 14px',
            background: C.card,
            border: `1px solid ${BORDER.neutral}`,
            clipPath: cutPath(10),
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {children}
        </div>
      )}

      {nActivos > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {chips.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={ch.onRemove}
              aria-label={`Quitar filtro ${ch.label}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: ROW_H_DENSE,
                padding: '4px 10px',
                fontFamily: PIXEL,
                fontSize: 8.5,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                clipPath: cutPath(7),
                background: 'rgba(255,215,0,.12)',
                color: C.gold,
                border: `1px solid ${BORDER.goldStrong}`,
              }}
            >
              {ch.label}
              <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
