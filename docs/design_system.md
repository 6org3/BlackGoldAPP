# Black Gold Design System — v1

**"El oro se gana."** Sistema de diseño para la PWA del club: dark premium, gamificación como narrativa central, y una sola fuente de verdad visual.

- **Implementación CSS:** `Dashboard_Premium/src/styles/tokens.css` (Tailwind v4 `@theme` — cada token genera su utilidad: `bg-surface-card`, `text-brand`, `rounded-card`…)
- **Implementación JS:** `Dashboard_Premium/src/lib/designTokens.js` (Recharts, Framer Motion, canvas-confetti, mapas de rangos)
- **Demo visual:** `docs/design_system_demo.html`

Estado del código al crear el sistema (2026-07-05): **254 colores hex hardcodeados en 40 archivos**, 3 superficies negras compitiendo (`#121214`, `#0d0d0f`, `#18181b`), radios mezclados sin regla, y la identidad de los rangos XP definida por triplicado. Este documento consolida lo que ya funcionaba y le pone nombre.

---

## 1. Filosofía: "Vestuario de élite"

La app se siente como el túnel de vestuarios de un club profesional de noche: **negro profundo, y el oro solo donde hay logro o acción principal**.

1. **El negro es el escenario.** Cinco niveles de superficie, nada más. La profundidad se comunica con nivel de superficie + borde, no con sombras de colores.
2. **El oro es la recompensa.** Oro sólido = máximo un elemento por vista (el CTA principal o el logro). Todo lo demás usa oro translúcido (`/10`, `/20`) o texto dorado. Si todo brilla, nada brilla.
3. **La luz es información.** Los acentos de color (emerald, blue, purple, amber…) siempre significan algo: estado, dominio, rango. Nunca decoración.
4. **La voz es de placa conmemorativa.** Labels micro en mayúsculas con tracking ancho + números grandes en black. Se lee como camiseta retirada en el techo del estadio.
5. **El movimiento celebra, no distrae.** Las animaciones grandes se reservan para hitos de gamificación; la UI diaria usa entradas discretas de 300–600 ms.

---

## 2. Capa 1 — Primitivos

### 2.1 Color

**Oro** (utilidades `*-gold-{n}`):

| Token | Hex | Uso |
|---|---|---|
| `gold-100` | `#FFF8DC` | Champagne: partículas, texto sobre oro oscuro |
| `gold-300` | `#FFEB66` | Highlights, brillos de gradiente |
| `gold-400` | `#FFDF33` | Hover del oro sólido |
| `gold-500` | `#FFD700` | **Oro canónico** (el único que "vende") |
| `gold-600` | `#D4AF37` | Oro metálico: extremo oscuro de gradientes |
| `gold-700` | `#9E7C1C` | Bordes fuertes, estado pressed |
| `gold-900` | `#3D3300` | Fondos teñidos de oro (alertas doradas) |

**Superficies** (utilidades `bg-surface-*`) — regla: *nunca inventar un negro, elegir un nivel*:

| Token | Hex | Nivel |
|---|---|---|
| `surface-base` | `#09090B` | Fondo de la app (y `theme-color` de la PWA) |
| `surface-sunken` | `#0D0D0F` | Pozos: inputs, tracks de barras |
| `surface-card` | `#121214` | Tarjetas y paneles |
| `surface-raised` | `#18181B` | Modales, dropdowns, hover de tarjeta |
| `surface-top` | `#1F1F23` | Tooltips, máxima elevación |

**Texto** (utilidades `text-fg*`):

| Token | Hex | Uso |
|---|---|---|
| `fg` | `#EDEDED` | Texto principal |
| `fg-secondary` | `#9CA3AF` | Apoyo, descripciones |
| `fg-muted` | `#6B7280` | Labels, metadatos |
| `fg-faint` | `#4B5563` | Solo decorativo — **nunca** información |
| `fg-inverse` | `#0A0A0C` | Texto sobre oro |

