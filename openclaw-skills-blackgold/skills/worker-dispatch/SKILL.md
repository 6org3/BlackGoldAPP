---
name: worker-dispatch
description: Enviar renders pesados al worker autorizado de la PC RTX 4060.
---

# worker-dispatch

## Propósito

Enviar renders pesados al worker autorizado de la PC RTX 4060.

## Agentes autorizados

atlas

## Clasificación máxima

interno

## Reglas obligatorias

- No ejecutar en el servidor cargas de VRAM/RAM reservadas al worker. No transmitir PII en briefs.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.