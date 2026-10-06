#!/usr/bin/env bash
# OPERATOR ACTION — restore a beneficiary to 'active'.
set -euo pipefail
source "$(dirname "$0")/_env.sh"
who="${1:?usage: thaw_beneficiary.sh <beneficiary>}"
node -e '
const fs = require("fs");
const [p, who] = process.argv.slice(1);
const a = JSON.parse(fs.readFileSync(p, "utf8"));
a[who] = "active";
fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log(`authority: ${who} -> active`);
' "$AUTHORITY_HOME/authority.json" "$who"
