---
name: crm-conversacion
description: Registrar resumen operativo, preferencia y siguiente paso de la conversación actual.
---

# crm-conversacion

## Propósito

Registrar resumen operativo, preferencia y siguiente paso de la conversación actual.

## Agentes autorizados

lilith

## Clasificación máxima

restringido

## Reglas obligatorias

- No guardar transcript completo. No registrar datos sensibles de menores; usar al representante adulto.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.