#!/usr/bin/env bash
# Verify the isolated boundary as the AGENT user.
#
# Run this as the same user the agent runs as, after
# `setup-authority.sh --isolated`. It asserts that the check and the authority
# are root-owned and NOT writable by this UID (an attempted append is refused),
# and that the containing directory cannot be used to replace them.
#
# Exit 0 = isolation verified; non-zero = the boundary does not hold.
set -euo pipefail
source "$(dirname "$0")/_env.sh"

check="$AUTHORITY_HOME/check-beneficiary.mjs"
auth="$AUTHORITY_HOME/authority.json"
fail=0

if ! authority_is_isolated; then
  echo "note: no isolated install recorded (.rigorix/.authority-home absent)."
  echo "      run: bash .rigorix/scripts/setup-authority.sh --isolated"
  exit 3
fi

echo "authority home: $AUTHORITY_HOME (uid $(id -u) = $(id -un))"

for f in "$check" "$auth"; do
  if [ ! -e "$f" ]; then
    echo "FAIL: missing $f"
    fail=1
    continue
  fi
  if [ -w "$f" ]; then
    echo "FAIL: $f is writable by $(id -un)"
    fail=1
  else
    echo "ok:   $f is not writable"
  fi
  # A real append must be refused (EACCES); if it succeeds the boundary failed.
  if ( printf '' >> "$f" ) 2>/dev/null; then
    echo "FAIL: appended to $f (expected EACCES)"
    fail=1
  fi
done

# The directory must not be writable either, or the agent could replace the
# files wholesale.
if [ -w "$AUTHORITY_HOME" ]; then
  echo "FAIL: directory $AUTHORITY_HOME is writable by $(id -un)"
  fail=1
else
  echo "ok:   directory $AUTHORITY_HOME is not writable"
fi

if [ "$fail" -eq 0 ]; then
  echo "isolation verified: $(id -un) cannot write the check or the authority"
else
  echo "isolation NOT verified" >&2
  exit 1
fi
