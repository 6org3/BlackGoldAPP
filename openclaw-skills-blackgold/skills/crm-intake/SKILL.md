---
name: crm-intake
description: Crear o actualizar el contacto actual usando únicamente el context_id recibido.
---

# crm-intake

## Propósito

Crear o actualizar el contacto actual usando únicamente el context_id recibido.

## Agentes autorizados

lilith

## Clasificación máxima

restringido

## Reglas obligatorias

- Todo número no allowlisted es lead. No enumerar contactos ni guardar PII fuera del CRM.
- Usar el mínimo dato necesario y no revelar IDs internos al usuario externo.
- Ante un permiso ambiguo o una fuente no vigente, detener la operación y escalar a Vegapunk.
- Registrar solo metadatos operativos; nunca secretos, tokens o contenido sensible en logs.

## Resultado esperado

Responder o proponer el cambio con fuente, destino, clasificación y siguiente paso explícitos.