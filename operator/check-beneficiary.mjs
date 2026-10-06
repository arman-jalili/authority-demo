#!/usr/bin/env node
/**
 * authority-demo — the OPERATOR-OWNED authority check.
 *
 * This tiny program is the whole "authority" of the demo. It answers exactly
 * one question: *is this beneficiary authorized to be paid right now?* It is
 * NOT an agent artifact and it does NOT live in the repository — setup
 * installs it at $HOME/.rigorix-authority-demo/, and the gate config points
 * at that absolute path. An agent with full write access to the repo still
 * cannot forge the answer, because the answer is read from outside the repo.
 *
 * Contract with Rigorix (ADR-017 dispatch-time precondition):
 *   stdin   : JSON { parameters: { command, ... }, ... } (+ RIGORIX_* env)
 *   stdout  : free-form (captured only when capture_output = true)
 *   stderr  : a human-readable summary (lands in the operator's terminal)
 *   exit 0  : AUTHORIZED -> the gate lets the step dispatch
 *   non-zero: REFUSED    -> the gate records a failed precondition and the
 *                          step is never executed; dependents are released
 *                          as failed (release_dependents_on_failure)
 */
import { readFileSync } from "node:fs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No stdin: nothing to authorize. Fail closed.
  console.error("authority check: no input on stdin — refusing (fail closed)");
  process.exit(4);
}

const command = String(input.parameters?.command ?? "");
const match = command.match(/execute_payout\.sh\s+(\S+)/);
const beneficiary = match?.[1] ?? "unknown";

let authority;
try {
  // Resolved relative to THIS script — i.e. outside the repository.
  authority = JSON.parse(readFileSync(new URL("./authority.json", import.meta.url), "utf8"));
} catch {
  console.error("authority check: no readable authority.json — refusing (fail closed)");
  process.exit(4);
}

const status = authority[beneficiary] ?? "unknown";
console.error(`authority check: ${beneficiary} is ${status}`);

// 0 = authorized. 3 = frozen/unknown. 4 = the check itself is broken.
process.exit(status === "active" ? 0 : 3);
