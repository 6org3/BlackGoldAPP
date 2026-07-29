# Auditoría del portal del atleta — piloto con impeccable

**Fecha:** 2026-07-28
**Alcance:** portal nativo del atleta (`/atleta`) — 5 pantallas: Base, Misiones, Progreso, Eventos y el modal de check-in de readiness.
**Herramienta:** [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) v3.4.0 — detector determinista (~60 reglas) + metodología `audit` (5 dimensiones, severidades P0–P3).
**Método:** el detector con engine de navegador no puede autenticarse, así que se volcó el DOM renderizado de cada pantalla con Cypress (cuenta QA de atleta, viewport 390×844) y se analizó vía `file://` con Puppeteer. Todos los hallazgos de contraste y tamaño se **remidieron de forma independiente** en el navegador real, componiendo el fondo sobre los ancestros. Las cifras de abajo son de esa medición propia, no del detector.

---

## Veredicto de integridad de implementación

**Pasa.** El portal expresa un sistema propio y coherente (Arcade HUD: retícula dorada, cortes `clip-path`, hexágonos, tipografía pixel), no una plantilla genérica. Los componentes componen con primitivas y tokens (`arcadeTokens.js`); no hay color arbitrario disperso. La mayoría de lo que el detector marca como "anti-patrón de IA" es aquí **identidad declarada** en `docs/design_system_arcade.md`, no deriva.

El problema no es la coherencia del sistema: es que **el sistema está calibrado por debajo del umbral de legibilidad** en tamaño y, en una pantalla, en contraste.

## Puntuación

| # | Dimensión | Score | Hallazgo principal |
|---|-----------|-------|--------------------|
| 1 | Accesibilidad | 2/4 | 73% del texto bajo 11px; 21 nodos fallan contraste AA; sin landmark `<main>` |
| 2 | Rendimiento | 3/4 | Lazy loading por ruta y `MotionConfig` correctos; queda `transition: width` en barras |
| 3 | Responsive | 3/4 | Móvil-first sólido; chips de filtro a 33px contra los 44px que manda el propio DS |
| 4 | Theming | 3/4 | Tokenización real y disciplinada; `C.text4` es un token que no cumple contraste |
| 5 | Integridad de implementación | 4/4 | Sistema propio, coherente y documentado |
| **Total** | | **14/20** | **Bueno — atacar accesibilidad** |

## Resumen ejecutivo

