#!/usr/bin/env bash
# OPERATOR ACTION — freeze a beneficiary.
#
# This is the ΔN of the demo: the world changes between the human approval
# (T0) and the consequence (Tn). It writes the authority file that lives
# OUTSIDE the repo.
#
# Works in both install modes: a default (user-writable) authority is written
# directly; an isolated (root-owned) authority is written through a documented,
# narrow `sudo node` escalation, and fails with an actionable message when sudo
# is not permitted.
set -euo pipefail
source "$(dirname "$0")/_env.sh"
who="${1:?usage: freeze_beneficiary.sh <beneficiary>}"
authority_apply "$who" frozen
