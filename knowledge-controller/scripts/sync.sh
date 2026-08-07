#!/bin/sh
set -eu
VAULT=/knowledge/vault
test -z "$(git -C "$VAULT" status --porcelain)" || {
  echo "Server vault has local changes" >&2
  exit 1
}
export GIT_SSH_COMMAND='ssh -i /run/secrets/deploy_key -o IdentitiesOnly=yes -o UserKnownHostsFile=/run/secrets/known_hosts'
git -C "$VAULT" fetch origin main
git -C "$VAULT" merge --ff-only origin/main
node "$VAULT/tools/validate-vault.mjs" "$VAULT"
/app/scripts/views.sh
