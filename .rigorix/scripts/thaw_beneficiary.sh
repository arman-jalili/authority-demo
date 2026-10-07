#!/usr/bin/env bash
# OPERATOR ACTION — restore a beneficiary to 'active'.
#
# Works in both install modes: a default (user-writable) authority is written
# directly; an isolated (root-owned) authority is written through a documented,
# narrow `sudo node` escalation, and fails with an actionable message when sudo
# is not permitted.
set -euo pipefail
source "$(dirname "$0")/_env.sh"
who="${1:?usage: thaw_beneficiary.sh <beneficiary>}"
authority_apply "$who" active
