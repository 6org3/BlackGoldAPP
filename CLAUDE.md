# CLAUDE.md

Guía para asistentes de IA (y personas) que trabajen en este repositorio.

## Qué es este repo

Black Gold — un ecosistema de club de baloncesto para el club en Sucumbíos (Ecuador). Es una bóveda de Obsidian (documentación del club en `docs/`) más dos aplicaciones web.

- `Dashboard_Premium/` — la app principal. React + Vite (PWA), backend en Supabase. Aquí ocurre el desarrollo activo.
- `blackgold-mcp/` — servidor MCP del proyecto (proceso Node por stdio que se conecta a Supabase y expone herramientas analíticas como `analyze_athlete_pillars`). Consume `packages/analytics-core` para la categoría FEB (ver abajo).
- `packages/analytics-core/` — **capa de analítica compartida**: baremos científicos, categoría FEB y agregación de pilares/radar, consumidos tanto por `Dashboard_Premium` como por `blackgold-mcp`. No es un paquete npm publicado ni un workspace: ambos lo importan por ruta relativa (ver `packages/analytics-core/README.md`). `Dashboard_Premium/src/lib/baremosEngine.js`, `radarCalc.js` y `src/api/utilsAtletas.js` son shims que reexportan desde aquí — no reintroducir esa lógica en esos archivos.
- `docs/` — notas de metodología y estrategia del club (entrenamiento, táctica, mentalidad, corporativo, comunicaciones). En español.
- `Dashboard_Premium/supabase/migrations/` — migraciones SQL versionadas con la convención de Supabase CLI (`<timestamp>_descripcion.sql`), consolidadas ahí desde julio 2026 (antes vivían sueltas en la raíz del repo y de `Dashboard_Premium/`).

## Stack técnico (Dashboard_Premium)

- React + Vite, clases utilitarias de Tailwind, Framer Motion, íconos lucide-react.
- Supabase (Postgres + Auth + RLS) accedido a través de `src/api/*Service.js`.
- Gráficos tipo Recharts/D3 para métricas del atleta (radar, histórico).
- Desplegado en Vercel (`vercel.json`).

## Convenciones

- La capa de API vive en `src/api/`, un `*Service.js` por dominio (atletas, sesiones, comunicaciones, pagos, etc.). Los componentes/páginas llaman a estos servicios, no a Supabase directamente.
- El texto de la UI y el lenguaje de dominio están en **español** (categoría, atleta, grupo, convocatoria). Mantenerlo así para los textos de cara al producto.
- La categoría del atleta se deriva de la fecha de nacimiento con `calcularCategoriaFEB()` (real en `packages/analytics-core/categoriaFEB.js`, reexportada por el shim `src/api/utilsAtletas.js`; Premini Sub-9 … Mayores). Existe un gemelo en SQL, `calcular_categoria_feb()` (migración v18) — mantener sincronizados los tres (JS compartido, shim, SQL) si cambian los rangos.
- Roles: `superadmin`, `owner`, `coach`, `atleta`, `padre`.
- Las migraciones de base de datos son aditivas (`ALTER TABLE ... IF NOT EXISTS`). Agregar un nuevo archivo en `Dashboard_Premium/supabase/migrations/` con timestamp nuevo (`npx supabase migration new <descripcion>` genera el nombre correcto) en lugar de editar uno ya aplicado. Última: v19 (auth_user_id + resolver_email_login, ver `docs/plan_remediacion_seguridad.md` Fase 1). Aplicar con `npx supabase db push` (proyecto ya vinculado, ver `supabase/.temp/project-ref`) en vez de pegar el SQL a mano en el editor web — así el historial de migraciones aplicadas queda registrado server-side.
- El esquema real de las tablas base (`usuarios`, `atletas`, `evaluaciones_pruebas`, `padres_atletas`, `asistencia`, `pagos`, `misiones`, `recompensas`…) todavía no tiene una migración baseline versionada — solo existen como el acumulado de ALTERs aplicados a mano a lo largo del tiempo. Falta ejecutar `npx supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql` (requiere `supabase login` del usuario) para capturarlo. Al menos una columna conocida (`misiones.autor_id`) se aplicó a mano y no quedó en ningún archivo del repo — ver `20260622000007_migracion_fase1_stub_autor_id.sql`.

## Secretos

- Nunca poner claves en el código. Las credenciales de Supabase vienen de variables de entorno (`VITE_SUPABASE_*`). Los archivos `.env*` están en `.gitignore` — no commitearlos.

## Problemas conocidos / detalles a tener en cuenta

- **El repo ya no vive en OneDrive** (vive en `~/dev/BlackGoldAPP`). Sigue pudiendo aparecer un `index.lock` stale en `.git` cuando git se ejecuta desde herramientas en sandbox; si no hay ningún proceso git corriendo, es seguro borrar ese archivo y reintentar.
- Los scripts operativos de un solo uso viven en `Dashboard_Premium/scripts/` (no en la raíz de `Dashboard_Premium/`), leen credenciales solo de `.env` (nunca hardcodeadas) y varios escriben/borran datos reales — revisar cada uno antes de ejecutarlo, especialmente `limpiar_base_datos.js`.
- No existía una tabla de pertenencia atleta↔grupo de entrenamiento; la migración v18 agrega `atleta_grupo`. Debe poblarse para que funcionen las funciones basadas en grupos.

## Documentos de diseño

- `docs/design_system.md` — Black Gold Design System v1 (tokens, componentes, motion, gobernanza). Implementación viva en `Dashboard_Premium/src/styles/tokens.css` (Tailwind v4 `@theme`) y `Dashboard_Premium/src/lib/designTokens.js` (Recharts/Framer/confetti). Demo visual: `docs/design_system_demo.html`. Regla: no introducir hex nuevos en componentes — tokenizar primero.
- `docs/comunicaciones_eventos.md` — diseño de las comunicaciones segmentadas y el módulo de eventos deportivos (convocatorias/RSVP, recordatorios, resultados), más la capacidad futura de campeonatos + planilla de juego digital. Acompaña a la migración v18.
- `docs/evaluacion_ingenieria_producto.md` — evaluación de ingeniería del producto (2026-07-01): arquitectura, seguridad, calidad de código y roadmap P0/P1/P2.
- `docs/plan_remediacion_seguridad.md` — plan de remediación fase por fase derivado de la evaluación anterior; es la fuente de verdad sobre qué fase de seguridad/deuda técnica está en curso o pendiente.
