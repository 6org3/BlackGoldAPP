---
name: vikunja
description: Gestiona el tablero kanban compartido del Sistem OS (crear, mover, comentar tareas) vía la API REST de Vikunja con curl.
---

# Vikunja — tablero kanban compartido del Sistem OS

## Cuándo usarla
Úsala cuando necesites **crear una tarjeta**, **mover una tarea de columna/estado**, **actualizarla**, **marcarla como hecha** o **comentar** en el tablero compartido de la empresa. Es el sistema nervioso operativo: si algo hay que hacer, va como tarjeta aquí.

## Configuración
Las credenciales viven en `~/.openclaw/vikunja.env`:
```
VIKUNJA_URL=http://localhost:3456
VIKUNJA_TOKEN=tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
Carga las variables antes de cualquier comando:
```bash
set -a; . ~/.openclaw/vikunja.env; set +a
```

Todas las llamadas usan estos tres headers (Vikunja los exige):
```bash
-H "Authorization: Bearer $VIKUNJA_TOKEN" \
-H "Content-Type: application/json" \
-H "Accept: application/json"
```

## Convención de tarjetas del Sistem OS
- Título: `[área] descripción corta` — ej. `[dirección] Revisar pipeline agregado Black Gold`.
- Un **label por agente** que la trabaja: `vegapunk`, `shaka`, `edison`, `atlas`, `lilith`, `pythagoras`.
- Área entre corchetes: `[dirección] [contenido] [render] [ventas] [finanzas] [research]`.

## Comandos exactos (copy-paste)

### Listar proyectos (tableros) y sus IDs
```bash
set -a; . ~/.openclaw/vikunja.env; set +a
curl -s "$VIKUNJA_URL/api/v1/projects" \
  -H "Authorization: Bearer $VIKUNJA_TOKEN" \
  -H "Accept: application/json" | python3 -m json.tool
```

### Crear una tarea (OJO: Vikunja usa PUT para crear tarea en un proyecto)
```bash
set -a; . ~/.openclaw/vikunja.env; set +a
PROYECTO_ID=1
curl -s -X PUT "$VIKUNJA_URL/api/v1/projects/$PROYECTO_ID/tasks" \
  -H "Authorization: Bearer $VIKUNJA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"title":"[dirección] Revisar pipeline agregado Black Gold","description":"Validar bloqueos comerciales sin PII"}'
```

### Actualizar / mover / marcar como hecha (POST sobre la tarea)
`done:true` la marca terminada. Mover de columna kanban se hace cambiando `bucket_id`.
```bash
set -a; . ~/.openclaw/vikunja.env; set +a
TAREA_ID=42
curl -s -X POST "$VIKUNJA_URL/api/v1/tasks/$TAREA_ID" \
  -H "Authorization: Bearer $VIKUNJA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"done":true}'
# Mover de bucket (columna) kanban:  -d '{"bucket_id":3}'   # VERIFICAR bucket_id listando /api/v1/projects/<id>/views
```

### Comentar en una tarea (PUT)
```bash
set -a; . ~/.openclaw/vikunja.env; set +a
TAREA_ID=42
curl -s -X PUT "$VIKUNJA_URL/api/v1/tasks/$TAREA_ID/comments" \
  -H "Authorization: Bearer $VIKUNJA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"comment":"Ya contacté 3 de 5, faltan 2."}'
```

### Añadir un label a una tarea (PUT)
Primero lista labels para ver su ID: `curl -s "$VIKUNJA_URL/api/v1/labels" -H "Authorization: Bearer $VIKUNJA_TOKEN" -H "Accept: application/json"`.
```bash
TAREA_ID=42; LABEL_ID=5
curl -s -X PUT "$VIKUNJA_URL/api/v1/tasks/$TAREA_ID/labels" \
  -H "Authorization: Bearer $VIKUNJA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"label_id\":$LABEL_ID}"
```

> Los verbos (PUT para crear tarea/comentar, POST para actualizar) son los de la API v1 de Vikunja. Si algo devuelve error de método, consulta la doc viva de tu instancia en `$VIKUNJA_URL/api/v1/docs`.  # VERIFICAR endpoints exactos en tu versión

## Ejemplo de uso típico por rol
- **vegapunk (dirección):** crea las tarjetas maestras del día y las reparte con label por agente.
- **shaka (segundo cerebro):** revisa el tablero, comenta bloqueos y reordena prioridades.
- **Lily (ventas):** no crea tareas por lead; el CRM conserva cada contacto. Solo escala bloqueos agregados sin PII.
- **pythagoras (finanzas):** crea `[finanzas]` para facturas/pagos pendientes.

## Manejo de errores
- Si un curl devuelve `401`/`Invalid Token`: el token expiró o falta el header `Accept: application/json`. **No inventes un token.** Reporta a Jorge: "Token de Vikunja inválido, hay que regenerarlo en Settings > API Tokens".
- Si devuelve `404`: verifica el `PROYECTO_ID`/`TAREA_ID` listando primero.
- Si el servicio no responde: puede que el contenedor Docker esté caído. Reporta a Jorge, no reinicies nada por tu cuenta.
- Ante cualquier error que no entiendas, **repórtalo textual a Jorge**; no simules que la tarea se creó.

## Regla de curaduría
Crear/mover/comentar tarjetas internas es libre. Pero **nada que implique una acción hacia afuera** (enviar, publicar, pagar) se dispara solo por existir una tarjeta: eso requiere OK explícito de Jorge en el mensaje.