**Blancos alfa** (el idioma de bordes y rellenos neutros — se mantienen las utilidades nativas):
`white/5` relleno sutil · `white/10` borde por defecto · `white/20` borde activo · `white/[0.03]` hover de fila.

### 2.2 Tipografía — Outfit (300 / 400 / 600 / 800 / 900)

| Rol | Receta | Ejemplo |
|---|---|---|
| Display héroe | `text-3xl md:text-4xl font-black uppercase tracking-wider` (+ `.text-gradient-gold` en hitos) | ¡RANGO ASCENDIDO! |
| H1 página | `text-2xl font-black tracking-tight` | Nombre del atleta |
| H2 sección | `text-lg font-black uppercase tracking-tight` | Rango actual |
| Body | `text-sm font-light leading-relaxed text-fg-secondary` | Descripciones |
| **Eyebrow** (la voz de la marca) | `text-3xs font-bold uppercase tracking-eyebrow text-fg-muted` | RANGO ACTUAL |
| Dato grande | `text-2xl font-black tabular-nums` | 2.450 XP |
| Micro chip | `text-2xs font-black uppercase tracking-eyebrow` | PRIORIDAD ALTA |

Nuevas utilidades: `text-3xs` (9px), `text-2xs` (10px), `tracking-eyebrow` (0.2em). Reemplazan `text-[9px]`, `text-[10px]`, `tracking-[0.2em]`.
Números siempre con `tabular-nums`. Nunca usar pesos que Outfit no carga (500/700).

**Piso legible: `text-3xs` (9px) es el tamaño mínimo permitido, en cualquier pantalla.** No existe token por debajo — un `text-[8px]` o similar es un arbitrario prohibido (§8) además de quedar bajo lo cómodo en móvil (auditoría atleta 2026-07-09: labels de apoyo repetidas en 8px en `StatCard`, patrón "label chico + valor grande" perfectamente válido, pero con el label 1px por debajo del piso).

### 2.3 Espaciado y radios

- Escala Tailwind de 4px. Tarjeta principal: `p-6 md:p-8`; tarjeta compacta/panel: `p-4` o `p-5`; gaps de grillas: `gap-4 md:gap-6`.
- **Target táctil mínimo 44px** (`min-h-11` / var `--control-height`); versión densa desktop 36px.
- Radios anidables — exterior ⊃ interior: `rounded-card` (24px, tarjetas/modales) ⊃ `rounded-panel` (16px, sub-tarjetas/alertas) ⊃ `rounded-control` (12px, botones/inputs/chips) ⊃ `rounded-full` (pills/avatares/dots). En móvil las tarjetas principales van edge-to-edge: `rounded-none md:rounded-card`.

### 2.4 Sombras y glows

| Utilidad | Uso |
|---|---|
| `shadow-card` | Sombra base de `.glass-card` (negra + inset highlight) |
| `shadow-modal` | Modales y sheets |
| `shadow-glow-gold` | Aura del CTA dorado |
| `shadow-glow-gold-soft` | Hover de borde (via `.glow-border`) |
| `shadow-glow-bar` | Barras de progreso |

Glows de otros acentos: inline con el hex del token + alpha (`0 0 20px {hex}33`), o `drop-shadow` para emojis/íconos.

---

## 3. Capa 2 — Semánticos

### 3.1 Marca

`brand` (=gold-500) · `brand-hover` (=gold-400) · `brand-strong` (=gold-600) · `on-brand` (texto sobre oro). Los componentes usan **estos**, no la escala gold directa — así un rebranding es un cambio de 4 líneas.

### 3.2 Feedback y dominio

Cada acento tiene par **base** (500 — fondos, dots, barras) y **soft** (400 — texto sobre negro):

