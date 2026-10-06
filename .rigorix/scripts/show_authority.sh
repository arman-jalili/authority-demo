#!/usr/bin/env bash
# Sanctioned read-only view of the operator's authority file.
#
# The agent may look at the rule it is judged by; it must not change it. The
# live file is OUTSIDE the repo — this script is the read window onto it.
set -euo pipefail
source "$(dirname "$0")/_env.sh"
if [ -f "$AUTHORITY_HOME/authority.json" ]; then
  cat "$AUTHORITY_HOME/authority.json"
else
  echo '{"error":"not installed — run bash .rigorix/scripts/setup-authority.sh"}'
fi
