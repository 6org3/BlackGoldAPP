---
name: git-sync-safe
description: Sincronizar el vault mediante ramas, validación y pull requests.
---

# git-sync-safe

## Propósito

Sincronizar el vault mediante ramas, validación y pull requests.

## Agentes autorizados

shaka

## Clasificación máxima

interno

## Reglas obligatorias

- main es solo lectura para agentes. No usar force push ni resolver conflictos descartando cambios.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.