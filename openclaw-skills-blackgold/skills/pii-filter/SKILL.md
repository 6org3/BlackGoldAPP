---
name: pii-filter
description: Detectar teléfonos, correos, secretos y datos de menores antes de publicar conocimiento.
---

# pii-filter

## Propósito

Detectar teléfonos, correos, secretos y datos de menores antes de publicar conocimiento.

## Agentes autorizados

shaka

## Clasificación máxima

interno

## Reglas obligatorias

- Un hallazgo bloquea la exportación. No registrar el valor detectado en logs o comentarios.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.