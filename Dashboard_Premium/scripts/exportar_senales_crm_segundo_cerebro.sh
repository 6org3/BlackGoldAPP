#!/usr/bin/env bash
# Exporta sólo señales comerciales agregadas desde el CRM privado hacia el
# segundo cerebro que consume Content-OS. No lee ni escribe transcripciones,
# teléfonos, correos, nombres, UUIDs de contactos ni datos de menores.

set -euo pipefail

if [[ "${1:-}" == "--help" || "$#" -ne 2 ]]; then
  echo "Uso: $0 <archivo_credenciales_0600> <clon_limpio_segundo_cerebro>" >&2
  exit 64
fi

CREDENTIALS_FILE="$1"
VAULT_DIR="$2"
TARGET_RELATIVE="01 Proyectos/Black Gold/Content-OS/00 - Sistema/Señales CRM agregadas.md"

if [[ ! -f "$CREDENTIALS_FILE" ]] || [[ "$(stat -c '%a' "$CREDENTIALS_FILE")" != "600" ]]; then
  echo "El archivo de credenciales debe existir y tener permisos 0600." >&2
  exit 65
fi
if [[ ! -d "$VAULT_DIR/.git" ]]; then
  echo "El destino debe ser un clon Git limpio del segundo cerebro." >&2
  exit 66
fi

leer_env() {
  local clave="$1"
  local valor
  valor="$(awk -F= -v clave="$clave" '$1 == clave { sub(/^[^=]*=/, ""); print; exit }' "$CREDENTIALS_FILE")"
  valor="${valor%\"}"
  valor="${valor#\"}"
  valor="${valor%\'}"
  valor="${valor#\'}"
  printf '%s' "$valor"
}

SUPABASE_URL="$(leer_env SUPABASE_URL)"
SUPABASE_SERVICE_ROLE_KEY="$(leer_env SUPABASE_SERVICE_ROLE_KEY)"
if [[ ! "$SUPABASE_URL" =~ ^https?:// ]] || [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "Faltan credenciales CRM válidas." >&2
  exit 67
fi

git -C "$VAULT_DIR" pull --ff-only origin main >/dev/null

OPORTUNIDADES="$(curl --fail --silent --show-error --get \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  --data-urlencode 'club=eq.Black Gold' \
  --data-urlencode 'select=etapa_codigo,interes_principal,origen,created_at,cerrada_at' \
  "$SUPABASE_URL/rest/v1/crm_oportunidades")"

jq -e 'type == "array"' >/dev/null <<<"$OPORTUNIDADES"

CORTE_7D="$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)"
ACTUALIZADO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FIRMA_DATOS="$(jq -cS 'sort_by(.created_at, .etapa_codigo, .interes_principal, .origen)' <<<"$OPORTUNIDADES" | sha256sum | awk '{print $1}')"

por_campo() {
  local campo="$1"
  jq -r --arg campo "$campo" '
    group_by(.[$campo] // "sin_definir")
    | sort_by(-length, .[0][$campo])
    | .[]
    | "- \(.[0][$campo] // "sin definir"): \(length)"
  ' <<<"$OPORTUNIDADES"
}

TOTAL="$(jq 'length' <<<"$OPORTUNIDADES")"
NUEVAS_7D="$(jq --arg corte "$CORTE_7D" '[.[] | select(.created_at >= $corte)] | length' <<<"$OPORTUNIDADES")"
ETAPAS="$(por_campo etapa_codigo)"
INTERESES="$(por_campo interes_principal)"
ORIGENES="$(por_campo origen)"

TARGET_PATH="$VAULT_DIR/$TARGET_RELATIVE"
if [[ -f "$TARGET_PATH" ]] && [[ "$(sed -n 's/^firma_datos: //p' "$TARGET_PATH" | head -n 1)" == "$FIRMA_DATOS" ]]; then
  echo "Sin cambios en señales CRM agregadas."
  exit 0
fi

mkdir -p "$(dirname "$TARGET_PATH")"
TEMPORAL="$(mktemp "${TARGET_PATH}.tmp.XXXXXX")"
trap 'rm -f "$TEMPORAL"' EXIT

cat >"$TEMPORAL" <<EOF
---
tags: [Ocupacional, Tecnología/Producto, Expresivo]
tipo_fuente: Propio
estado: procesado
actualizado_utc: $ACTUALIZADO
firma_datos: $FIRMA_DATOS
clasificacion_datos: agregados_sin_pii
---

# Señales CRM agregadas para contenido

Este reporte se genera automáticamente desde el CRM privado de Black Gold. Sirve para orientar contenido y marketing, no para contactar personas ni reconstruir conversaciones.

## Panorama

- Oportunidades históricas registradas: $TOTAL.
- Oportunidades nuevas en los últimos 7 días: $NUEVAS_7D.
- Corte de ventanas: $CORTE_7D.

## Embudo por etapa

${ETAPAS:-- Sin oportunidades todavía.}

## Intereses declarados o inferidos

${INTERESES:-- Sin intereses suficientes todavía.}

## Origen de la oportunidad

${ORIGENES:-- Sin orígenes suficientes todavía.}

## Uso permitido

- Priorizar dudas e intereses repetidos para ideas, guiones y FAQs.
- Mantener el contenido general: no incluir nombres, citas, horarios individuales ni referencias a familias concretas.
- La elegibilidad del descuento familiar del 15% se confirma por una persona responsable; nunca se infiere ni aplica desde este reporte.

## Conexiones

- [[Estrategia de contenido IA]]
- [[Lily]]
- [[CRM Black Gold]]
EOF

mv "$TEMPORAL" "$TARGET_PATH"
trap - EXIT

if [[ -z "$(git -C "$VAULT_DIR" status --porcelain -- "$TARGET_RELATIVE")" ]]; then
  echo "Sin cambios en señales CRM agregadas."
  exit 0
fi

git -C "$VAULT_DIR" add -- "$TARGET_RELATIVE"
git -C "$VAULT_DIR" commit -m "chore(crm): actualizar señales agregadas para contenido" >/dev/null
git -C "$VAULT_DIR" push origin main >/dev/null
echo "Señales CRM agregadas actualizadas y sincronizadas."
