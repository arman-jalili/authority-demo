#!/usr/bin/env bash
# Clear runtime state: the ledger + the signed trail. Does NOT touch the
# authority file (reset-demo.sh restores that explicitly).
set -euo pipefail
source "$(dirname "$0")/_env.sh"
rm -f "$LEDGER"
mkdir -p "$REPO_ROOT/.rigorix/audit" "$REPO_ROOT/.rigorix/state"
find "$REPO_ROOT/.rigorix/audit" -maxdepth 1 -name '*.json' -delete 2>/dev/null || true
find "$REPO_ROOT/.rigorix/state" -maxdepth 1 -name '*.json' -delete 2>/dev/null || true
echo "cleared ledger + signed trail"