| Token | Significado en Black Gold |
|---|---|
| `success` | Pagos al día, asistencia, "Excelente", aprobaciones |
| `warning` (ámbar) | Fatiga, pendiente de aprobación, agotamiento |
| `caution` (naranja) | "Regular", sensibilidad al impacto, rango Prospecto |
| `danger` | Crítico, deudas, lesión, eliminar |
| `info` (azul) | Datos físicos, autoevaluación del atleta |
| `mental` (púrpura) | Misiones, perfil mental, Leyenda Mamba |
| `whatsapp` / `whatsapp-deep` | Solo el botón de reporte WhatsApp |

### 3.3 Gamificación (fuente única — antes triplicada)

**Rangos XP** (`text-rank-*`, `bg-rank-*`): `rank-rookie` #9CA3AF 🟤 · `rank-prospecto` #FB923C 🟠 · `rank-desarrollo` #60A5FA 🔵 · `rank-elite` #FFD700 ⭐ · `rank-leyenda` #C084FC 👑.
**Baremo de rendimiento** (`text-tier-*`): `tier-excelente` #34D399 (≥81) · `tier-muybueno` #FFD700 (≥61) · `tier-bueno` #22D3EE (≥41) · `tier-regular` #FB923C (≥21) · `tier-sindatos` #4B5563.

En JS: `RANGOS_UI` y `BAREMO_UI` de `designTokens.js`. **Migrar** los mapas locales de `xpProgress.js`, `RangoProgreso.jsx` y `LevelUpAnimation.jsx` a estas fuentes (hoy divergen: la barra usa 500s y el level-up 400s).

---

## 4. Capa 3 — Componentes (recetas canónicas)

### 4.1 Tarjetas

**Card principal (dashboard):**
```
glass-card rounded-none md:rounded-card p-6 md:p-8 relative overflow-hidden isolate glow-border
```
Anatomía: luz ambiental opcional (`absolute -top-32 -right-32 w-64 h-64 rounded-full blur-[100px] opacity-60 bg-brand pointer-events-none`) → header (avatar + identidad + chips) → cuerpo → footer con `border-t border-white/10 pt-6`.

**Panel interno / alerta:** `rounded-panel border p-4 backdrop-blur-md` + tinte semántico: `bg-{acento}/10 border-{acento}/25` (alertas fuertes: `/40`).

**KPI/Stat card:** `glass-card rounded-panel p-5` con eyebrow arriba, valor `text-2xl md:text-3xl font-black tabular-nums`, delta `text-2xs font-bold text-success-soft` (o danger) y sparkline dorada opcional.

Estados: hover desktop via `.glow-border`; loading con `.skeleton`; nunca elevar con más sombra — elevar cambiando a `surface-raised`.

### 4.2 Botones (altura táctil `min-h-11`, densa `min-h-9`)

| Variante | Receta | Uso |
|---|---|---|
| **Primario** | `bg-brand text-on-brand border border-brand/50 rounded-control font-black uppercase tracking-eyebrow text-2xs shadow-glow-gold hover:bg-brand-hover active:scale-[0.97] transition` | **Uno por vista.** Evaluar, Guardar, Confirmar |
| Secundario tintado | `bg-{acento}/20 border border-{acento}/50 text-{acento}-soft rounded-control …` | Acciones de dominio (Misiones→mental, Test→info) |
| Ghost | `bg-white/5 border border-white/10 text-fg-secondary hover:bg-white/10 hover:text-fg` | Cancelar, toggles, filtros |
| Destructivo | como secundario con `danger` | Eliminar (siempre con confirmación) |
| Ícono | `size-11 rounded-control bg-white/5 border border-white/10 grid place-items-center` | Toolbar |

`hover:scale-105` solo en desktop; en táctil el feedback es `active:scale-[0.97]`. Disabled: `opacity-40 pointer-events-none`. Loading: spinner + label, nunca colapsar el ancho.

### 4.3 Chips / Badges

