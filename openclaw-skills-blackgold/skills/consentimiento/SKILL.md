---
name: consentimiento
description: Registrar consentimiento y solicitudes de no contactar.
---

# consentimiento

## Propósito

Registrar consentimiento y solicitudes de no contactar.

## Agentes autorizados

lilith

## Clasificación máxima

restringido

## Reglas obligatorias

- No asumir consentimiento comercial. Una revocación bloquea seguimiento de inmediato.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.