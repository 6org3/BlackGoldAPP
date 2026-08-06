# CRM de relaciones Black Gold

Este CRM es comercial y está separado del dominio deportivo. No reutiliza
`usuarios`, atletas ni representantes como fuente de contactos, porque esos
registros pueden contener información de menores y credenciales de acceso.

## Estado de entrega

La migración [20260804060809_crm_relaciones_black_gold.sql](../Dashboard_Premium/supabase/migrations/20260804060809_crm_relaciones_black_gold.sql) está creada localmente, pero **no se ha aplicado** a Supabase ni se ha desplegado una Edge Function. No usar los tools CRM contra producción hasta que la migración pase la revisión y se aplique por el flujo habitual del proyecto.

## Modelo operativo

- `crm_contactos`: identidad comercial (`interno`, `lead`, `cliente` o `no_contactar`).
- `crm_contacto_canales`: teléfono de WhatsApp o ID técnico Web/App. Es una tabla privada; ningún tool MCP la consulta ni la devuelve.
- `crm_oportunidades`: pipeline independiente del contacto, con etapas controladas.
- `crm_interacciones`, `crm_actividades`, `crm_preferencias` y `crm_consentimientos`: trazabilidad, seguimiento y personalización sin guardar transcripciones.
- `crm_auditoria`: eventos de cada cambio relevante.

La vinculación con la aplicación es opcional mediante `app_usuario_id`. Solo conserva un UUID tras validación de un adaptador confiable; no busca ni copia teléfono, correo, cédula, atleta o representante.

## Rutas de Lily

Un adaptador privado de WhatsApp, Web o App llama a `crm_recibir_contacto_canal`. Recibe un identificador normalizado para hacer el match, pero responde solo con UUIDs y una ruta:

| Ruta | Comportamiento |
| --- | --- |
| `interno` | Derivar a la operación/dirección; no abrir oportunidad comercial. |
| `lead` | Lily atiende con el flujo inicial breve, crea o reutiliza oportunidad. |
| `cliente` | Lily atiende con contexto y preferencias ya registradas. |
| `no_contactar` | No hacer seguimiento ni respuesta automática. |

Para un lead nuevo, el mensaje inicial definido es: “Hola, soy Lily de Black Gold. ¿Con quién tengo el gusto y qué te gustaría conocer: clases, horarios, inscripción o una prueba?”

El adaptador es responsable de validar la procedencia: firma del proveedor de WhatsApp, JWT/sesión de App o ID aleatorio estable de Web Chat. No debe enviar transcript ni adjuntos a la base: solo el interés clasificado y una referencia externa segura para idempotencia.

Para WhatsApp Cloud API ya existe el adaptador local [crm-whatsapp-webhook](../Dashboard_Premium/supabase/functions/crm-whatsapp-webhook/README.md). Verifica el handshake de Meta y la firma HMAC del cuerpo crudo, registra el `contact_id` y reenvía el contenido solo en tránsito a una pasarela privada de Lily. No se ha desplegado: requiere los secretos de Meta y la URL privada de esa pasarela.

## Contactos internos iniciales

Los tres contactos organizacionales se cargan **fuera del repositorio** y nunca como teléfonos en Git, variables visibles o llamadas MCP.

1. El adaptador seguro registra/matchea el canal y obtiene `contact_id`.
2. Una consola o Edge Function con `service_role` llama a `crm_configurar_contacto_interno(contact_id, 'direccion')`.
3. Desde entonces, la entrada se enruta como `interno`.

La función no acepta un número de teléfono y no está disponible para el MCP, de modo que un agente no puede convertir arbitrariamente un lead en contacto interno.

## Tools MCP v0.2

Todos trabajan exclusivamente con `contact_id` u `oportunidad_id` UUID:

- `blackgold_crm_obtener_contexto_contacto`
- `blackgold_crm_actualizar_etapa`
- `blackgold_crm_registrar_interaccion`
- `blackgold_crm_actualizar_preferencias`
- `blackgold_crm_programar_actividad`
- `blackgold_crm_marcar_no_contactar`
- `blackgold_crm_resumen_comercial`

No existe un tool para enviar WhatsApp, buscar por número, listar teléfonos ni reactivar `no_contactar`. La reactivación requiere una decisión humana documentada.

## Alcance de cada proceso MCP

`CRM_ALLOWED_CLUBS` es obligatorio para habilitar las tools CRM. Se configura
como lista CSV de nombres de club exactos, por ejemplo:

```text
CRM_ALLOWED_CLUBS=Black Gold,Club Norte
```

No admite `*` ni una lista vacía. Con la variable ausente, las tools CRM
fallan cerradas y las tools heredadas del MCP siguen sin ganar acceso
adicional. Antes de cada operación, el servidor valida el club del `contact_id`
u `oportunidad_id`; para una oportunidad valida además que coincida con el club
de su contacto. Un UUID inexistente y uno ajeno producen la misma respuesta,
para no revelar registros de otro club.

Configure también `CRM_ACTOR_ID` en cada proceso MCP registrado: `lily` para
Lily, `vegapunk` para dirección. Si no se define, se audita como
`operador_mcp`; no es recomendable en producción porque pierde atribución fina.
El actor audita la acción, pero no concede permisos ni sustituye el aislamiento
de `CRM_ALLOWED_CLUBS`.

## Antes del piloto

1. Revisar SQL y aplicar la migración en el entorno correspondiente, sin mezclarla con despliegues masivos de funciones.
2. Crear una Edge Function/adaptador de canal con validación de firma y límites de frecuencia. No exponer `service_role` al navegador.
3. Provisionar los contactos internos mediante el procedimiento anterior.
4. Probar las cuatro rutas con identificadores de prueba y verificar que los tools MCP nunca devuelvan `identificador_normalizado`.
5. Revisar RLS y el asesor de seguridad de Supabase después de aplicar.