Receta base: `text-2xs font-black uppercase tracking-eyebrow px-2.5 py-1 rounded-full border`.
- **Semántico:** `bg-{acento}/10 border-{acento}/25 text-{acento}-soft`
- **Neutro:** `bg-white/10 border-white/20 text-fg`
- **Rango:** emoji + `text-rank-{id}` con `border-rank-{id}/30 bg-rank-{id}/5`
- **Dot de estado en vivo:** `size-2 rounded-full bg-{acento} animate-pulse` (o `animate-pulse-glow` si debe irradiar)
- **Estado derivado / sin confirmar** (dato generado automáticamente — placeholder de migración, cálculo sin plan asignado, valor por defecto que nadie revisó): nunca usar el mismo badge/color que el dato real equivalente, aunque coincida en texto. Usar tono `caution` (`text-caution-soft bg-caution/10 border-caution/30`) con una etiqueta que nombre la ausencia ("Sin representante confirmado", "Sin plan asignado") en vez de mostrar el valor generado como si fuera dato confirmado. Precedente: representante placeholder de migración en Control de Pagos (`AdminPagos.jsx`).

En listas grandes (roster, tabla de pagos), no dupliques un mismo dato con dos representaciones (nombre bonito + su `id`/slug crudo al lado) — si el crudo no aporta información nueva, se elimina, no se muestra "por si acaso".

### 4.4 Barras de progreso

Track: `h-2 bg-surface-sunken border border-white/5 rounded-full overflow-hidden` (sub-pilares: `h-1.5`).
Fill: `.progress-bar-glow` (dorada) o gradiente del acento `linear-gradient(90deg, {hex}88, {hex})` + `boxShadow: 0 0 8px {hex}66`.
Animación: `initial={{width:0}} animate={{width: pct+'%'}}` con `MOTION.duration.bar` y `ease: MOTION.ease.premium`, delay ≤ 0.5s.

### 4.5 Formularios

Campo: `bg-surface-sunken border border-white/10 rounded-control px-4 min-h-11 text-fg placeholder:text-fg-muted focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/20`.
Label = eyebrow. Error: borde `danger/50` + mensaje `text-2xs text-danger-soft`. (La regla global de 16px en móvil ya vive en `index.css`.)

### 4.6 Modales y sheets

Backdrop `bg-black/80 backdrop-blur-sm`; contenedor `bg-surface-raised border border-white/10 shadow-modal rounded-card` (`VARIANTS.modalIn`). En móvil: bottom-sheet full-width `rounded-t-card` con handle `w-10 h-1 rounded-full bg-white/20 mx-auto`, entrada con `MOTION.spring.ui`. Pantallas de celebración: overlay total con radial del acento (patrón LevelUpAnimation).

### 4.7 Navegación

Ítem: `rounded-control text-2xs font-black uppercase tracking-eyebrow min-h-11`.
Activo: `bg-brand/10 text-brand border border-brand/20` (+ indicador `w-1 rounded-full bg-brand` lateral en sidebar / inferior en tabs). Inactivo: `text-fg-muted hover:text-fg hover:bg-white/5`. Móvil: bottom bar con safe-area (`pb-[env(safe-area-inset-bottom)]`).

**Filtros colapsables en móvil:** cuando una vista tiene 3+ filtros (categoría, nivel, posición, género…), no los muestres siempre expandidos en el breakpoint móvil — se comen la pantalla antes de la primera tarjeta de contenido. Patrón canónico (`AdminAtletasFiltersPanel.jsx`): botón "Filtros" (ícono `Filter` + dot `bg-brand animate-pulse` si hay filtros activos) que despliega el panel con `AnimatePresence`/`height: 0 → auto`. En desktop (`lg:` o el breakpoint que ya use la vista) los filtros pueden quedar siempre visibles inline — el colapso es un problema específico de móvil, no hace falta imponerlo arriba de ese breakpoint.

