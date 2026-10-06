#!/usr/bin/env bash
# EXECUTE one payout — this is the consequence.
#
# Deliberately tiny and boring: append one row to the local ledger. The
# interesting part is that it is only reachable through Rigorix. A raw tool
# call is denied by the PreToolUse hook, and the dispatch-time gate re-checks
# the operator's authority immediately before this line runs — so "the
# approval said yes" is not the same as "the payout may happen".
set -euo pipefail
source "$(dirname "$0")/_env.sh"
beneficiary="${1:?usage: execute_payout.sh <beneficiary> <amount>}"
amount="${2:?usage: execute_payout.sh <beneficiary> <amount>}"
bash "$SCRIPT_DIR/ensure_ledger.sh"
node src/payouts.ts execute "$LEDGER" "$beneficiary" "$amount"
