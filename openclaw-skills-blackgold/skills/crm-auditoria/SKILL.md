---
name: crm-auditoria
description: Supervisar métricas, actividad y trazabilidad del CRM sin extraer identificadores.
---

# crm-auditoria

## Propósito

Supervisar métricas, actividad y trazabilidad del CRM sin extraer identificadores.

## Agentes autorizados

vegapunk

## Clasificación máxima

restringido

## Reglas obligatorias

- Usar agregados por defecto. Un contacto individual exige contact_id, propósito y auditoría.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.