**Espacio reservado bajo contenido con FAB flotante:** una superficie que monta `BottomNav` (74px + safe-area) y el FAB del Copiloto (`CopilotoLauncher`, otros 16px de offset + 48px de alto sobre la BottomNav) debe reservar como `padding-bottom` del contenido scrolleable la suma de ambos, no solo la altura de la BottomNav — de lo contrario el FAB queda flotando sobre la última tarjeta visible al hacer scroll hasta el final.

### 4.8 Secciones de dashboard

Header de sección: eyebrow + título, ícono `text-brand size-5`, separador `border-t border-white/10 pt-6 mt-6`.
Layout por vista: **héroe/KPIs → contenido principal → secundario**, `grid gap-4 md:gap-6`, móvil 1 columna. La jerarquía de una vista se lee en sus dorados: héroe > CTA > acentos.

### 4.9 Gráficos (Recharts — usar `CHART` de designTokens.js)

Serie del atleta siempre `gold-500`; comparativas (media categoría/club) en blanco alfa — el color con significado se reserva al atleta. Grid `CHART.grid`, ejes `CHART.axis`, tooltip estilo `CHART.tooltip` (surface-top + borde white/10). Radar: fill `rgba(255,215,0,0.15)`. Sparklines: barras `w-1 bg-brand rounded-sm opacity-60`.

---

## 5. Motion system

Tokens en `MOTION` (JS) y `--ease-premium`, `animate-fade-in-up`, `animate-pulse-glow`, `animate-shimmer` (CSS).

| Duración | Valor | Uso |
|---|---|---|
| `fast` | 150 ms | Hover, toggles, color |
| `base` | 300 ms | Modales, fades, `fade-in-up` |
| `entrance` | 600 ms | Entrada de tarjetas (`VARIANTS.cardIn`) |
| `bar` | 1000 ms | Barras de progreso/XP |
| `celebration` | 2000+ ms | Level-up, logros |

**Coreografías canónicas:**
- **Entrada de dashboard:** tarjetas con `VARIANTS.cardIn` + `staggerDelay(index)` (paso 0.08s, **tope 0.6s** — corrige el `index*0.15` sin tope que hacía esperar 3s a la tarjeta 20).
- **Celebración (level-up):** backdrop radial del acento → anillos expansivos (scale 0→1.2→1, 2s) → partículas radiales (radial-gradient, no box-shadow, con `willChange`) → emoji con `spring.festive` → título `.text-gradient-gold`. Confetti: `CONFETTI_GOLD`.
- **Progreso:** width 0→X con `ease.premium`; el glow acompaña al fill, nunca se anima solo.
- **Vivo/pendiente:** dot con `animate-pulse` (o `animate-pulse-glow`).

**Reglas duras:** respetar `prefers-reduced-motion` (global en `index.css` + `useReducedMotion` en coreografías JS como ya hace LevelUpAnimation); **nunca `transition-all`** — usar `transition` (Tailwind emite una lista curada de propiedades: color, bg, border, transform, box-shadow, opacity, filter) o una utilidad específica (`transition-colors`, `transition-transform`); no animar `box-shadow`/`blur` por frame; solo `transform` y `opacity` en loops; menos partículas en pantallas <480px (patrón existente).

---

## 6. Dashboards por rol

| Rol | Héroe (lo primero que ve) | Acentos dominantes |
|---|---|---|
| **Atleta** | Rango + barra XP (`XPProgressBar`) | Su color de rango; misiones en `mental` |
| **Padre** | Estado del atleta + pagos | `success`/`danger` (pagos), `info` (físico) |
| **Coach** | Grilla de atletas + sesión del día | `brand` en evaluación; alertas `warning`/`danger` |
| **Owner** | KPIs del club | Neutros + `brand`; deltas `success`/`danger` |

El rol **no** cambia tokens (mismo dark premium para todos) — cambia jerarquía y densidad: coach/owner admiten modo denso (controles 36px) en desktop; atleta/padre siempre táctil 44px.

