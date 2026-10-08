# Consequence gating — the authorization that expired in the gap

**The question.** An agent was authorized to pay a beneficiary. A human
reviewed the action and said yes. Some time later — after the approval, before
the money — the beneficiary is frozen. Does the authorization still stand?

Most governance has no way to answer that, because it treats approval as the
end of the story. A human said yes, so the action is authorized. The agent's
log says "approved". Nothing in the system knows that the world moved.

This repo is a runnable answer. It is small on purpose: a ledger, one runbook,
one check, and a signed trail.

## The shape of the gap

Every consequential action has two moments:

```
  plan time ──────────────── approval ──────────────── dispatch time
      │                          │                             │
  "the agent asks"          "a human says yes"          "the money moves"
```

Classical authorization collapses them into one. Approve once, and the action
is authorized from then on. But the two moments are separated in time, and the
world moves in the gap:

- a beneficiary is **frozen** by compliance;
- an account is **closed**;
- a limit is **lowered**;
- a vendor is **sanctioned**.

A standing "yes" is a statement about the world *at the time it was given*. By
dispatch time it may be a statement about a world that no longer exists.

## The move: check at the moment of consequence

The answer is not "approve more often". It is to separate the two questions and
ask the second one where it matters:

1. **Did a human authorize this action?** — the approval. Unchanged.
2. **Does the authority still hold, right now?** — the dispatch-time
   precondition.

Rigorix runs the second check immediately before the step would execute, *after*
the approval, using the current world. The approval releases the pause. It does
not pre-approve the world.

## What that looks like, scene by scene

**T₀ — the grant looks fine.** The agent runs the payout runbook. It declares
`requires_approval`, so the run pauses. The operator approves, the authority
check passes at dispatch, and the payout executes. One row in the ledger.

**ΔN — the world changes.** A second run pauses for approval. Before the
operator approves it, the beneficiary is frozen. Nothing about the approval
changes; it is still a valid "yes".

**Tₙ — the same approval, a different world.** The operator approves the paused
run. The run resumes. At dispatch, the check reads the *frozen* authority and
exits non-zero. The step is refused. **The ledger never changes.**

**The evidence.** The refusal is not a log line. It is a signed finding in the
execution envelope:

```json
{
  "precondition_id": "beneficiary-authorized",
  "outcome": "failed",
  "exit_code": 3,
  "inputs_hash": "sha256:0078c18a…",
  "checked_at": "2026-10-06T18:52:03.754834Z"
}
```

`inputs_hash` is a fingerprint of what the check saw, `checked_at` is when it
saw it, and the envelope is HMAC-signed. The refusal is reproducible from the
record: the check ran, at this time, against this input, and it failed.

## Why the check is operator-owned and out-of-repo

A dispatch-time check is only worth anything if the agent cannot rewrite it. So
the check and the authority it reads live **outside** the agent's repository:

```
$HOME/.rigorix-authority-demo/
    ├── check-beneficiary.mjs
    └── authority.json
```

The gate config points at that absolute path, outside the workspace. An agent's
*agent-mediated* tool calls cannot write the check or the authority, and a
`PreToolUse` hook denies direct payout, ledger, and authority edits on top of
that. But be precise: **this is a policy + path + hook boundary, not a sandbox.**
It does not stop an unmediated write to `$HOME` by another tool, a
differently-privileged subprocess, or a persisted script.

| Mode | Enforced by | Guarantee | Does **not** cover |
|---|---|---|---|
| **default (this demo)** | path containment + hook | agent-mediated calls cannot touch them | an unmediated write path to `$HOME` |
| **`--isolated`** (#985 — available) | OS ownership/mode | the agent's **UID cannot write** them | needs no passwordless `sudo` for the agent user |
| **`require_immutable_check`** (#986 — available) | engine, at dispatch | a writable check/authority is **refused** | a check writable by another privileged identity |
| **attribution** (#987 — available) | signed envelope | a forged authority is **visible** (`authority_digest`) | detection, not prevention |

The demo runs the **default** row. `inputs_hash` fingerprints what the check
*saw*; #987's `authority_digest` binds the authority *content*, so a changed
`authority.json` becomes visible in the signed record. And the record is candid
about its own strength: the default `$HOME` install records
`check_writable: true`, because it *is* writable by your UID — after
`setup-authority.sh --isolated` the same run records `check_writable: false`.
Source of truth: ADR-017 §Honest boundary.

If the default is not enough, the same demo can run with the OS boundary:
`setup-authority.sh --isolated` installs the check and authority root-owned
(`0555`/`0444`) outside the repo, so the agent's UID cannot write them at all.
It refuses to arm when the agent user has passwordless `sudo` — otherwise the
agent could simply `sudo` the write — and the operator's own freeze/thaw
commands escalate through a documented `sudo node` call. `verify-isolation.sh`
asserts the boundary as the agent user. The default stays the default; isolation
is an upgrade you opt into.

The check itself is deliberately tiny — read a status, exit 0 or 3 — so it can
be audited in a sitting. It is not a policy engine; it is *the operator's rule*,
expressed as an exit code.

That is also why the gate lives in the engine rather than in the payout script.
The check decides; the engine enforces and records. A refusal becomes a signed
finding with a stable shape, not whatever a script happened to print.

## Answering the question

**Does the authority still stand?** No — and you do not have to take anyone's
word for it. From the signed record you can see that:

- the human approval was recorded, and it was not withdrawn;
- the authority was re-checked **at dispatch** and failed (exit 3);
- the payout step never ran — the ledger is unchanged;
- the check, its outcome, its input fingerprint, and the time it ran are all in
  the envelope.

The approval is a fact about intent. The precondition is a fact about the world.
Recording both is what makes the gap answerable.

## Run it

```bash
./reset-demo.sh
node .rigorix/run-authority-demo.mjs
```

No Docker, no IdP, no API key. The driver plays the operator (it freezes the
beneficiary mid-scene) and the approver, and every assertion is checked against
the ledger and the signed envelope.
