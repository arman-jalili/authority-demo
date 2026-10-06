import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The operator's authority check is the rule the agent is judged by. These
 * tests pin its contract: only an explicit "active" authorizes; everything
 * else fails closed (frozen, unknown, or a broken check).
 */
const CHECK = join(process.cwd(), "operator", "check-beneficiary.mjs");
const CMD = "bash .rigorix/scripts/execute_payout.sh acme 250";

function exitCode(checkPath: string, command = CMD): number | null {
  const r = spawnSync("node", [checkPath], {
    input: JSON.stringify({ parameters: { command } }),
    encoding: "utf8",
  });
  return r.status;
}

function fixture(authority: Record<string, string> | null) {
  const dir = mkdtempSync(join(tmpdir(), "authority-check-"));
  const check = join(dir, "check-beneficiary.mjs");
  copyFileSync(CHECK, check);
  if (authority !== null) writeFileSync(join(dir, "authority.json"), JSON.stringify(authority));
  return { dir, check };
}

describe("the operator authority check (fail-closed contract)", () => {
  it("authorizes an active beneficiary (exit 0)", () => {
    const { dir, check } = fixture({ acme: "active" });
    try { expect(exitCode(check)).toBe(0); } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("refuses a frozen beneficiary (exit 3)", () => {
    const { dir, check } = fixture({ acme: "frozen" });
    try { expect(exitCode(check)).toBe(3); } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("refuses an unknown beneficiary (exit 3)", () => {
    const { dir, check } = fixture({});
    try { expect(exitCode(check)).toBe(3); } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("refuses when the authority file is missing (exit 4)", () => {
    const { dir, check } = fixture(null);
    try { expect(exitCode(check)).toBe(4); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
