#!/usr/bin/env bash
# OPERATOR ACTION — freeze a beneficiary.
#
# This is the ΔN of the demo: the world changes between the human approval
# (T0) and the consequence (Tn). It writes the authority file that lives
# OUTSIDE the repo.
set -euo pipefail
source "$(dirname "$0")/_env.sh"
who="${1:?usage: freeze_beneficiary.sh <beneficiary>}"
node -e '
const fs = require("fs");
const [p, who] = process.argv.slice(1);
const a = JSON.parse(fs.readFileSync(p, "utf8"));
a[who] = "frozen";
fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log(`authority: ${who} -> frozen`);
' "$AUTHORITY_HOME/authority.json" "$who"
