// PreToolUse hook — the "stick" (shared by Claude Code and Codex).
//
// SCOPE (documented boundary — read this before relying on the hook):
//   This hook governs AGENT-MEDIATED tool calls: it blocks DIRECT CONSEQUENCE
//   and DIRECT AUTHORITY MUTATION —
//     * running the payout script itself (money moves through Rigorix, never
//       through a raw tool call);
//     * writing the ledger (shell redirect, tee, or a node/python script);
//     * editing anything under .rigorix/** (the gate config + runbook are
//       operator-owned);
//     * writing the authority file or the check that lives OUTSIDE this repo
//       (the operator's domain: $HOME/.rigorix-authority-demo).
//   Read-only inspection IS allowed via the sanctioned scripts
//   (.rigorix/scripts/list_ledger.sh, show_authority.sh) and
//   `cat ledger/payouts.json`.
//   It does NOT govern arbitrary code execution with real credentials outside
//   the agent session. The demo's guarantee: an agent cannot silently move
//   money or change the authority it is judged by from a tool call; if it
//   needs to pay, it must hand off to Rigorix (rigorix_run).
//
// stdin:  { tool_name, tool_input, ... }
// stdout: { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }
// exit code 2 = block the tool call.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const tool = input.tool_name ?? "";
const cmd = String(input.tool_input?.command ?? input.tool_input?.description ?? "");

if (tool !== "Bash") process.exit(0);

// Read-only sanctioned scripts / cat of the ledger are always allowed.
const READ_OK = [
  /\blist_ledger\.sh\b/,
  /\bshow_authority\.sh\b/,
  /\bcat\b[^;|&]*ledger\/payouts\.json/,
];

// Mutating surfaces: the payout script, the operator scripts, ledger writes,
// the .rigorix rulebook, and the out-of-repo authority store.
const MUTATION = [
  { re: /\bexecute_payout\.sh\b/, why: "direct payout invocation" },
  { re: /\bsetup-authority\.sh\b/, why: "installing/replacing the operator's authority check" },
  { re: /\bfreeze_beneficiary\.sh\b/, why: "operator-only authority mutation (freeze)" },
  { re: /\bthaw_beneficiary\.sh\b/, why: "operator-only authority mutation (thaw)" },
  { re: /\breset\.sh\b/, why: "direct ledger/trail reset" },
  { re: /(?:>|>>|\btee\b)[^;|&]*ledger\/payouts\.json/, why: "direct write to the ledger" },
  { re: /\b(?:rm|mv|truncate)\b[^;|&]*ledger\//, why: "direct ledger mutation" },
  { re: /\b(?:rm|mv|cp|tee|sed -i)\b[^;|&]*\.rigorix\//, why: "write into the .rigorix operator rulebook" },
  { re: /\b(?:rm|mv|cp|tee|sed -i)\b[^;|&]*\.rigorix-authority-demo/, why: "write into the operator's authority store" },
  { re: /(?:^|[;&|]\s*)(?:node|python3?|deno|bun)\b[^;|&]*(?:ledger\/|\.rigorix\/|\.rigorix-authority-demo)/, why: "script-mediated ledger/rulebook/authority write" },
];

if (READ_OK.some((re) => re.test(cmd))) process.exit(0);

const hit = MUTATION.find(({ re }) => re.test(cmd));
if (!hit) process.exit(0); // exploration, tests, edits pass through

const message =
  `Consequence and authority are governed by Rigorix (denied: ${hit.why}). ` +
  "Do not move money, edit the ledger, or change the authority directly. " +
  "Hand off to Rigorix: call rigorix_run with template_name 'payout', and read " +
  "the result from the signed trail.";
console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message,
    },
  }),
);
console.error(message);
process.exit(2);
