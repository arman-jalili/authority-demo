/**
 * authority-demo — the ledger domain (the "consequence" side).
 *
 * Ordinary application code: it appends a payout row to a JSON ledger.
 * Nothing here is a policy decision — the policy lives in Rigorix (the
 * dispatch-time gate + the operator's authority check). The domain code and
 * the policy tell the same story: a payout is a row, and the only thing that
 * decides whether the row is written is the engine.
 */
import { readFileSync, writeFileSync } from "node:fs";

export interface Payout {
  beneficiary: string;
  amount: number;
  currency: "EUR";
  at: string;
}

/** Read the ledger; a missing or unreadable file is an empty ledger. */
export function readLedger(path: string): Payout[] {
  try {
    const rows = JSON.parse(readFileSync(path, "utf8")) as Payout[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Append one payout and return the full ledger. This is the side effect. */
export function appendPayout(path: string, beneficiary: string, amount: number): Payout[] {
  const rows = readLedger(path);
  rows.push({ beneficiary, amount, currency: "EUR", at: new Date().toISOString() });
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n");
  return rows;
}

/** Total paid to one beneficiary (used by the tests and the read scripts). */
export function totalPaid(rows: Payout[], beneficiary: string): number {
  return rows.filter((r) => r.beneficiary === beneficiary).reduce((n, r) => n + r.amount, 0);
}

// CLI: node src/payouts.ts execute <ledger> <beneficiary> <amount>
const [, , verb, ledgerPath, beneficiary, amountRaw] = process.argv;
if (verb === "execute" && ledgerPath && beneficiary && amountRaw) {
  const rows = appendPayout(ledgerPath, beneficiary, Number(amountRaw));
  console.log(`paid ${amountRaw} EUR to ${beneficiary} (ledger rows: ${rows.length})`);
}
