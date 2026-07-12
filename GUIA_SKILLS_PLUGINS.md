# Guía de skills, plugins y MCP servers de Claude Code

Referencia de todo lo que tienes instalado para trabajar con Claude Code en este repo: qué es cada cosa, para qué sirve y cómo invocarla. No es documentación del club (eso vive en `docs/`) sino de las herramientas del asistente.

## Cómo invocar

- **Skill:** escribe `/nombre-skill` en el chat (ej. `/doctor`). También puedes simplemente describir la tarea en lenguaje natural — Claude detecta sola cuál skill aplica según su descripción, sin que escribas el `/comando`.
- **Skill de un plugin:** aparecen con prefijo `plugin:skill` en el listado (ej. `small-business:friday-brief`) — se invocan igual, `/small-business:friday-brief`.
- **MCP servers:** no se invocan a mano. Exponen "tools" que Claude llama automáticamente cuando la tarea lo requiere (ej. pedís un diagnóstico de un atleta y Claude solo, sin que se lo digas, llama a `analyze_athlete_pillars` de `blackgold-mcp`). Se gestionan con `/mcp` en una sesión interactiva.

---

## 1. El "repo instalado": Hyperframes (creación de video/contenido)

Las 20 skills de video de este proyecto (`.claude/skills/`) no son entradas sueltas: todas vienen de un único repo de GitHub, **[`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes)**, instalado y fijado por versión en [`skills-lock.json`](skills-lock.json) (raíz del repo). Es el framework que usás para producir el contenido de redes/marketing de Black Gold — renderiza video a partir de HTML/composiciones, no de edición tradicional de clips.

Tanto `.claude/skills/` como `skills-lock.json` están en `.gitignore` — no se suben al repo. Si te falta este set en otra máquina o worktree, se reinstala con la CLI de Hyperframes (`npx hyperframes skills` / `hyperframes-cli`, ver más abajo).

### Punto de entrada — leer primero
| Skill | Para qué sirve |
|---|---|
| `/hyperframes` | **Siempre empezá por acá** para cualquier pedido de video/animación. No renderiza nada — enruta tu pedido al workflow especializado correcto (o a `general-video` si ninguno calza) y apunta a las skills de dominio de abajo. |

### Workflows por tipo de contenido (lo que normalmente vas a usar)
| Skill | Para qué sirve |
|---|---|
| `/product-launch-video` | Promo/lanzamiento de producto o servicio a partir de una URL, guion o brief. Es el default para cualquier pedido comercial ("lanzar", "promocionar"). |
| `/faceless-explainer` | Explicativo sin cámara a partir de texto/notas/tema — tipografía y gráficos inventados por escena (sin sitio ni footage real). |
| `/website-to-video` | Tour/showcase de un sitio real: captura screenshots y usa los assets de marca del sitio. |
| `/motion-graphics` | Pieza corta (hasta ~30s) donde el motion ES el mensaje: tipografía cinética, contador de stat, logo sting, overlay para redes, mapa animado. |
| `/music-to-video` | Video sincronizado a un track de música (lyric video, slideshow o promo al ritmo del beat). |
| `/talking-head-recut` | Le agrega overlays gráficos diseñados (títulos, lower-thirds, callouts) a un video de cámara/entrevista ya existente, sincronizados al guion. |
| `/embedded-captions` | Subtítulos "incrustados" en la escena con estética VFX (36 identidades visuales) para un video de cámara. |
| `/slideshow` | Presentación/deck navegable con slides, reveals y modo presentador — no es un MP4 renderizado. |
| `/pr-to-video` | Explicativo de un cambio de código a partir de un PR de GitHub (changelog, feature reveal). No aplica a Black Gold salvo que quieras explicar cambios del código en video. |
| `/general-video` | Fallback para composiciones custom que no encajan en ningún workflow anterior (piezas largas, reels de marca, montajes). |

### Soporte / import
| Skill | Para qué sirve |
|---|---|
| `/figma` | Importa diseños de Figma (assets, tokens de marca, componentes, animaciones) hacia una composición de video. |
| `/remotion-to-hyperframes` | Migra una composición existente de Remotion (React) a HTML de Hyperframes. Solo si ya tenías algo en Remotion. |
| `/media-use` | El "Agent Media OS": resuelve música, SFX, imágenes, íconos, logo, voz, LUT de color a un archivo local listo para usar; genera con TTS/modelos si no hay algo en el catálogo. |

### Referencia técnica (Claude las consulta sola, rara vez las invocás directo)
| Skill | Para qué sirve |
|---|---|
| `hyperframes-core` | El "contrato" de una composición Hyperframes (estructura HTML, timing, tracks). |
| `hyperframes-animation` | Reglas de motion, blueprints de escena, y los 7 adaptadores de animación (GSAP, Lottie, Three.js, etc.). |
| `hyperframes-creative` | Dirección de arte no-animación: paletas, tipografía, narración, planificación de beats. |
| `hyperframes-keyframes` | Keyframes 2D/3D seek-safe, timelines GSAP, morphing SVG. |
| `hyperframes-registry` | Instala/gestiona bloques y componentes reusables (`hyperframes add`). |
| `hyperframes-cli` | Referencia de la CLI: `npx hyperframes init/add/capture/render/preview/lambda/...` — acá está el comando para reinstalar el set de skills si falta. |

---

## 2. Skills de diseño/UI instaladas a tu nivel de usuario

Aplican en **todos** tus proyectos (`~/.claude/skills/`), no solo Black Gold.

| Skill | Para qué sirve |
|---|---|
| `/ui-ux-pro-max` | La más completa: 67 estilos, 161 paletas, 57 combinaciones de fuentes, 21 stacks (React, Vue, Tailwind, shadcn/ui...). Para planear/construir/revisar UI de cualquier tipo de app. |
| `/ui-styling` | Construcción concreta con shadcn/ui + Tailwind: componentes accesibles, dark mode, temas. |
| `/design-system` | Arquitectura de tokens (primitivo→semántico→componente), specs de componentes, generación de slides con esos tokens. |
| `/design` | Skill "paraguas": identidad de marca, logos (55 estilos), CIP corporativo, presentaciones HTML, banners, íconos, fotos para redes. |
| `/banner-design` | Banners para redes/ads/hero/impreso con múltiples direcciones de arte generadas por IA. |
| `/brand` | Voz de marca, identidad visual, mensajería, gestión de assets — para contenido con consistencia de marca. |
| `/slides` | Presentaciones HTML estratégicas con Chart.js, copywriting y layouts responsive. |
| `/humanizer` | Edita texto para que no "suene a IA" (basado en la guía de Wikipedia sobre señales de escritura IA) — quitar em-dashes de más, vocabulario típico de IA, voz pasiva, etc. |
| `/gstack` | Navegador headless rápido para QA y probar el propio sitio/app (dogfooding). |

---

## 3. Utilidades y meta-skills de Claude Code

Vienen con el propio Claude Code (o el paquete `anthropic-skills`); no son específicas de ningún proyecto.

| Skill | Para qué sirve |
|---|---|
| `/doctor` | El chequeo de salud que corriste hoy: versión, settings rotos, skills/plugins sin uso, hooks lentos, permisos. |
| `/review` | Revisión de código/PR. |
| `/security-review` | Revisión enfocada en seguridad. |
| `/code-review` | Revisión del diff actual por bugs y simplificación, con niveles de esfuerzo (low → ultra). |
| `/simplify` | Aplica directamente limpieza de reuso/simplificación/eficiencia al código cambiado (no busca bugs, para eso es `/code-review`). |
| `/verify` | Verifica que un cambio de código realmente funciona, ejecutando el flujo afectado de punta a punta. |
| `/run` | Levanta y prueba la app en el navegador para confirmar visualmente un cambio. |
| `/init` | Bootstrap inicial de configuración de Claude Code para un proyecto. |
| `/update-config` | Cambios a `settings.json`/permisos/hooks/variables de entorno del propio Claude Code. |
| `/keybindings-help` | Personalizar atajos de teclado de Claude Code. |
| `/fewer-permission-prompts` | Escanea tus transcripts y agrega un allowlist de comandos de solo lectura frecuentes para que dejen de pedir permiso. |
| `/claude-api` | Referencia de la API de Anthropic/Claude (modelos, pricing, streaming, tool use, MCP, caching) — se auto-activa si mencionás Claude/Anthropic/LLMs. |
| `/loop` | Corre un prompt o slash command en un intervalo recurrente (ej. "revisá el deploy cada 5 min"). |
| `/schedule` | Crea/gestiona agentes en la nube con cron (tareas programadas, recordatorios). |
| `/artifact-design` | Guía de diseño para las páginas visuales (Artifacts) que Claude puede publicar. |
| `/dataviz` | Se activa antes de crear cualquier gráfico/chart/dashboard, para que todos se vean como un mismo sistema visual. |
| `/deep-research` | Investigación profunda multi-fuente con verificación adversarial y reporte citado. |
| `canvas-design`, `docx`, `pdf`, `pptx`, `xlsx` (paquete `anthropic-skills`) | Generar/editar esos formatos de archivo (documentos Word, PDFs, presentaciones PowerPoint, hojas Excel, diseños tipo canvas). |
| `consolidate-memory` | Consolida y limpia tu memoria persistente de Claude Code. |
| `setup-cowork` | Configuración inicial del producto de multi-agente "Cowork". |
| `skill-creator` | Asistente para crear una skill nueva (`SKILL.md` con frontmatter, estructura). |

---

## 4. Plugins de "persona" de negocio (marketplace, actualmente sin usar en Black Gold)

Cada uno es un paquete de skills + conectores MCP orientados a un rol. Los dejamos sin tocar por ahora (ver plan de `/doctor`), pero acá está qué traen por si querés probarlos.

### `engineering`
Skills: `architecture`, `code-review`, `debug`, `deploy-checklist`, `documentation`, `incident-response`, `standup`, `system-design`, `tech-debt`, `testing-strategy`. Conectores MCP asociados (requieren autorización): Datadog, GitHub, PagerDuty.

### `marketing`
Skills: `brand-review`, `campaign-plan`, `competitive-brief`, `content-creation`, `draft-content`, `email-sequence`, `performance-report`, `seo-audit`. Conectores: Ahrefs, Klaviyo, Similarweb, Supermetrics.

### `product-management`
Skills: `brainstorm`, `competitive-brief`, `metrics-review`, `product-brainstorming`, `roadmap-update`, `sprint-planning`, `stakeholder-update`, `synthesize-research`, `write-spec`. Conectores: Amplitude, Asana, Atlassian, ClickUp, Figma, Fireflies, Intercom, Linear, Monday, Notion, Pendo.

### `small-business`
El bundle más grande (~31 skills) — pensado para dueños/gerentes de pequeño negocio: `business-pulse`, `friday-brief` (pulso semanal de ventas/top sellers), `monday-brief`, `cash-flow-snapshot`, `invoice-chase`, `crm-cleanup`, `customer-pulse`, `handle-complaint`, `lead-triage`, `margin-analyzer`, `price-check`, `payroll`, `tax-prep`, `contract-review`, `job-post-builder`, y más. Conectores: Canva, DocuSign, Gmail, Google Calendar/Drive, HubSpot, PayPal, QuickBooks, Slack, Square.

### `cowork-plugin-management`
Skills: `cowork-plugin-customizer`, `create-cowork-plugin` — para personalizar o crear plugins nuevos del producto Cowork.

**Nota:** casi todos los conectores MCP de arriba (Notion, Gmail, Figma vía plugin, Slack, etc.) están listados como "requieren autorización" — no van a funcionar hasta que los autorices desde la configuración de conectores de claude.ai o con `/mcp`.

---

## 5. MCP servers relevantes para este proyecto

| Servidor | Qué expone | Cómo se usa |
|---|---|---|
| `blackgold-mcp` | El servidor MCP propio del proyecto (`blackgold-mcp/`, en `.mcp.json`). Tools: `analyze_athlete_pillars`, `analyze_athlete_readiness`, `generate_custom_mission`, `suggest_next_test`, `generar_catalogo_misiones`, `generar_catalogo_pruebas`, `generar_descripciones_pruebas`, `consultar_rack`, `listar_rack`, `mapa_conocimiento`. | Automático: Claude las llama cuando el pedido es analítico/deportivo (ej. "diagnosticá los pilares de este atleta", "qué dice el rack sobre pliometría"). No hay slash command — es transparente. |
| `claude-in-chrome`, `Claude_Browser`, `computer-use`, `Claude_Preview` | Control de navegador/escritorio para probar la UI en vivo. | Automático cuando pedís probar algo en el navegador, o via el skill `/run`. |

---

*Generado a partir de un chequeo de `/doctor` (2026-07-11). Si instalás/quitás skills o plugins, esta guía puede quedar desactualizada — pedime que la regenere.*
