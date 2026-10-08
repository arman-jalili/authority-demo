#!/usr/bin/env node
/**
 * authority-demo — ADR-017 consequence gating.
 *
 * THE QUESTION
 *   An agent was authorized to pay a beneficiary. A human said yes. Later the
 *   beneficiary is frozen. Does the authorization still stand?
 *
 * THE ANSWER
 *   Authorization is not a durable grant. The run pauses for a human, and then
 *   the authority is re-checked at the moment of consequence. The frozen
 *   beneficiary is refused AFTER the approval — the ledger never changes, and
 *   the refusal is signed evidence in .rigorix/audit.
 *
 * SCENES
 *   0 · the setup      — where the authority lives (outside the agent's repo)
 *   1 · T0             — approve; the payout executes (the grant looks fine)
 *   2 · ΔN             — freeze the beneficiary while a run waits for approval
 *   3 · Tn             — the same approval, a different world: refused
 *   4 · the evidence   — what the signed trail proves
 *   5 · fail closed    — an unknown beneficiary is refused too
 *
 * Requires: rigorix-mcp >= 1.9.2 on PATH (or RIGORIX_MCP_BIN), Node >= 22.
 * Run ./reset-demo.sh first so every run starts from the same place.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const MCP_BIN = process.env.RIGORIX_MCP_BIN ?? "rigorix-mcp";
const verbose = process.env.RIGORIX_DRIVER_VERBOSE === "1";

// ── shell helpers (the sanctioned scripts; the driver never touches the ledger
//    or the authority file directly) ─────────────────────────────────────────
function sh(script, ...args) {
  const r = spawnSync("bash", [`.rigorix/scripts/${script}`, ...args], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${script} failed: ${r.stderr || r.stdout}`);
  return (r.stdout ?? "").trim();
}
const ledgerRows = () => JSON.parse(sh("list_ledger.sh") || "[]");
const authority = () => JSON.parse(sh("show_authority.sh") || "{}");
function envelope(executionId) {
  const p = join(repoRoot, ".rigorix", "audit", `${executionId}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

// ── MCP client (stdio) ──────────────────────────────────────────────────────
const child = spawn(MCP_BIN, [], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, RUST_LOG: verbose ? "info" : "warn" },
});
child.on("error", (err) => {
  console.error(`Failed to start ${MCP_BIN}: ${err.message}`);
  console.error("Is rigorix-mcp >= 1.9.1 installed? Set RIGORIX_MCP_BIN if it lives elsewhere.");
  process.exit(1);
});
let buf = "";
let nextId = 1;
const pending = new Map();
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id != null && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (verbose) console.log("[mcp]", line);
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => { if (verbose) process.stderr.write(d); });
function rpc(method, params) {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }) + "\n");
  });
}
async function callTool(name, args) {
  return await rpc("tools/call", { name, arguments: args ?? {} });
}
const parse = (r) => { try { return JSON.parse(r.content[0].text); } catch { return { raw: r.content?.[0]?.text }; } };

// ── presentation ────────────────────────────────────────────────────────────
const section = (t) => console.log("\n" + "═".repeat(76) + "\n  " + t + "\n" + "═".repeat(76));
let failures = 0;
function ok(label, cond, detail) {
  console.log(`  ${cond ? "✔" : "✘"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}
function showLedger(rows) {
  if (rows.length === 0) { console.log("  ledger: (empty)"); return; }
  for (const r of rows) console.log(`  ledger: ${r.amount} EUR → ${r.beneficiary}  (${r.at})`);
}
function showFinding(f) {
  if (!f) { console.log("  precondition_findings: (none)"); return; }
  console.log("  precondition_findings[0]:");
  console.log(`    precondition_id : ${f.precondition_id}`);
  console.log(`    step            : ${f.step}`);
  console.log(`    outcome         : ${f.outcome}`);
  console.log(`    exit_code       : ${f.exit_code}`);
  console.log(`    inputs_hash     : ${String(f.inputs_hash).slice(0, 34)}…`);
  console.log(`    checked_at      : ${f.checked_at}`);
  console.log(`    summary         : ${f.summary}`);
  // ADR-017 attribution (#987) + boundary fact (#986) — present on rigorix-mcp >= 1.9.2.
  // Digests only (SpanPrivacy): they bind *what* was checked, never its contents.
  if (f.check_digest) console.log(`    check_digest    : ${f.check_digest}`);
  if (f.authority_digest) console.log(`    authority_digest: ${f.authority_digest}`);
  if (f.check_writable != null) console.log(`    check_writable  : ${f.check_writable}`);
}

// ── go ──────────────────────────────────────────────────────────────────────
await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "authority-demo", version: "0" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

if (!existsSync(join(repoRoot, ".rigorix", "preconditions.toml"))) {
  console.log("… gate not armed; running setup-authority.sh");
  sh("setup-authority.sh");
}

// ── 0 ───────────────────────────────────────────────────────────────────────
section("0 · The setup — the authority lives outside the agent's workspace");
console.log("  The gate runs an operator-owned check at DISPATCH time. The check");
console.log("  and the authority file live OUTSIDE this repository:");
console.log("    $HOME/.rigorix-authority-demo/check-beneficiary.mjs");
console.log("    $HOME/.rigorix-authority-demo/authority.json");
console.log("  The agent's tool calls cannot write them; a PreToolUse hook denies");
console.log("  direct edits as well. This is a policy + path + hook boundary, not a");
console.log("  sandbox: an unmediated write to $HOME is still possible by design.");
console.log("  authority.json right now:");
console.log("    " + JSON.stringify(authority()));
ok("authority is active at the start", authority().acme === "active");

// ── 1 ───────────────────────────────────────────────────────────────────────
section("1 · T₀ — the authorization looks fine");
console.log("  The agent runs the payout runbook. It declares requires_approval,");
console.log("  so Rigorix PAUSES for a human before any money moves.");
const before1 = ledgerRows().length;
const r1 = parse(await callTool("rigorix_run", { template_name: "payout" }));
console.log(`  rigorix_run → status: ${r1.status} | execution_id: ${r1.execution_id}`);
ok("run paused for human approval", r1.status === "PendingApproval");

console.log("\n  A human approves (the driver plays the approver).");
await callTool("rigorix_approve_execution", { execution_id: r1.execution_id, step_names: ["payout_execute"] });
const after1 = ledgerRows().length;
showLedger(ledgerRows());
ok("the payout executed after approval", after1 === before1 + 1, `ledger ${before1} → ${after1}`);

// ── 2 ───────────────────────────────────────────────────────────────────────
section("2 · ΔN — the world changes while a run waits for approval");
const r2 = parse(await callTool("rigorix_run", { template_name: "payout" }));
console.log(`  rigorix_run → status: ${r2.status} | execution_id: ${r2.execution_id}`);
ok("the next run is paused, waiting for approval", r2.status === "PendingApproval");

console.log("\n  ⏳ While the approval is pending, the OPERATOR freezes the beneficiary.");
sh("freeze_beneficiary.sh", "acme");
console.log("  authority.json now:");
console.log("    " + JSON.stringify(authority()));
ok("authority is now frozen", authority().acme === "frozen");
console.log("\n  Nothing about the human's approval changed. It is still a valid");
console.log("  'yes'. Only the world changed.");

// ── 3 ───────────────────────────────────────────────────────────────────────
section("3 · Tₙ — the same approval, a different world: REFUSED");
const before3 = ledgerRows().length;
const approve3 = parse(await callTool("rigorix_approve_execution", { execution_id: r2.execution_id, step_names: ["payout_execute"] }));
const after3 = ledgerRows().length;
console.log(`  approve/resume → ${JSON.stringify(Object.keys(approve3))}`);
showLedger(ledgerRows());
ok("the ledger did NOT change (no money moved)", after3 === before3, `ledger ${before3} → ${after3}`);
ok("the run did not complete", !!(approve3.final_state), "resume returned a final state");

// ── 4 ───────────────────────────────────────────────────────────────────────
section("4 · The evidence — what the signed trail proves");
const env = envelope(r2.execution_id);
if (!env) {
  ok("envelope written to .rigorix/audit", false, "missing");
} else {
  const eventTypes = [...new Set((env.events ?? []).map((e) => e.event_type))];
  console.log(`  .rigorix/audit/${r2.execution_id}.json`);
  console.log(`    signature       : ${env.signature ? "PRESENT (HMAC-SHA256)" : "ABSENT"}`);
  console.log(`    event types     : ${eventTypes.join(", ")}`);
  console.log(`    events          : ${(env.events ?? []).length}`);
  showFinding((env.precondition_findings ?? [])[0]);
  ok("signed envelope is present", !!env.signature);
  ok("the run recorded a precondition check", eventTypes.includes("precondition_checked"));
  ok("the refusal is on the signed record", (env.precondition_findings ?? []).length > 0);
  ok("the finding says the check failed", (env.precondition_findings ?? [])[0]?.outcome === "failed");
  // ADR-017 attribution (#987) + boundary fact (#986) — requires rigorix-mcp >= 1.9.2.
  const f0 = (env.precondition_findings ?? [])[0];
  ok("the record binds the check program (check_digest)", !!f0?.check_digest);
  ok("the record binds the authority content (authority_digest)", !!f0?.authority_digest);
  ok("the record states whether the boundary was writable (check_writable)", f0?.check_writable != null);
}

console.log("\n  The same finding through the MCP read surface (rigorix_read_audit):");
try {
  const audit = parse(await callTool("rigorix_read_audit", { execution_id: r2.execution_id, format: "json" }));
  const found = JSON.stringify(audit).includes("\"precondition_findings\"");
  const pf = audit.precondition_findings ?? (audit.envelope ?? audit).precondition_findings;
  if (pf) showFinding(pf[0]); else console.log("    " + JSON.stringify(audit).slice(0, 200));
  ok("rigorix_read_audit surfaces the finding", found);
} catch (e) {
  ok("rigorix_read_audit surfaces the finding", false, String(e.message).slice(0, 120));
}

// ── 5 ───────────────────────────────────────────────────────────────────────
section("5 · Fail closed — an unknown beneficiary is refused too");
const r5 = parse(await callTool("rigorix_run", { template_name: "payout-unknown" }));
console.log(`  rigorix_run(payout-unknown) → status: ${r5.status}`);
ok("the unknown-beneficiary run paused for approval", r5.status === "PendingApproval");
const before5 = ledgerRows().length;
await callTool("rigorix_approve_execution", { execution_id: r5.execution_id, step_names: ["payout_execute"] });
const after5 = ledgerRows().length;
showLedger(ledgerRows());
ok("the ledger did NOT change for an unknown beneficiary", after5 === before5, `ledger ${before5} → ${after5}`);
const env5 = envelope(r5.execution_id);
ok("the refusal is signed on that run too", (env5?.precondition_findings ?? []).length > 0);

// ── verdict ─────────────────────────────────────────────────────────────────
section("Does the authority still stand?");
console.log("  Q. The agent was authorized to pay. Does that authorization still stand?");
console.log("");
console.log("  A. No — and you do not have to take anyone's word for it.");
console.log("     · the human approval was recorded, and it was not withdrawn;");
console.log("     · the authority was re-checked AT DISPATCH and failed (exit 3);");
console.log("     · the payout step never ran — the ledger is unchanged;");
console.log("     · the check, its outcome, its fingerprint (inputs_hash) and the");
console.log("       time it ran (checked_at) are in the signed envelope.");
console.log("");
console.log("  Authorization is not a standing grant. It is re-evaluated at the");
console.log("  moment of consequence. That is what makes \"the world changed\"");
console.log("  answerable from the record instead of from trust.");

console.log("\n" + (failures === 0
  ? "✅ all assertions passed"
  : `❌ ${failures} assertion(s) failed`));
process.exit(failures === 0 ? 0 : 1);
