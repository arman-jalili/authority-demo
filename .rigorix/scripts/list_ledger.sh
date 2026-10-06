#!/usr/bin/env bash
# Sanctioned read-only view of the ledger.
set -euo pipefail
source "$(dirname "$0")/_env.sh"
[ -f "$LEDGER" ] || { echo "[]"; exit 0; }
cat "$LEDGER"
