#!/usr/bin/env bash
# Shared environment for authority-demo scripts.
#
# Everything is local: the ledger is a JSON file on disk, the signed audit
# trail is .rigorix/audit, and the OPERATOR'S authority lives OUTSIDE this
# repository so agent-mediated writes cannot touch it.
#
# The authority home is resolved in this order:
#   1. an explicit $AUTHORITY_HOME (tests, or a presenter override) always wins;
#   2. otherwise, if setup-authority.sh --isolated recorded an install, use that
#      root-owned path;
#   3. otherwise the per-user default: $HOME/.rigorix-authority-demo.
set -euo pipefail
export LEDGER="${LEDGER:-ledger/payouts.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPT_DIR
export REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Records the isolated install location (gitignored runtime state).
export AUTHORITY_MARKER="$REPO_ROOT/.rigorix/.authority-home"
if [ -z "${AUTHORITY_HOME:-}" ] && [ -f "$AUTHORITY_MARKER" ]; then
  AUTHORITY_HOME="$(cat "$AUTHORITY_MARKER")"
fi
export AUTHORITY_HOME="${AUTHORITY_HOME:-$HOME/.rigorix-authority-demo}"

# Absolute node, resolved once and reused for the sudo escalation path.
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
export NODE_BIN

cd "$REPO_ROOT"

# True when the live authority file is writable by the current (agent) user.
authority_is_writable() {
  local file="$AUTHORITY_HOME/authority.json"
  [ -f "$file" ] && [ -w "$file" ]
}

# True when setup-authority.sh --isolated recorded an install.
authority_is_isolated() {
  [ -f "$AUTHORITY_MARKER" ]
}

# The JSON mutation applied by freeze/thaw. Kept in one place so the isolated
# (sudo) path writes byte-for-byte the same format as the default path.
_authority_set_prog='
const fs = require("fs");
const [p, who, status] = process.argv.slice(1);
const a = JSON.parse(fs.readFileSync(p, "utf8"));
a[who] = status;
fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log(`authority: ${who} -> ${status}`);
'

# Set a beneficiary's status in the live authority file, escalating through a
# documented, narrow `sudo node` invocation when the file is root-owned
# (isolated install). Fails with an actionable message when sudo is refused.
authority_apply() {
  local who="$1" status="$2"
  local file="$AUTHORITY_HOME/authority.json"

  if [ -w "$file" ]; then
    "$NODE_BIN" -e "$_authority_set_prog" "$file" "$who" "$status"
    return 0
  fi

  # Root-owned (isolated) install. Passwordless sudo would let the agent user
  # bypass the boundary entirely — say so loudly before using it.
  if sudo -n true 2>/dev/null; then
    echo "warning: passwordless sudo is available; the isolation claim does NOT hold" >&2
  fi
  if sudo -v 2>/dev/null && \
     sudo "$NODE_BIN" -e "$_authority_set_prog" "$file" "$who" "$status" 2>/dev/null; then
    return 0
  fi

  echo "error: authority '$file' is not writable by $(id -un) and sudo is not permitted." >&2
  echo "       An isolated install is root-owned on purpose. Re-run this operator" >&2
  echo "       action with sudo, or reinstall in default mode:" >&2
  echo "         bash .rigorix/scripts/setup-authority.sh            # default" >&2
  echo "         bash .rigorix/scripts/setup-authority.sh --isolated # root-owned" >&2
  return 1
}

# Force the authority file back to the committed 'active' state (reset-demo).
authority_reset() {
  local src="$REPO_ROOT/operator/authority.json"
  local file="$AUTHORITY_HOME/authority.json"
  if [ -w "$file" ]; then
    cp -f "$src" "$file"
    return 0
  fi
  if sudo -v 2>/dev/null && sudo cp -f "$src" "$file"; then
    return 0
  fi
  echo "error: cannot reset root-owned authority '$file' without sudo." >&2
  return 1
}
