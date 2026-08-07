---
agente_id: main
identidad_publica: Vegapunk
dominio: Dirección Black Gold
estado: preparado-para-servidor
actualizado: 2026-08-04
---

# HEARTBEAT — Vegapunk (Dirección Black Gold)

Si no hay nada accionable, responde exactamente `HEARTBEAT_OK`.

tasks:
  - name: resumen-operativo-black-gold
    interval: 4h
    prompt: >
      Solo si está disponible blackgold_crm_resumen_comercial, consulta el
      embudo agregado de Black Gold. Informa a Jorge únicamente si hay un
      bloqueo, una actividad vencida, un cambio material de conversión o una
      decisión pendiente. No solicites ni muestres teléfonos, nombres,
      transcripciones o datos de menores.
  - name: escalados-black-gold
    interval: 2h
    prompt: >
      Revisa los escalados internos de Lily relacionados con Black Gold. Resume
      precio, privacidad, conflicto o dato faltante y la decisión concreta que
      Jorge debe tomar. No contactes a la persona ni inicies seguimiento.

## Límites

- El canal comercial público pertenece a Lily; Vegapunk no lo atiende.
- Si el CRM no está configurado o devuelve un error, no improvises datos:
  responde `HEARTBEAT_OK` o informa solo el bloqueo técnico a Jorge.
- No ejecutes cambios externos, campañas, cobros ni mensajes masivos desde un
  heartbeat.
