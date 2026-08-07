# Contrato operativo: misiones, ejercicios y notificaciones

## Misiones autónomas

Una misión es una tarea que el atleta realiza por su cuenta fuera de la cancha
y del gimnasio: en casa, durante el tiempo libre o en un fin de semana. Puede
ser movilidad, recuperación, lectura, vídeo, reflexión táctica o un hábito
físico seguro para su edad. `misiones.pilar` es su clasificación; no existe un
campo `tipo` porque mezclaba categorías distintas.

Una misión activa siempre usa el contexto `casa`. Los registros históricos de
cancha o mixtos se conservan inactivos hasta que el staff los reescriba como
una tarea autónoma real. El catálogo impide dos misiones activas con el mismo
título normalizado, pilar y segmento. Edison o Shaka revisan la similitud
conceptual antes de activar una propuesta; la base de datos no simula esa
decisión con una coincidencia textual imperfecta.

## Ejercicios y sesiones

Un ejercicio es una unidad técnica, física o táctica del catálogo. Se usa al
planificar o ejecutar una sesión de cancha o gimnasio y puede tener material,
duración, progresión y observaciones del coach. No se transforma en una misión
solo por reutilizar un mismo pilar deportivo.

## Notificaciones a representantes

El registro de asistencia por grupo y fecha es la autorización humana del
evento. Cada estado genera la intención correspondiente por representante:

| Estado | Intención de mensaje |
| --- | --- |
| Presente | Confirmación breve de asistencia. |
| Ausente | Aviso respetuoso y opción de justificar. |
| Justificada | Confirmación de que la justificación quedó registrada. |
| Lesionado | Aviso sensible, sin diagnóstico; invita a coordinar con el club. |

El CRM crea una entrada por representante. Solo queda lista para despacho si
existen vínculo App↔WhatsApp, canal verificado y consentimiento operativo. El
workflow de n8n aplica la plantilla Meta aprobada, despacha mediante la outbox
y guarda `enviada` o `fallida`. El mismo patrón se aplica a partidos, avisos y
pagos, con su plantilla y reglas de audiencia respectivas. Lily no inventa ni
envía estos avisos por fuera del CRM.
