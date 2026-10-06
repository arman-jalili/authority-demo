#!/usr/bin/env bash
# Reset authority-demo to its base state.
#
#   ./reset-demo.sh
#
# Idempotent; run before each demo so every run starts from the same place:
#   1. restores this demo's tracked files to the committed base
#   2. installs the operator check OUTSIDE the repo and thaws the beneficiary
#   3. clears the local ledger and the signed trail
#
# Revert scope (step 1): every tracked file except rigorix.toml (local-only
# config that may hold a presenter's audit_backend_key). Untracked files are
# never touched.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${RESET_ROOT:-$SCRIPT_DIR}"

echo "── 1/3 restoring tracked files to base"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git restore --source=HEAD --worktree -- . ':(exclude)rigorix.toml'
  echo "   restored tracked files to base; preserved: rigorix.toml"
else
  echo "   (not a git checkout — skipping)"
fi

echo "── 2/3 installing the operator authority check (outside the repo)"
bash .rigorix/scripts/setup-authority.sh
AUTHORITY_HOME="${AUTHORITY_HOME:-$HOME/.rigorix-authority-demo}"
cp -f operator/authority.json "$AUTHORITY_HOME/authority.json"
echo "   authority: acme -> active"

echo "── 3/3 clearing runtime state"
bash .rigorix/scripts/reset.sh

echo "✅ reset to base — authority active, ledger + signed trail clean"
