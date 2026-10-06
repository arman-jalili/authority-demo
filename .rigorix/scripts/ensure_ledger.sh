#!/usr/bin/env bash
# Create the local ledger if it is absent (idempotent).
set -euo pipefail
source "$(dirname "$0")/_env.sh"
mkdir -p "$(dirname "$LEDGER")"
[ -f "$LEDGER" ] || echo '[]' > "$LEDGER"
