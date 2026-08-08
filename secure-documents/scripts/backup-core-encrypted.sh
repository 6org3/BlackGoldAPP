#!/usr/bin/env bash
set -euo pipefail

KEY_FILE=${BLACKGOLD_RECOVERY_KEY_FILE:-"$HOME/servicios/secure-documents/recovery-master-key.b64"}
BACKUP_ROOT=${BLACKGOLD_BACKUP_ROOT:-"$HOME/backups/blackgold"}
VAULTWARDEN_DATA=${VAULTWARDEN_DATA:-"$HOME/servicios/vaultwarden/data"}
DATABASE_CONTAINER=${DATABASE_CONTAINER:-supabase-db}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

test -f "$KEY_FILE"
test "$(stat -c '%a' "$KEY_FILE")" = 600
test "$(wc -c < "$KEY_FILE")" = 44
test -d "$VAULTWARDEN_DATA"
docker inspect -f '{{.State.Running}}' "$DATABASE_CONTAINER" | grep -qx true

umask 077
install -d -m 0700 "$BACKUP_ROOT"
DB_FINAL="$BACKUP_ROOT/crm-${STAMP}.dump.enc"
VW_FINAL="$BACKUP_ROOT/vaultwarden-${STAMP}.tar.gz.enc"
DB_TEMP="$DB_FINAL.partial"
VW_TEMP="$VW_FINAL.partial"
trap 'rm -f "$DB_TEMP" "$VW_TEMP"' EXIT

docker exec "$DATABASE_CONTAINER" pg_dump -U postgres -Fc postgres \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt -pass "file:$KEY_FILE" -out "$DB_TEMP"
tar -C "$(dirname "$VAULTWARDEN_DATA")" -czf - "$(basename "$VAULTWARDEN_DATA")" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -salt -pass "file:$KEY_FILE" -out "$VW_TEMP"

mv "$DB_TEMP" "$DB_FINAL"
mv "$VW_TEMP" "$VW_FINAL"
chmod 0600 "$DB_FINAL" "$VW_FINAL"
{
  printf 'created_at=%s\n' "$STAMP"
  sha256sum "$DB_FINAL" "$VW_FINAL"
} > "$BACKUP_ROOT/manifest-${STAMP}.txt"
chmod 0600 "$BACKUP_ROOT/manifest-${STAMP}.txt"
trap - EXIT
printf 'Backups cifrados creados: %s %s\n' "$(basename "$DB_FINAL")" "$(basename "$VW_FINAL")"