- 161 nodos de texto medidos en las 5 pantallas. **118 (73%) por debajo de 11px.**
- **21 nodos fallan contraste WCAG AA**, todos en la pantalla **Progreso**, todos con el mismo token: `C.text4` (#4B5563), entre 2.32:1 y 2.69:1 contra un mínimo de 4.5:1.
- Ninguna de las 5 pantallas declara un landmark `<main>`.
- El trap de foco de los modales **funciona**, pero el fondo no se marca `inert`, lo que deja un hueco cuando el foco cae en `<body>`.
- La pantalla **Progreso concentra el daño**: los 21 fallos de contraste y los 9 textos a 7px están ahí.

---

## Hallazgos por severidad

### [P1] Micro-tipografía por debajo del piso de legibilidad
**Ubicación:** transversal. Peores casos en `src/components/arcade/PantallaAtletaProgreso.jsx:21,105` (7px), `PantallaAtletaMisiones.jsx:35-36` (7.5px), `ArcadeBottomNav.jsx:142` (8px).
**Categoría:** Accesibilidad / Responsive
**Medición:** 118 de 161 nodos (73%) bajo 11px. Reparto: 7px×9 · 7.5px×3 · 8px×37 · 8.5px×18 · 9px×7 · 9.5px×12 · 10px×11.
**Impacto:** el usuario de este portal es un deportista de entre 9 y 18 años mirando un teléfono, a menudo en cancha y con luz solar. Texto funcional a 7–8px (etiquetas de los 8 pilares, semanas del histórico, nombres de insignias, ítems de la nav inferior) no se lee: se adivina por posición.
**Matiz importante:** el propio design system fija `BODY_MIN = 9` (`arcadeTokens.js:176`) — y hay 9 nodos a **7px**, por debajo incluso de su propio piso. Es deriva contra la norma interna, no solo contra un criterio externo.
**Recomendación:** elevar el piso de texto funcional a 11px conservando Silkscreen (la estética pixel sobrevive a 11px; lo que no sobrevive es la lectura a 7px). Es un cambio visual de alcance amplio — decisión de producto, ver "Siguientes pasos".

### [P1] El token `C.text4` no alcanza contraste AA en ningún fondo del portal
**Ubicación:** `src/components/arcade/arcadeTokens.js:34` (definición); usos en `PantallaAtletaProgreso.jsx:10,12,105` y `PantallaAtletaDetalle.jsx:76`.
**Categoría:** Accesibilidad / Theming
**Medición:** 21 nodos, 2.32:1 – 2.69:1 (mínimo AA: 4.5:1). Afecta a los nombres de rango bloqueado ("DESARROLLO · 160 XP", "ELITE · 160 XP"), las 6 semanas del histórico de XP (S1–S6), los nombres de las insignias no obtenidas ("MOTOR INAGOTABLE", "MAMBA MENTALITY", "LÍDER", "SANGRE FRÍA") y las unidades de la ficha física (kg, cm, kg/m²).
**Estándar:** WCAG 2.1 AA §1.4.3.
**Contraste con el token vecino:** `C.text3` (#828997) lleva un comentario que lo declara accesible y **lo es** (5.47:1 sobre `card`, verificado). `C.text4` no tiene esa nota ni ese respaldo: se usa como si fuera un gris de texto y no lo es.
**Impacto:** el caso más grave es el de las insignias e hitos **bloqueados**. Esa es justamente la información que motiva ("qué me falta por conseguir") y es la que resulta ilegible. Atenuar por opacidad del ícono es legítimo; volver ilegible el nombre del objetivo anula el bucle de progresión.
**Recomendación:** en contenido informativo, sustituir `C.text4` por `C.text3` y expresar el estado "bloqueado" con el tratamiento del ícono (opacidad, candado), no con el color del texto. Reservar `C.text4` para elementos puramente decorativos o realmente inertes.

### [P2] El fondo del modal no se marca como inerte
**Ubicación:** `src/components/arcade/ModalShell.jsx:39-64` y `src/components/arcade/ModalHUD.jsx:99-141` (primitivas compartidas); el caso concreto se observó en `ReadinessModal.jsx`, montado desde `VistaAtletaArcade.jsx:98-104`.
**Categoría:** Accesibilidad
**Medición (comprobada ejecutando Tab, no por inspección estática):**
- El trap **funciona**: desde el último focusable, Tab devuelve el foco a "Cerrar"; desde el primero, Shift+Tab va a "COMPLETAR CHECK-IN". El foco inicial cae dentro del diálogo. ✔
- **Agujero real:** el handler compara `document.activeElement` contra el primer y el último focusable. Si el foco queda en `<body>` — lo que ocurre al pulsar una zona muerta del panel — no coincide con ninguno, no se llama a `preventDefault()` y el Tab del navegador salta al primer focusable del **documento**, que está en el fondo. Verificado: `trapIntervino: false`.
- El fondo (`#root`) **no** lleva `inert` ni `aria-hidden`, y el diálogo vive fuera de él (portal a `<body>`). Un lector de pantalla en modo exploración recorre toda la interfaz de fondo como si estuviera disponible.
**Estándar:** WAI-ARIA APG, patrón *Dialog (Modal)*.
**Impacto:** agravado porque este modal **se auto-abre al entrar al portal** mientras no haya check-in del día: es lo primero que encuentra el atleta.
**Recomendación:** marcar `#root` con `inert` mientras el diálogo esté abierto. Una sola medida cierra los dos huecos: `inert` impide tabular al fondo (cubre el caso del foco en `body`) y lo retira del árbol de accesibilidad.
**Nota de método:** una primera pasada dio esto por "sin focus trap", contando los focusables del documento sin ejecutar Tab. La comprobación real lo desmintió; el hallazgo que queda es el de arriba, más acotado.

### [P1] Ninguna pantalla declara `<main>`
**Ubicación:** `src/components/arcade/VistaAtletaArcade.jsx:60` (el contenedor de scroll es un `<div>`).
**Categoría:** Accesibilidad
**Medición:** `main: 0` en las 5 pantallas. `<nav>` sí existe y está etiquetado correctamente (`ArcadeBottomNav.jsx:57`).
**Impacto:** sin landmark principal, un lector de pantalla no ofrece el salto "ir al contenido" y el usuario recorre el header en cada cambio de pantalla.
**Recomendación:** convertir el contenedor de scroll en `<main>`. Cambio de una línea, sin efecto visual.

### [P2] Chips de filtro por debajo del objetivo táctil que fija el propio DS
**Ubicación:** `src/components/arcade/PantallaAtletaMisiones.jsx` (barra de filtros TODAS / CANCHA / CASA / TODO LUGAR).
**Medición:** 33px de alto (62×33, 71×33, 55×33, 95×33).
**Estándar:** el propio `arcadeTokens.js:174` declara `ROW_H = 44; // fila/control táctil — móvil y por defecto (atleta/padre)`. Estos controles están 11px por debajo de la norma interna. También queda corto "HACER CHECK-IN ►" (328×**42**).
**Impacto:** fallos de pulsación en el filtro que el atleta usa para encontrar sus misiones.

### [P2] Barras de progreso sin semántica
**Ubicación:** `PantallaAtletaProgreso.jsx` (8 pilares, histórico de XP de 6 semanas), `PantallaAtletaInicio.jsx:108-115` (barra de XP).
**Medición:** la pantalla Progreso declara **0** elementos `role="progressbar"`; Base y el modal declaran 1 cada uno.
**Impacto:** los valores de progreso — el contenido central del portal — no se anuncian. Se pintan como barras decorativas sin `aria-valuenow/min/max`.

### [P2] Botón "Atrás" del detalle de misión a 34×34
**Ubicación:** `src/components/arcade/VistaAtletaArcade.jsx:47`.
**Nota:** hallazgo por lectura de código — la cuenta QA no tenía misiones activas, así que la pantalla de detalle no pudo medirse en vivo. Verificar al aplicar el fix.

### [P3] Observaciones menores
- `h1` con `color: transparent` + `background-clip: text` (`.text-gradient-gold`): el contraste no es evaluable por herramientas automáticas y el texto desaparece si `background-clip: text` falla. Afecta a los títulos "Base", "Misiones", "Progreso", "Eventos".
- `transition: width` en barras de progreso (`tokens.css`): anima una propiedad de layout; `transform: scaleX()` evita el reflow.
- `text-transform: uppercase` sobre 32 caracteres de texto corrido en Eventos: perjudica la lectura frente a las mayúsculas de etiqueta corta.
- En desktop el portal queda encerrado en una columna de 480px sobre fondo vacío. Es coherente con una PWA móvil-first, pero no hay adaptación a pantalla ancha.

## Positivo — conservar

- **Tokenización real y respetada.** Solo ~13 literales hex se escapan de las tres capas de tokens en toda la app; el portal del atleta no escribe color arbitrario.
- **`prefers-reduced-motion` bien resuelto** en dos capas (CSS + `<MotionConfig reducedMotion="user">`).
- **Los modales están bien construidos:** `role="dialog"`, `aria-modal`, nombre accesible, cierre con Escape, bloqueo del scroll de fondo, restauración del foco al disparador y trap de Tab funcionando en ambos sentidos. Falta solo marcar el fondo como inerte.
- **Un solo `h1` por pantalla** y jerarquía de encabezados sin saltos dentro del portal.
- **Anti-zoom de iOS resuelto sin sacrificar `maximum-scale`**, que es el error habitual.
- **Identidad visual genuina.** El HUD no se confunde con ningún otro producto.

---

## Calibración del detector: qué ignorar y por qué

El piloto también servía para medir el ruido de la herramienta contra un design system propio. Resultado:

**Falsos positivos del detector (verificados a mano, no accionar):**
- Todos los `low-contrast … via analytic-gradient+alpha`. El detector no compone bien el fondo cuando un ancestro lleva `gridBackground` (3 capas, incluido un `radial-gradient`). Reportó 1.0:1 para el "27%" de la barra de XP; el valor real es **10.6:1**. Los `low-contrast` sobre color sólido, en cambio, resultaron **todos correctos**.
- `[script-error] … global Cypress in the parent window` — artefacto del volcado, no de la app.

**Identidad declarada, ignorar por diseño** (registrar en `.impeccable/config.json` → `detector.ignoreRules` cuando se instale la herramienta):
- `dark-glow`, `radial-spotlight-glow`, `gradient-text`, `codex-grid-background` — los glows dorados, el halo del hero, el texto degradado y la retícula son el lenguaje Arcade documentado en `docs/design_system_arcade.md`.
- `ai-color-palette` (púrpura/violeta y cian) — `C.ai` y `C.cyan` son tokens deliberados: el púrpura marca **contenido generado por IA** y el cian el rango del atleta. Es semántica del producto, no decoración por defecto.
- `marquee` sobre `.skeleton::after` — es un skeleton de carga, no contenido en marquesina.
- Fuentes `Outfit` y `Silkscreen` — son la marca.

**Valor neto de la herramienta:** el detector sobre archivos JSX aportó poco (4 hallazgos en toda `src/`, ninguno accionable). El engine de navegador sobre el DOM renderizado fue **el que encontró todo lo importante** — pero requiere el rodeo del volcado autenticado y hay que verificar sus contrastes a mano. La metodología `audit` (5 dimensiones, P0–P3, obligación de verificar falsos positivos) es la parte más valiosa y es reutilizable sin la herramienta.

---

## Siguientes pasos

1. **[P1] PR A — accesibilidad, sin decisiones de producto:** landmark `<main>`, `C.text4` → `C.text3` en contenido informativo, `role="progressbar"` con `aria-value*`, `inert` en el fondo del modal, objetivos táctiles a 44px.
2. **[P1] Decisión del dueño — piso tipográfico.** Subir el texto funcional de 7–10px a un piso de 11px afecta a 118 nodos y cambia la densidad visual del HUD. Es la mejora de mayor impacto para el usuario real y también el cambio estético más grande. No se aplica sin ratificación.
3. **[P2] Extender el piloto.** El portal del **padre** (`/padre`) comparte primitivas, `ArcadeBottomNav` y el mismo lenguaje de micro-etiquetas: casi con seguridad arrastra los mismos dos P1. Los portales de staff (coach/owner/superadmin) son data-densos y usan `ROW_H_DENSE = 36`, así que merecen su propio criterio.
4. **[P3] Deuda documentada, no tocada en esta pasada:** doble superficie viva del rol atleta (`/atleta` y `/dashboard` → `AthleteLayout`), triplicación de las fuentes de tokens (`tokens.css` / `designTokens.js` / `arcadeTokens.js`) y `AdminPlanificacionPage.jsx` sin ruta que lo monte.
