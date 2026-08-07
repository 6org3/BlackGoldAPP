#!/bin/sh
set -eu
VAULT=/knowledge/vault
VIEWS=/knowledge/role-views
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUTPUT="$VIEWS/$STAMP"
mkdir -p "$OUTPUT"
node "$VAULT/tools/build-role-views.mjs" "$VAULT" "$OUTPUT"
ln -sfn "$OUTPUT" "$VIEWS/current"
if [ -d "$OUTPUT/lily" ] && [ -d /knowledge/lily-public ]; then
  # No preservar dueño/grupo del origen: la vista pública pertenece a la
  # pareja blackgold-lily:blackgold-public del host.
  rsync -rlt --delete --chmod=Du=rwx,Dg=rx,Do=,Fu=rw,Fg=r,Fo= "$OUTPUT/lily/" /knowledge/lily-public/
fi
printf '%s\n' "Role views built: $STAMP"
