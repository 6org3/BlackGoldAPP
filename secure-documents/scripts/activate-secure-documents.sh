#!/usr/bin/env bash
set -euo pipefail

CALLER=${SUDO_USER:-gorg3yj1n1}
CALLER_HOME=$(getent passwd "$CALLER" | cut -d: -f6)
test -n "$CALLER_HOME"
KEY_FILE=${BLACKGOLD_RECOVERY_KEY_FILE:-"$CALLER_HOME/servicios/secure-documents/recovery-master-key.b64"}
SUPABASE_ENV=${BLACKGOLD_SUPABASE_ENV:-"$CALLER_HOME/servicios/blackgold-supabase/docker/.env"}
TARGET=/etc/blackgold/secure-documents.env
SERVICE=blackgold-secure-documents.service

test "$(id -u)" -eq 0 || { echo "Ejecutar con sudo." >&2; exit 1; }
test -f "$KEY_FILE"
test "$(stat -c '%a' "$KEY_FILE")" = 600
test "$(wc -c < "$KEY_FILE")" = 44
test -f "$SUPABASE_ENV"

MASTER_KEY=$(cat "$KEY_FILE")
SERVICE_ROLE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY=//p; s/^SUPABASE_SERVICE_ROLE_KEY=//p' "$SUPABASE_ENV" | head -n 1)
test -n "$SERVICE_ROLE_KEY"
test "$SERVICE_ROLE_KEY" != "replace-at-deploy-time"

VEGAPUNK_TOKEN=$(openssl rand -base64 36 | tr -d '\n')
LILY_TOKEN=$(openssl rand -base64 36 | tr -d '\n')
PYTHAGORAS_TOKEN=$(openssl rand -base64 36 | tr -d '\n')
TOKENS_JSON=$(VEGAPUNK_TOKEN="$VEGAPUNK_TOKEN" LILY_TOKEN="$LILY_TOKEN" PYTHAGORAS_TOKEN="$PYTHAGORAS_TOKEN" node -e '
process.stdout.write(JSON.stringify({vegapunk: process.env.VEGAPUNK_TOKEN, lilith: process.env.LILY_TOKEN, pythagoras: process.env.PYTHAGORAS_TOKEN}));
')

TEMP=$(mktemp /etc/blackgold/.secure-documents.env.XXXXXX)
trap 'rm -f "$TEMP"' EXIT
cat > "$TEMP" <<EOF
SECURE_RECORDS_HOST=127.0.0.1
SECURE_RECORDS_PORT=8096
SUPABASE_URL=http://127.0.0.1:8000
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
BLACKGOLD_SECURE_MASTER_KEY_B64=$MASTER_KEY
SECURE_RECORDS_TOKENS_JSON='$TOKENS_JSON'
EOF
chmod 0600 "$TEMP"
chown root:root "$TEMP"
mv "$TEMP" "$TARGET"
trap - EXIT

systemctl enable --now "$SERVICE"
systemctl is-active --quiet "$SERVICE"
curl --fail --silent --show-error --max-time 5 \
  -H "Authorization: Bearer $VEGAPUNK_TOKEN" http://127.0.0.1:8096/health >/dev/null
curl --fail --silent --show-error --max-time 5 \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  'http://127.0.0.1:8000/rest/v1/crm_secure_documents?select=id&limit=1' >/dev/null

shred -u "$KEY_FILE"
echo "Servicio cifrado activo; copia temporal de clave eliminada."
