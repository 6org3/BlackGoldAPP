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
  # The target is a shared host directory owned by blackgold-lily.  Do not
  # preserve timestamps or ownership there, and keep the Lily group able to
  # replace the generated subtree on the next sync.
  rsync -rl --delete --chmod=Du=rwx,Dg=rwx,Do=,Fu=rw,Fg=r,Fo= "$OUTPUT/lily/" /knowledge/lily-public/
fi
printf '%s\n' "Role views built: $STAMP"
