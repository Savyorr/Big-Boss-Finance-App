import { it, expect, afterEach } from "vitest";
import { FinanceDatabase } from "../database/db";
import { createRepository } from "../database/repository";
import {
  createFinanceService,
  newMeta,
  readFinance,
} from "../services/finance";
import {
  emptyFinanceData,
  monthlySeries,
  reconciliationIsCurrent,
} from "../calculations/finance";
import { validateData } from "../services/exchange/validate";
import { snapshot } from "../services/exchange";
const instances: FinanceDatabase[] = [];
async function setup() {
  const db = new FinanceDatabase(`audit-${crypto.randomUUID()}`);
  instances.push(db);
  await db.open();
  const repo = createRepository(db);
  const shop = await repo.createShop({
    name: "Audit shop",
    address: "",
    contact: "",
  });
  const account = await repo.saveAccount(shop.id, {
    name: "Audit account",
    type: "Chequing",
    openingBalanceCents: 100000,
    openingDate: "2026-01-01",
    status: "active",
  });
  return { db, repo, shop, account, finance: createFinanceService(db) };
}
afterEach(async () => {
  for (const db of instances.splice(0)) await db.delete();
});
it("does not invent extra report months after year 9999", () => {
  expect(
    monthlySeries(emptyFinanceData, "all", "9999-12-01", "9999-12-31").map(
      (m) => m.period,
    ),
  ).toEqual(["9999-12"]);
});
it("rejects oversized report ranges rather than silently truncating the report", () => {
  expect(() =>
    monthlySeries(emptyFinanceData, "all", "1900-01-01", "2001-01-31"),
  ).toThrow("100 years");
});
it("does not call a reconciliation current when its cleared balance cannot be reproduced", async () => {
  const m = await setup();
  const r = {
    ...newMeta(),
    shopId: m.shop.id,
    accountId: m.account.id,
    statementDate: "2026-06-30",
    statementBalanceCents: 99000,
    clearedKeys: [],
    clearedBalanceCents: 99000,
    differenceCents: 0,
    status: "completed" as const,
    accountRevision: m.account.revision,
    eventRevisions: {},
  };
  expect(reconciliationIsCurrent(r, await readFinance(m.db), m.account)).toBe(
    false,
  );
  await m.db.reconciliations.add(r);
  const awaitedSnapshot = await snapshot(m.db);
  expect(() => validateData(awaitedSnapshot)).toThrow("reconciliation");
});
it("rejects active classified movements pointing to a soft-deleted account", async () => {
  const m = await setup();
  await m.finance.saveTransaction({
    shopId: m.shop.id,
    accountId: m.account.id,
    businessDate: "2026-06-10",
    kind: "Operating expense",
    amountCents: 1000,
    category: "Rent",
    payee: "",
    description: "Audit cost",
    paymentMethod: "Cash",
    notes: "",
  });
  const now = new Date().toISOString();
  const deleted = {
    ...m.account,
    deletedAt: now,
    updatedAt: now,
    revision: crypto.randomUUID(),
    parentRevision: m.account.revision,
  };
  await m.db.accounts.put(deleted);
  await m.db.revisions.add({
    id: deleted.revision,
    shopId: m.shop.id,
    entityType: "accounts",
    entityId: deleted.id,
    parents: [m.account.revision],
    createdAt: now,
    payload: deleted,
  });
  const data = await snapshot(m.db);
  expect(() => validateData(data)).toThrow("deleted account");
});

it("displays exact safe-integer cents and negative sub-dollar balances", async () => {
  const { formatMoney } = await import("../calculations/money");
  expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  expect(formatMoney(-1)).toBe("-$0.01");
  expect(formatMoney(0)).toBe("$0.00");
});
