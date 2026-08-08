---
name: cross-vault-export
description: Proponer exportaciones sanitizadas del vault personal al empresarial.
---

# cross-vault-export

## Propósito

Proponer exportaciones sanitizadas del vault personal al empresarial.

## Agentes autorizados

shaka

## Clasificación máxima

interno

## Reglas obligatorias

- Ejecutar export-from-personal.mjs, revisar bloqueos y crear PR; nunca commit automático a main.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.