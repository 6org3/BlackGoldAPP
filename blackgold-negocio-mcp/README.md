# blackgold-negocio-mcp

Servidor MCP de **NEGOCIO** de Black Gold (leads, cobranza, KPIs de dirección, gastos). Hermano de `blackgold-mcp` (18 tools, 100% analítica deportiva) — este servidor llena el hueco de negocio que aquel no cubre.

Mismo patrón que `blackgold-mcp`: proceso Node por stdio (`@modelcontextprotocol/sdk`), conectado a Supabase con la `service_role` key (con RLS real desde la migración v24, la `anon` key no puede leer ni escribir ninguna tabla). Las 8 tools reutilizan las consultas y reglas de negocio ya existentes en `Dashboard_Premium/src/api/*Service.js` (sobre todo `pagosService.js`, `solicitudesService.js`, `retencionService.js`) en vez de inventar cálculos nuevos.

## Estado: v0.1

- 6 tools de LECTURA funcionan hoy contra el esquema real (leads, conversión, cobranza, comprobantes, vencidos, KPIs — con una salvedad de ocupación de cancha, ver abajo).
- 2 tools (`registrar_gasto`, `resumen_gastos`) **requieren una tabla `gastos` que todavía NO existe** en la base. La migración está escrita (ver más abajo) pero **NO aplicada**. Hasta que Jorge la aplique, esas dos tools fallan con un error legible explicándolo.

## Variables de entorno

Copiar `.env.example` a `.env` y rellenar:

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase de BlackGoldAPP (la misma base que usa `blackgold-mcp` y `Dashboard_Premium`). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Obligatoria.** Con RLS v24, la `anon` key no tiene acceso a ninguna tabla — este proceso corre local/servidor, nunca en un cliente web, y necesita la service_role key. |
| `SUPABASE_ANON_KEY` | Fallback opcional si falta la service_role key, pero con RLS v24 todas las tools fallarán igual. |

`.env` está en `.gitignore`. Nunca commitear credenciales reales.

## Las 8 tools

### Lectura (nunca escriben)

1. **`listar_leads_pipeline`** — Lista leads (`usuarios` con `rol='atleta'`), filtrable por `estado` (`pendiente`/`activo`/`rechazado`), `club` y rango de fechas de registro. Incluye el nombre del representante vinculado si el registro lo trajo. **No devuelve datos de contacto en bloque**: cédula, correo y teléfono (y el teléfono del representante) se resuelven solo para UN caso, pasando su `usuario_id` junto con `incluir_contacto: true`. Exige acotar el club (o pedir `todos_los_clubes: true` a sabiendas). Mismas reglas que `alertas_vencidos`, y por el mismo motivo: son datos personales de menores. Ver "Datos de contacto" abajo.
2. **`resumen_conversion_leads`** — Tasa de conversión (aprobados / total) y tiempo promedio de aprobación en un rango de fechas. El tiempo de aprobación es una **aproximación**: `usuarios` no tiene `updated_at`, así que se usa `atletas.fecha_alta` como proxy del momento en que se aprobó.
3. **`estado_cobranza`** — Totales de cobranza de un mes (recaudado / por cobrar / vencidos / becados), desglosado por grupo y por categoría FEB. Mismo criterio de agregación que `duenoData.js` (panel del dueño).
4. **`comprobantes_por_validar`** — Comprobantes de transferencia subidos por familias, pendientes de revisión por el staff.
5. **`alertas_vencidos`** — Pagos en estado `Vencido`, ordenados por antigüedad. **No devuelve teléfonos en bloque**: el contacto se resuelve solo para UN caso, pasando su `pago_id` junto con `incluir_contacto: true`. Exige acotar el club (o pedir `todos_los_clubes: true` a sabiendas) y excluye por defecto a las familias con `recordatorios_pausados`. Ver "Datos de contacto" abajo.
6. **`kpis_direccion`** — Ingresos del mes + atletas activos + retención (réplica en JS de `fn_retencion_club`, v31) + solicitudes pendientes. **No incluye ocupación de cancha** en v0.1 (ver "Limitación conocida" abajo).

### Escritura (una sola, con cuidado)

7. **`registrar_gasto`** — Registra un gasto de gestión. Valida: `monto` (número positivo), `categoria` (lista cerrada de 10 valores, debe coincidir con el `CHECK` de la migración), `descripcion` (obligatoria, no vacía). Devuelve el registro creado para que el agente lo confirme. **No permite editar ni borrar nada.**
8. **`resumen_gastos`** — Totales de gastos por categoría en un rango de fechas, comparados con la cobranza real recibida (`pago_transacciones`) en el mismo periodo.

## Datos de contacto: por qué `alertas_vencidos` no vuelca teléfonos

Revisión de seguridad del 2026-07-26. La primera versión de esta tool devolvía, en una sola llamada, hasta 300 filas con el nombre y el teléfono del representante de pagos de cada familia. Tres problemas, y sus tres reglas:

**1. Los teléfonos no salen en bloque.** Un agente que hace seguimiento necesita un contacto: el del caso que está atendiendo. Una lista con los teléfonos de todas las familias morosas no tiene uso legítimo para un agente, y pegada en un grupo de WhatsApp publica datos de contacto de padres de menores. Ahora el teléfono solo se resuelve si se pasan **las dos cosas**: un `pago_id` concreto y `incluir_contacto: true`. Si la consulta con `pago_id` no devuelve exactamente una fila, no se resuelve ningún contacto y la salida lo dice.

