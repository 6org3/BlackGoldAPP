# Simulación Black Gold — loop diario progresivo

Motor para **probar la app de forma progresiva** simulando un club "vivo" día a
día: altas de atletas, asistencia, evaluaciones, misiones/XP, pagos, eventos y
comunicaciones — con datos aleatorios (semilla fija) y **carga creciente**.
Después de cada tramo corre **invariantes** que detectan bugs y valida la
**lógica de negocio** (categoría FEB, cuadre de pagos, integridad referencial,
RLS). Un **smoke de UI en Cypress** cierra el ciclo end-to-end.

> **Por qué ahorra:** el loop es código Node/Cypress **puro** (0 tokens al
> correr). El agente (Antigravity) solo se usa para **completar** los esqueletos
> y **triar hallazgos**, no para ejecutar cada día.

## Arranque rápido

```bash
# desde Dashboard_Premium/  (con .env.local apuntando a STAGING)
node simulacion/loop/diaLoop.mjs                 # DRY-RUN: no escribe, imprime el plan
SIM_REAL=1 node simulacion/loop/diaLoop.mjs      # escribe contra staging
SIM_DIAS=120 SIM_SEED=7 SIM_REAL=1 node simulacion/loop/diaLoop.mjs
node simulacion/limpieza/limpiar.mjs             # dry-run de limpieza
SIM_REAL=1 node simulacion/limpieza/limpiar.mjs  # borra el club de simulación
```

Variables: `SIM_REAL` (escribir), `SIM_DIAS`, `SIM_INICIO`, `SIM_SEED`,
`SIM_CHECKPOINT`, `SIM_STAGING_URL` (guardarraíl anti-producción),
`SIM_CARGA_ATLETAS` (modo estrés).

## Estructura

```
simulacion/
  core/        rng · reloj · supa · estado · reporte
  config/      fases.mjs        ← plan progresivo (volumen/prob por fase)
  generadores/ personas.mjs     ← atletas/coaches/padres ficticios
  acciones/    index.mjs        ← envuelve src/api/*Service.js (✅ 4 listas, 🚧 5 a completar)
  invariantes/ index.mjs        ← detección de bugs + reglas de negocio
  loop/        diaLoop.mjs       ← orquestador principal
  limpieza/    limpiar.mjs
  ui/          smoke_simulacion.cy.js  ← copiar a cypress/e2e/
  reportes/    *.jsonl + RESUMEN-*.md   (salida)
```

## Seguridad

- **Dry-run por defecto.** Nada se escribe sin `SIM_REAL=1` (igual que `SEED_REAL=1` en los scripts del repo).
- **Guardarraíl de staging:** si definís `SIM_STAGING_URL` y no coincide con `VITE_SUPABASE_URL`, aborta.
- **Aislado por prefijo:** solo crea/borra filas con prefijo `SIMLOOP-` / club `"SIM Loop Diario"`. No toca DEMO/QA ni datos reales.

Detalle completo y backlog para el agente: **`SPEC_SIMULACION_ANTIGRAVITY.md`**.
