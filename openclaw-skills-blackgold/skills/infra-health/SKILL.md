---
name: infra-health
description: Comprobar salud de servicios, backups y sincronización de Black Gold.
---

# infra-health

## Propósito

Comprobar salud de servicios, backups y sincronización de Black Gold.

## Agentes autorizados

vegapunk

## Clasificación máxima

interno

## Reglas obligatorias

- Solo lectura por defecto. Reinicios, despliegues y cambios de secretos requieren autorización operacional.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.