#!/usr/bin/env bash
set -euo pipefail

CALLER=${SUDO_USER:-gorg3yj1n1}
CALLER_HOME=$(getent passwd "$CALLER" | cut -d: -f6)
ENV_FILE=/etc/blackgold/secure-documents.env
KEY_FILE="$CALLER_HOME/servicios/secure-documents/recovery-master-key.b64"

test "$(id -u)" -eq 0 || { echo "Ejecutar con sudo." >&2; exit 1; }
test -f "$ENV_FILE"
systemctl is-active --quiet blackgold-secure-documents.service

SERVICE_ROLE_KEY=$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' "$ENV_FILE")
TOKENS_JSON=$(sed -n "s/^SECURE_RECORDS_TOKENS_JSON='\(.*\)'$/\1/p" "$ENV_FILE")
VEGAPUNK_TOKEN=$(TOKENS_JSON="$TOKENS_JSON" node -e '
const tokens = JSON.parse(process.env.TOKENS_JSON || "{}");
if (!tokens.vegapunk) process.exit(1);
process.stdout.write(tokens.vegapunk);
')
test -n "$SERVICE_ROLE_KEY"

curl --fail --silent --show-error --max-time 5 \
  -H "Authorization: Bearer $VEGAPUNK_TOKEN" http://127.0.0.1:8096/health >/dev/null
curl --fail --silent --show-error --max-time 5 \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  'http://127.0.0.1:8000/rest/v1/crm_secure_documents?select=id&limit=1' >/dev/null

if [ -e "$KEY_FILE" ]; then
  shred -u "$KEY_FILE"
fi
echo "Servicio cifrado verificado; copia temporal de clave eliminada."
