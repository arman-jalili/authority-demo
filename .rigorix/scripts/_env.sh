#!/usr/bin/env bash
# Shared environment for authority-demo scripts.
#
# Everything is local: the ledger is a JSON file on disk, the signed audit
# trail is .rigorix/audit, and the OPERATOR'S authority lives OUTSIDE this
# repository ($HOME/.rigorix-authority-demo) so an agent with write access to
# the repo cannot forge the authority it is judged by.
set -euo pipefail
export LEDGER="${LEDGER:-ledger/payouts.json}"
export AUTHORITY_HOME="${AUTHORITY_HOME:-$HOME/.rigorix-authority-demo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPT_DIR
export REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
