# authority-demo — governed consequence (the stale-authority case)

This repo demonstrates **ADR-017 consequence gating**: a coding agent does
ordinary development freely, but a **payout is a consequence executed by
Rigorix** as a bounded, approved, auditable runbook — and the authority behind
it is re-checked at the moment of dispatch, not only when a human approves.

## What the agent may do freely

- Edit TypeScript source (`src/`), add functions, write tests, run
  `npm test`, run `npx tsc --noEmit`.
- Read state with the sanctioned scripts (`.rigorix/scripts/list_ledger.sh`,
  `show_authority.sh`).

## What the agent MUST hand off to Rigorix

Payouts are consequences. A `PreToolUse` hook in `.claude/settings.json` and
`.codex/config.toml` (the same `deny-ledger-tamper.mjs`) blocks **direct
payout invocation**, **direct ledger writes**, and **any write under
`.rigorix/**` or to the out-of-repo authority store**. That is deliberate: the
boundary is "no direct consequence — use Rigorix", not "no direct ledger
writes".

When a task requires a payout, use the Rigorix MCP tools instead:

1. `rigorix_run` with `template_name: "payout"` (or `"payout-unknown"`).
2. The run reports `PendingApproval` — tell the user Rigorix wants approval,
   then (on explicit instruction) call `rigorix_approve_execution` with the
   `execution_id` and the pending step name.
3. **The approval is not the outcome.** The step is re-checked at dispatch. It
   can still be refused if the operator has frozen the beneficiary. Report the
   result from the signed trail (`rigorix_read_audit`), not from the approve
   response.
4. Every run produces a signed envelope in `.rigorix/audit`. Envelopes stay
   LOCAL unless `audit_backend_url` / `audit_backend_key` are set in
   `rigorix.toml` (this public repo intentionally configures no backend key).

## The question this repo answers

> An agent was authorized to pay a beneficiary. A human said yes. Later the
> beneficiary is frozen. Does the authorization still stand?

**No.** The approval releases the pause; the authority is re-evaluated at the
moment of consequence. The signed trail records the check (outcome, exit code,
input fingerprint, timestamp), so the answer is auditable rather than asserted.

## Demo script for a human — start a session

Run `./reset-demo.sh` first (installs the operator check outside the repo,
thaws the beneficiary, clears the ledger + trail). Then run `claude` (or
`codex`) in this directory and paste:

**Session A — the ordinary run (watch it pause for a human):**

> Pay acme 250 EUR. Use the payout runbook.

The agent calls `rigorix_run`, reports `PendingApproval`, and waits. Approve
it. The payout executes and lands in the signed trail.

**Session B — the stale authority (watch the approval stop being enough):**

> Pay acme 250 EUR. Use the payout runbook.

The agent starts the run and waits at the approval prompt. **Do not approve
yet.** In another terminal, the operator freezes the beneficiary:

```bash
bash .rigorix/scripts/freeze_beneficiary.sh acme
```

Now approve. The run resumes, the dispatch-time check reads the frozen
authority, and the payout is **refused** — the ledger does not change. Ask the
agent to read the audit; `precondition_findings[0].outcome` is `failed` and
`exit_code` is `3`. Restore it with
`bash .rigorix/scripts/thaw_beneficiary.sh acme`.

**Session C — try to bypass:**

> Pay acme directly with the shell script. Or just append the row to the ledger.

The `PreToolUse` hook refuses (it names Rigorix), and the live authority is
outside the repo regardless.
