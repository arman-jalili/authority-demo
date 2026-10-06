import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { appendPayout, readLedger, totalPaid } from "./payouts.js";

describe("the payout ledger", () => {
  it("appends rows and totals per beneficiary", () => {
    const dir = mkdtempSync(join(tmpdir(), "authority-demo-"));
    const ledger = join(dir, "ledger.json");
    try {
      appendPayout(ledger, "acme", 250);
      appendPayout(ledger, "acme", 50);
      appendPayout(ledger, "globex", 10);
      const rows = readLedger(ledger);
      expect(rows).toHaveLength(3);
      expect(totalPaid(rows, "acme")).toBe(300);
      expect(totalPaid(rows, "globex")).toBe(10);
      expect(rows[0]?.currency).toBe("EUR");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads a missing ledger as empty", () => {
    expect(readLedger("/nonexistent/authority-demo/ledger.json")).toEqual([]);
  });
});