**2. `recordatorios_pausados` se respeta.** Es la bandera de "esta familia pidió que no la molesten". La app ya la honra: `ColaRecordatorios.jsx` excluye esas filas de la cola de envío y `AdminPagos.jsx` las marca. La versión anterior de la tool devolvía el campo pero no filtraba por él, así que un agente podía perfectamente escribirle a quien había pedido lo contrario. Ahora se excluyen por defecto y la salida avisa cuántas quedaron fuera; para verlas hay que pedir `incluir_pausados: true`.

**3. El club es explícito.** Este servidor usa la `service_role` key, así que **se salta entera** la RLS por club de la v24: aquí no hay barrera de aislamiento. Sin acotar, la tool devolvía los morosos de todos los clubes a la vez. Ahora es un error llamarla sin `club`, salvo que se pida `todos_los_clubes: true` a propósito (y en ese caso la salida lleva un aviso de no compartirla fuera de dirección).

Y la regla que no se puede codificar dentro de la tool: **este servidor MCP no gana nunca una tool de envío.** Consulta y registro de gastos, nada más. El envío de mensajes vive en el canal de WhatsApp de OpenClaw y, de momento, solo hacia el grupo de dirección — mensajería en frío desde el número del club es la vía rápida a que Meta lo banee. La app ya cubre el envío a familias con el flujo semiautomático de `plantillasWhatsApp.js`, donde el humano pulsa enviar.

## Limitación conocida: ocupación de cancha

`fn_ocupacion_cancha` (migración v32) y `fn_retencion_club` (v31) son `SECURITY DEFINER`, pero **gatean internamente** por `es_staff()`/`current_user_club()`, que a su vez leen `auth.uid()`. Este servidor corre con la `service_role` key, sin sesión de usuario real: `auth.uid()` es `NULL`, así que esas funciones devolverían **siempre vacío** si se llamaran por `supabase.rpc(...)`. No es un problema de RLS (que sí se bypasea con service_role) — es un chequeo manual dentro del cuerpo SQL de la función.

Por eso `kpis_direccion` **replica en JS** el cálculo de retención (consultando `atletas`/`usuarios` directo, mismo criterio que `fn_retencion_club`), pero **no** replica ocupación de cancha (la rejilla día×franja de `fn_ocupacion_cancha` es más compleja de reconstruir y quedó fuera de alcance de v0.1). `kpis_direccion` devuelve `ocupacion_cancha: null` con una nota explicándolo.

## La tabla `gastos` — migración pendiente, NO aplicada

La app (`Dashboard_Premium`) **no registra gastos hoy**: no existe ninguna tabla de contabilidad de gestión. Para que `registrar_gasto`/`resumen_gastos` funcionen, se escribió una migración nueva:

```
Dashboard_Premium/supabase/migrations/<timestamp>_v51_gastos_contabilidad_gestion.sql
```

Esta migración **está escrita pero NO fue aplicada** (este trabajo no tuvo acceso de red ni credenciales para correr `npx supabase db push`, y no debía tenerlo). Hasta que Jorge la aplique:

- `registrar_gasto` y `resumen_gastos` fallarán con un error en español que dice exactamente esto.
- Las otras 6 tools no se ven afectadas.

Para aplicarla: `cd Dashboard_Premium && npx supabase db push` (o el flujo de deploy que use el proyecto).

## Cómo probarlo con el inspector de MCP

```bash
cd blackgold-negocio-mcp
npm install          # requiere red; no se instaló en la construcción de este paquete
cp .env.example .env # rellenar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
npm run inspector     # abre @modelcontextprotocol/inspector contra este servidor
```

Verificación estática sin red ni credenciales (hecha durante la construcción):

```bash
node --check src/index.js
```

## Cómo registrarlo en OpenClaw

`blackgold-mcp` (el servidor deportivo) todavía **no está registrado en OpenClaw** (ver "Punto de Partida — Black Gold.md" §1: "ninguno de los dos está registrado todavía en OpenClaw — Lilith y Pythagoras hoy no tienen brazo técnico sobre Black Gold"). No se encontró un `openclaw.json` en este entorno (vive en el servidor casero de 16 GB, no en esta VM), así que no hay una entrada existente de `blackgold-mcp` de la cual copiar el formato exacto.

El patrón esperado (servidor MCP por stdio, igual que cualquier otro proceso Node registrado en un cliente MCP) es:

```json
{
  "mcpServers": {
    "blackgold-negocio-mcp": {
      "command": "node",
      "args": ["/ruta/absoluta/a/blackgold-negocio-mcp/src/index.js"],
      "env": {
        "SUPABASE_URL": "...",
        "SUPABASE_SERVICE_ROLE_KEY": "..."
      }
    }
  }
}
```

Registrarlo para los agentes que lo necesitan según el organigrama (`Sistem OS — Organigrama de Agentes`): **Pythagoras** (finanzas: cobranza, vencidos, gastos), **Lilith** (ventas: pipeline de leads, conversión) y **Vegapunk** (dirección: `kpis_direccion` para el brief diario). Al hacerlo, seguir exactamente el mismo bloque que se use para registrar `blackgold-mcp` (pendiente también, Fase A del plan) para que ambos servidores queden consistentes.

## Estructura

```
blackgold-negocio-mcp/
├── package.json
├── src/
│   └── index.js
├── .env.example
├── .gitignore
└── README.md
```
