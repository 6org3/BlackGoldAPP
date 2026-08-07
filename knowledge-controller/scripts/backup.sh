#!/bin/sh
set -eu
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY missing}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE missing}"
restic backup /knowledge/vault /knowledge/role-views \
  --tag blackgold-knowledge \
  --exclude /knowledge/vault/.git/objects/pack/tmp_*
restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