---

## 7. Accesibilidad

- **Contraste AA:** `fg` 15.2:1 y `brand` 12.6:1 sobre `surface-card` ✔. `fg-muted` (4.6:1) mínimo para texto informativo pequeño; `fg-faint` (2.9:1) **solo decorativo**. Texto `on-brand` sobre oro 11.9:1 ✔.
- **Táctil:** 44px mínimo; separación ≥8px entre targets.
- **Foco visible:** regla global `:focus-visible` en `tokens.css` da un anillo dorado (outline 2px `brand` + offset) a **todo** interactivo con navegación por teclado, sin ensuciar el foco de mouse. Los controles con `focus:ring` propio (inputs de formulario) lo conservan; no hace falta añadir foco por componente.
- **Movimiento:** reduced-motion global + coreografías con fallback fade.
- **Color nunca solo:** todo estado lleva texto o ícono además del color (los chips ya lo cumplen).

---

## 8. Gobernanza y migración

**Reglas:**
1. Prohibido introducir hex nuevos en JSX/CSS de componentes — si falta un color, se tokeniza primero.
2. Prohibidos los arbitrarios de color/tamaño de fuente (`text-[#FFD700]`, `text-[10px]`) en código nuevo — existen `text-brand`, `text-2xs`.
3. Un solo oro sólido por vista.
4. Nuevos mapas de color en JS solo en `designTokens.js`.
5. Nunca `transition-all` — usar `transition` o una utilidad específica (ver §5). El foco visible es global (§7): no reintroducir `outline-none` sin reemplazo.

**Mapa de migración (aplicar oportunistamente, archivo por archivo):**

| Antes | Después |
|---|---|
| `text-[#FFD700]` / `bg-[#FFD700]` / `border-[#FFD700]/30` | `text-brand` / `bg-brand` / `border-brand/30` |
| `hover:bg-[#D4AF37]` | `hover:bg-brand-hover` (aclara en vez de apagar) |
| `#121214`, `#0d0d0f`, `#18181b` sueltos | `surface-card` / `surface-sunken` / `surface-raised` |
| `text-[9px]` / `text-[10px]` + `tracking-[0.2em]` | `text-3xs` / `text-2xs` + `tracking-eyebrow` |
| `text-gray-400/500/600` | `text-fg-secondary` / `text-fg-muted` / `text-fg-faint` |
| `text-emerald-400`, `bg-emerald-500/10`… | `text-success-soft`, `bg-success/10`… |
| `rounded-3xl` / `rounded-2xl` / `rounded-xl` (en su rol) | `rounded-card` / `rounded-panel` / `rounded-control` |
| `shadow-[0_0_20px_rgba(255,215,0,0.4)]` | `shadow-glow-gold` |
| `delay: index * 0.15` | `staggerDelay(index)` |
| Mapas de rango locales (3 archivos) | `RANGOS_UI` / `BAREMO_UI` |

**Fases sugeridas** (cada una es un PR chico y verificable): ① gamificación (rangos unificados — corrige la divergencia real 400 vs 500) → ② tarjeta de atleta + paneles de misiones → ③ dashboards admin/owner → ④ formularios y modales restantes.

**Deuda que este sistema deja medida:** al crearlo (2026-07-05) había 254 hex en 40 archivos (`#FFD700` = 527 apariciones contando clases arbitrarias).

**Estado tras las fases 1–4 (mismo día):** ✅ migración completa. Quedan exactamente **dos excepciones deliberadas** fuera de `tokens.css`/`designTokens.js`: la escala clínica de hidratación de `ReadinessModal.jsx` (colores de dominio médico, no UI) y el tono decorativo `#075E54` del gradiente WhatsApp en `PortalPadreSeccion.jsx`. Cualquier otro hex nuevo en componentes es una regresión.
