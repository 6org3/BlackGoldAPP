---
name: conciliacion
description: Contrastar movimientos y estados sin modificar la fuente contable.
---

# conciliacion

## Propósito

Contrastar movimientos y estados sin modificar la fuente contable.

## Agentes autorizados

pythagoras

## Clasificación máxima

confidencial

## Reglas obligatorias

- Marcar diferencias; no autocorregir ni aprobar pagos.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.