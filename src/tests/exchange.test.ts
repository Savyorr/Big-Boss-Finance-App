import { formatMoney } from "../calculations/money";
import { afterEach, describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { FinanceDatabase } from "../database/db";
import { createRepository } from "../database/repository";
import { createFinanceService } from "../services/finance";
import { createExchangeService, snapshot } from "../services/exchange";
import {
  sourceTotals,
  entityTables,
  collections,
  emptyData,
  type Envelope,
} from "../services/exchange/schema";
import {
  parseJson,
  exactScaled,
  canonical,
  stableId,
} from "../services/exchange/json";
import { prepareDocument } from "../services/exchange/adapters";
import { validateData } from "../services/exchange/validate";
const databases: FinanceDatabase[] = [];
async function machine() {
  const db = new FinanceDatabase(`exchange-${crypto.randomUUID()}`);
  databases.push(db);
  await db.open();
  return {
    db,
    repo: createRepository(db),
    finance: createFinanceService(db),
    exchange: createExchangeService(db),
  };
}
async function setup() {
  const m = await machine();
  const shop = await m.repo.createShop({
    name: "Synthetic shop",
    address: "",
    contact: "",
  });
  const account = await m.repo.saveAccount(shop.id, {
    name: "Synthetic bank",
    type: "Chequing",
    openingBalanceCents: 100000,
    openingDate: "2026-01-01",
    status: "active",
  });
  const stylist = await m.repo.saveStylist(shop.id, {
    name: "Synthetic stylist",
    commissionBasisPoints: 5000,
    status: "active",
  });
  return { ...m, shop, account, stylist };
}
const entry = (shopId: string, accountId: string, amountCents = 1000) => ({
  shopId,
  accountId,
  businessDate: "2026-06-10",
  kind: "Operating expense" as const,
  amountCents,
  category: "Rent Expense",
  payee: "",
  description: "Synthetic expense",
  paymentMethod: "Cash",
  notes: "",
});
async function merge(
  target: Awaited<ReturnType<typeof machine>>,
  doc: Envelope,
  resolution?: "local" | "imported",
) {
  const plan = await target.exchange.previewText(JSON.stringify(doc), {
    useWorker: false,
  });
  const decisions = Object.fromEntries(
    plan.conflicts.map((c) => [c.id, resolution ?? "imported"]),
  );
  return target.exchange.apply(plan.token, decisions, { confirmed: true });
}
const legacyPath =
  process.env.BIG_BOSS_LEGACY_FIXTURE ??
  "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json";
function legacyFixture() {
  if (!existsSync(legacyPath))
    throw new Error(
      "Required private regression fixture missing. Set BIG_BOSS_LEGACY_FIXTURE to the unchanged original Big_Boss_Finance_Backup_2026-10-23.json outside Git. This test is not skipped.",
    );
  const text = readFileSync(legacyPath, "utf8");
  expect(createHash("sha256").update(text).digest("hex")).toBe(
    "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a",
  );
  return text;
}
// Keep actual financial reference values outside the repository, without weakening the regression.
const expectedText = readFileSync(
  process.env.BIG_BOSS_LEGACY_EXPECTED ?? "private/legacy-expected-totals.json",
  "utf8",
);
expect(createHash("sha256").update(expectedText).digest("hex")).toBe(
  "7fa2472d4341d85a2753597bca9c9b1ffb8f5afb1f32d7fbae6a6cb4d44b4844",
);
const expected = JSON.parse(expectedText) as Record<string, number>;
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
describe("required real legacy regression (private file, isolated IndexedDB only)", () => {
  it("preserves all 968 IDs, five cent totals, zero records, unusual categories, and repeat imports", async () => {
    const m = await setup();
    const text = legacyFixture();
    const original = JSON.parse(text);
    const before = await m.db.transactions.count();
    const plan = await m.exchange.previewText(text, {
      targetShopId: m.shop.id,
      useWorker: false,
      filename: "Legacy regression.json",
    });
    expect(await m.db.transactions.count()).toBe(before);
    expect(plan.sourceTotals).toEqual(expected);
    expect(plan.prepared.sourceCount).toBe(968);
    const result = await m.exchange.apply(plan.token, {}, { confirmed: true });
    expect(result.added).toBe(968);
    const records = await m.db.transactions.toArray();
    expect(records).toHaveLength(968);
    expect(new Set(records.map((r) => r.source!.originalId))).toEqual(
      new Set(original.transactions.map((r: any) => r.id)),
    );
    expect(sourceTotals(await snapshot(m.db))).toEqual(expected);
    expect(
      records.filter((r) =>
        Object.values(r.legacyFields!).every((v) => v === 0),
      ),
    ).toHaveLength(20);
    expect(
      records.some(
        (r) => r.legacyFields!.bankDebit! > 0 && r.legacyFields!.expense === 0,
      ),
    ).toBe(true);
    expect(records.some((r) => r.category === "Profisional Fee")).toBe(true);
    expect(
      records.every(
        (r) => r.kind === "Needs review" && r.postings?.length === 0,
      ),
    ).toBe(true);
    const repeated = await m.exchange.previewText(text, {
      targetShopId: m.shop.id,
      useWorker: false,
    });
    expect(repeated.counts.conflict).toBe(0);
    const again = await m.exchange.apply(
      repeated.token,
      {},
      { confirmed: true },
    );
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(968);
    expect(await m.db.transactions.count()).toBe(968);
    const exported = await m.exchange.exportData("all");
    const fresh = await machine();
    await merge(fresh, exported);
    expect(await fresh.db.transactions.count()).toBe(968);
    expect(sourceTotals(await snapshot(fresh.db))).toEqual(expected);
    expect((await fresh.exchange.exportData("all")).data.transactions).toEqual(
      exported.data.transactions,
    );
  }, 60000);
  it("scopes the same legacy IDs independently to explicitly different shops", async () => {
    const m = await setup();
    const other = await m.repo.createShop({
      name: "Other shop",
      address: "",
      contact: "",
    });
    const text = legacyFixture();
    for (const id of [m.shop.id, other.id]) {
      const p = await m.exchange.previewText(text, {
        targetShopId: id,
        useWorker: false,
      });
      await m.exchange.apply(p.token, {}, { confirmed: true });
    }
    expect(await m.db.transactions.count()).toBe(1936);
    expect(sourceTotals(await snapshot(m.db), [m.shop.id])).toEqual(expected);
    expect(sourceTotals(await snapshot(m.db), [other.id])).toEqual(expected);
  }, 60000);
});
describe("distinct HTML adapter", () => {
  it("preserves days, staff, products, signed adjustments, deposits, bank snapshots and unknown fields", async () => {
    const m = await setup();
    const html = {
      days: [
        {
          date: "2026-06-10",
          total: 120.01,
          card: 80,
          deposit: 10,
          sales: { Alex: 100.01, "Sale Product": 20 },
          notes: "Original day",
        },
      ],
      tx: [
        {
          id: "bank-1",
          date: "2026-06-10",
          account: "Bank",
          cat: "Loan Payment",
          name: "Operating Line",
          details: "Principal",
          income: 0,
          expense: 0,
          credit: 0,
          deposit: 0,
          debit: 40,
          extraFinancialDetail: "Retain me",
        },
      ],
      staff: ["Alex", "Sale Product"],
      open: 74.14,
      bal: {
        asOf: "2026-01-01",
        items: [{ n: "Operating Line", v: -4000 }],
        limit: 15000,
      },
      adj: [
        {
          id: "adjust-1",
          date: "2026-06-20",
          name: "Alex",
          amt: -5,
          note: "Advance correction",
        },
      ],
      unknownFinancialSetting: { value: 12.34 },
    };
    const p = await m.exchange.previewText(JSON.stringify(html), {
      targetShopId: m.shop.id,
      useWorker: false,
    });
    await m.exchange.apply(p.token, {}, { confirmed: true });
    const day = (await m.db.dailySales.toArray())[0];
    expect(day.legacyTotalCents).toBe(12001);
    expect(day.legacyDepositCents).toBe(1000);
    expect(day.productCents).toBe(2000);
    expect(day.linkedTransactionIds).toEqual([]);
    expect(await m.db.earnings.count()).toBe(0);
    expect((await m.db.adjustments.toArray())[0].amountCents).toBe(-500);
    expect((await m.db.stylists.toArray()).some((s) => s.name === "Alex")).toBe(
      true,
    );
    const original = JSON.parse(
      (await m.db.sourceDocuments.toArray())[0].rawText,
    );
    expect(original).toEqual(html);
    const native = await m.exchange.exportData("all");
    const fresh = await machine();
    await merge(fresh, native);
    expect((await fresh.db.dailySales.toArray())[0]).toEqual(day);
  });
  it("does not replace mismatched saved daily totals or invent commissions", async () => {
    const m = await setup();
    const text = JSON.stringify({
      days: [
        {
          date: "2026-01-01",
          total: 200,
          card: 0,
          sales: { Alex: 100 },
          deposit: 0,
        },
      ],
      tx: [],
      staff: ["Alex"],
      open: 0,
    });
    const p = await m.exchange.previewText(text, {
      targetShopId: m.shop.id,
      useWorker: false,
    });
    expect(p.warnings.some((w) => w.includes("differs"))).toBe(true);
    await m.exchange.apply(p.token, {}, { confirmed: true });
    expect((await m.db.dailySales.toArray())[0].legacyTotalCents).toBe(20000);
  });
});
describe("modern records, relationships and complete backup restoration", () => {
  it("round-trips all business records, rate history, openings, payments, adjustments and reconciliation", async () => {
    const a = await setup();
    await a.finance.saveSale({
      shopId: a.shop.id,
      businessDate: "2026-06-10",
      productCents: 2000,
      cardCents: 8000,
      cashCents: 0,
      cashVerified: false,
      cashAccountId: a.account.id,
      cardAccountId: a.account.id,
      notes: "",
      stylistAllocations: [{ stylistId: a.stylist.id, serviceCents: 10000 }],
    });
    await a.finance.savePayment({
      shopId: a.shop.id,
      stylistId: a.stylist.id,
      accountId: a.account.id,
      businessDate: "2026-06-15",
      amountCents: 3000,
      paymentMethod: "Cash",
      notes: "",
      periodMode: "calendar",
    });
    await a.finance.saveAdjustment({
      shopId: a.shop.id,
      stylistId: a.stylist.id,
      businessDate: "2026-06-15",
      amountCents: 500,
      reason: "Previously settled",
      adjustmentKind: "Previously settled",
      periodMode: "calendar",
    });
    await a.finance.saveReconciliation({
      shopId: a.shop.id,
      accountId: a.account.id,
      statementDate: "2026-06-30",
      statementBalanceCents: 100000,
      clearedKeys: [],
      expectedAccountRevision: a.account.revision,
      expectedEventRevisions: {},
    });
    const before = await a.exchange.exportData(a.shop.id);
    const b = await machine();
    await merge(b, before);
    const after = await b.exchange.exportData(a.shop.id);
    for (const table of collections.filter(
      (k) => !["importHistory", "backupMetadata"].includes(k),
    ))
      expect(after.data[table], table).toEqual(before.data[table]);
    expect(after.data.commissionRules.length).toBeGreaterThan(0);
    expect(after.data.accounts[0].openingBalanceCents).toBe(100000);
    expect(after.data.reconciliations[0].status).toBe("completed");
  });
  it("includes all shops and complete inter-shop transfer closure with explicit scope metadata", async () => {
    const a = await setup();
    const other = await a.repo.createShop({
      name: "Linked shop",
      address: "",
      contact: "",
    });
    const dest = await a.repo.saveAccount(other.id, {
      name: "Second bank",
      type: "Cash",
      openingBalanceCents: 0,
      openingDate: "2026-01-01",
      status: "active",
    });
    await a.finance.saveTransaction({
      ...entry(a.shop.id, a.account.id),
      kind: "Transfer",
      destinationAccountId: dest.id,
      destinationShopId: other.id,
    });
    const doc = await a.exchange.exportData(a.shop.id);
    expect(doc.scope.requestedShopId).toBe(a.shop.id);
    expect(new Set(doc.scope.shopIds)).toEqual(new Set([a.shop.id, other.id]));
    const b = await machine();
    await merge(b, doc);
    validateData(await snapshot(b.db));
    expect(await b.db.shops.count()).toBe(2);
  });
  it("maps unfamiliar source shop IDs explicitly and deterministically without name merging", async () => {
    const a = await setup();
    await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const doc = await a.exchange.exportData("all");
    const b = await setup();
    const p = await b.exchange.previewText(JSON.stringify(doc), {
      useWorker: false,
      mapping: { [a.shop.id]: b.shop.id },
    });
    await expect(
      b.exchange.apply(p.token, {}, { confirmed: true }),
    ).rejects.toThrow("mapping");
    await b.exchange.apply(
      p.token,
      {},
      { confirmed: true, mappingConfirmed: true },
    );
    expect(await b.db.shops.count()).toBe(1);
    expect((await b.db.transactions.toArray())[0].shopId).toBe(b.shop.id);
    const again = await b.exchange.previewText(JSON.stringify(doc), {
      useWorker: false,
    });
    expect(again.prepared.shopIds).toEqual([b.shop.id]);
    await b.exchange.apply(
      again.token,
      {},
      { confirmed: true, mappingConfirmed: true },
    );
    expect(await b.db.transactions.count()).toBe(1);
  });
});
describe("two-device ancestry, conflicts and deletions", () => {
  it("preserves independent additions and applies safe descendant updates", async () => {
    const a = await setup();
    const tx = await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const b = await machine();
    await merge(b, await a.exchange.exportData("all"));
    await b.finance.saveTransaction(entry(a.shop.id, a.account.id, 2000));
    const updated = await b.finance.saveTransaction(
      entry(a.shop.id, a.account.id, 1500),
      { id: tx.id, expectedRevision: tx.revision },
    );
    const p = await a.exchange.previewText(
      JSON.stringify(await b.exchange.exportData("all")),
      { useWorker: false },
    );
    expect(p.conflicts).toHaveLength(0);
    await a.exchange.apply(p.token, {}, { confirmed: true });
    expect(await a.db.transactions.count()).toBe(2);
    expect((await a.db.transactions.get(tx.id))!.revision).toBe(
      updated.revision,
    );
  });
  it("requires a decision for divergent edits and records a two-parent resolution", async () => {
    const a = await setup();
    const tx = await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const b = await machine();
    await merge(b, await a.exchange.exportData("all"));
    const local = await a.finance.saveTransaction(
      entry(a.shop.id, a.account.id, 2000),
      { id: tx.id, expectedRevision: tx.revision },
    );
    const remote = await b.finance.saveTransaction(
      entry(a.shop.id, a.account.id, 3000),
      { id: tx.id, expectedRevision: tx.revision },
    );
    const p = await a.exchange.previewText(
      JSON.stringify(await b.exchange.exportData("all")),
      { useWorker: false },
    );
    expect(p.conflicts).toHaveLength(1);
    await expect(
      a.exchange.apply(p.token, {}, { confirmed: true }),
    ).rejects.toThrow("Resolve");
    expect((await a.db.transactions.get(tx.id))!.amountCents).toBe(2000);
    await a.exchange.apply(
      p.token,
      { [p.conflicts[0].id]: "local" },
      { confirmed: true },
    );
    const resolved = (await a.db.transactions.get(tx.id))!;
    expect(resolved.amountCents).toBe(2000);
    expect(
      new Set((await a.db.revisions.get(resolved.revision))!.parents),
    ).toEqual(new Set([local.revision, remote.revision]));
    await merge(b, await a.exchange.exportData("all"));
    expect((await b.db.transactions.get(tx.id))!.amountCents).toBe(2000);
  });
  it("can choose imported conflict values without silently dropping the local revision", async () => {
    const a = await setup();
    const tx = await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const b = await machine();
    await merge(b, await a.exchange.exportData("all"));
    const local = await a.finance.saveTransaction(
      entry(a.shop.id, a.account.id, 2000),
      { id: tx.id, expectedRevision: tx.revision },
    );
    await b.finance.saveTransaction(entry(a.shop.id, a.account.id, 3000), {
      id: tx.id,
      expectedRevision: tx.revision,
    });
    await merge(a, await b.exchange.exportData("all"), "imported");
    expect((await a.db.transactions.get(tx.id))!.amountCents).toBe(3000);
    expect(await a.db.revisions.get(local.revision)).toBeDefined();
  });
  it("does not resurrect deleted records when an older file is imported", async () => {
    const a = await setup();
    const tx = await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const older = await a.exchange.exportData("all");
    const b = await machine();
    await merge(b, older);
    await a.finance.deleteRecord("transactions", a.shop.id, tx.id, tx.revision);
    await merge(b, await a.exchange.exportData("all"));
    expect((await b.db.transactions.get(tx.id))!.deletedAt).toBeTruthy();
    await merge(b, older);
    expect((await b.db.transactions.get(tx.id))!.deletedAt).toBeTruthy();
  });
  it("treats missing common ancestry as a conflict, not latest-write-wins", async () => {
    const a = await setup();
    const tx = await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const doc = await a.exchange.exportData("all");
    doc.data.revisions = [];
    doc.data.transactions[0] = {
      ...doc.data.transactions[0],
      revision: crypto.randomUUID(),
      updatedAt: "2099-01-01T00:00:00.000Z",
      amountCents: 2000,
      operatingExpenseCents: 2000,
      postings: [
        { accountId: a.account.id, shopId: a.shop.id, deltaCents: -2000 },
      ],
    };
    const p = await a.exchange.previewText(JSON.stringify(doc), {
      useWorker: false,
    });
    expect(p.conflicts).toHaveLength(1);
    expect((await a.db.transactions.get(tx.id))!.amountCents).toBe(1000);
  });
});
describe("atomic recovery, replacement and untrusted input", () => {
  it("retains a recoverable pre-import snapshot after a write failure", async () => {
    const a = await setup();
    const b = await machine();
    await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const p = await b.exchange.previewText(
      JSON.stringify(await a.exchange.exportData("all")),
      { useWorker: false },
    );
    b.db.transactions.hook("creating", () => {
      throw new Error("Simulated disk failure");
    });
    await expect(
      b.exchange.apply(p.token, {}, { confirmed: true }),
    ).rejects.toThrow("Recovery backup");
    expect(await b.db.shops.count()).toBe(0);
    expect(await b.db.transactions.count()).toBe(0);
    const backups = await b.db.backups.toArray();
    expect(backups).toHaveLength(1);
    expect((backups[0].payload as Envelope).data.shops).toEqual([]);
    expect((await b.db.importHistory.toArray())[0].result).toBe("rejected");
  });
  it("rejects a stale preview without applying financial changes", async () => {
    const a = await setup();
    const b = await setup();
    const p = await b.exchange.previewText(
      JSON.stringify(await a.exchange.exportData("all")),
      { useWorker: false },
    );
    await b.repo.createShop({
      name: "Concurrent shop",
      address: "",
      contact: "",
    });
    await expect(
      b.exchange.apply(p.token, {}, { confirmed: true }),
    ).rejects.toThrow("changed");
    expect(await b.db.shops.count()).toBe(2);
  });
  it("replaces only its confirmed shop scope and restores an older snapshot through explicit conflict choices", async () => {
    const a = await setup();
    const t = await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const backup = await a.exchange.createBackup();
    const other = await a.repo.createShop({
      name: "Unrelated",
      address: "",
      contact: "",
    });
    await a.finance.saveTransaction(entry(a.shop.id, a.account.id, 2000), {
      id: t.id,
      expectedRevision: t.revision,
    });
    await a.finance.saveTransaction(entry(a.shop.id, a.account.id, 4000));
    const p = await a.exchange.restorePreview(backup.id, { useWorker: false });
    expect(p.conflicts.length).toBeGreaterThan(0);
    const decisions = Object.fromEntries(
      p.conflicts.map((c) => [c.id, "imported" as const]),
    );
    await expect(
      a.exchange.apply(p.token, decisions, { confirmed: true }),
    ).rejects.toThrow("REPLACE");
    await a.exchange.apply(p.token, decisions, {
      confirmed: true,
      replaceText: "REPLACE",
    });
    expect(await a.db.shops.get(other.id)).toBeDefined();
    expect((await a.db.transactions.get(t.id))!.amountCents).toBe(1000);
    expect(
      (await a.db.transactions.toArray()).filter((r) => !r.deletedAt),
    ).toHaveLength(1);
  });
  it("rejects malformed, unsafe, unsupported, excessively deep and invalid references before any write", async () => {
    const m = await setup();
    for (const text of [
      "{bad",
      '{"__proto__":{}}',
      '{"a":1,"a":2}',
      "[".repeat(40) + "0" + "]".repeat(40),
      '{"application":"big-boss-finance","schemaVersion":999}',
    ])
      await expect(
        m.exchange.previewText(text, { useWorker: false }),
      ).rejects.toThrow();
    const doc = await m.exchange.exportData("all");
    doc.data.accounts[0].shopId = crypto.randomUUID();
    await expect(
      m.exchange.previewText(JSON.stringify(doc), { useWorker: false }),
    ).rejects.toThrow("reference");
    expect(await m.db.transactions.count()).toBe(0);
    expect(await m.db.backups.count()).toBe(0);
  });
  it("parses decimal amounts exactly and rejects hidden precision rather than rounding", () => {
    expect(exactScaled("123456.78", 2)).toBe(12345678);
    expect(exactScaled("1e-2", 2)).toBe(1);
    expect(() => exactScaled("0.001", 2)).toThrow("precision");
    expect(() => exactScaled("90071992547409.92", 2)).toThrow("range");
    expect(() => parseJson('{"x":1e999}')).toThrow("Nonfinite");
  });
});

describe("linked aggregate conflicts and recovery evidence", () => {
  it("resolves a divergent daily sale together with its canonical event and earnings", async () => {
    const a = await setup();
    const input = {
      shopId: a.shop.id,
      businessDate: "2026-06-10",
      productCents: 0,
      cardCents: 10000,
      cashCents: 0,
      cashVerified: false,
      cashAccountId: a.account.id,
      cardAccountId: a.account.id,
      notes: "",
      stylistAllocations: [{ stylistId: a.stylist.id, serviceCents: 10000 }],
    };
    const sale = await a.finance.saveSale(input);
    const b = await machine();
    await merge(b, await a.exchange.exportData("all"));
    await a.finance.saveSale(
      { ...input, productCents: 1000 },
      { id: sale.id, expectedRevision: sale.revision },
    );
    await b.finance.saveSale(
      { ...input, productCents: 2000 },
      { id: sale.id, expectedRevision: sale.revision },
    );
    const p = await a.exchange.previewText(
      JSON.stringify(await b.exchange.exportData("all")),
      { useWorker: false },
    );
    expect(p.conflicts).toHaveLength(1);
    expect(new Set(p.conflicts[0].changes.map((c) => c.table))).toEqual(
      new Set(["dailySales", "transactions", "earnings"]),
    );
    await a.exchange.apply(
      p.token,
      { [p.conflicts[0].id]: "imported" },
      { confirmed: true },
    );
    expect((await a.db.dailySales.get(sale.id))!.productCents).toBe(2000);
    validateData(await snapshot(a.db));
  });
  it("can restore the durable baseline after an apply failure, including existing records", async () => {
    const a = await setup();
    const current = await a.finance.saveTransaction(
      entry(a.shop.id, a.account.id, 5000),
    );
    const b = await machine();
    await merge(b, await a.exchange.exportData("all"));
    await a.finance.saveTransaction(entry(a.shop.id, a.account.id, 6000), {
      id: current.id,
      expectedRevision: current.revision,
    });
    const p = await b.exchange.previewText(
      JSON.stringify(await a.exchange.exportData("all")),
      { useWorker: false },
    );
    const fail = () => {
      throw new Error("Write blocked for test");
    };
    b.db.transactions.hook("updating", fail);
    await expect(
      b.exchange.apply(p.token, {}, { confirmed: true }),
    ).rejects.toThrow("Recovery backup");
    b.db.transactions.hook("updating").unsubscribe(fail);
    const rejected = (await b.db.importHistory.toArray()).find(
      (h) => h.result === "rejected",
    )!;
    const backup = (await b.db.backups.get(rejected.backupId))!;
    const fresh = await machine();
    await merge(fresh, backup.payload as Envelope);
    expect((await fresh.db.transactions.get(current.id))!.amountCents).toBe(
      5000,
    );
  });
  it("rejects a post-write amount mismatch and rolls back all business changes", async () => {
    const a = await setup();
    await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const b = await machine();
    const p = await b.exchange.previewText(
      JSON.stringify(await a.exchange.exportData("all")),
      { useWorker: false },
    );
    b.db.transactions.hook("creating", (_key, obj) => {
      obj.amountCents = 9999;
    });
    await expect(
      b.exchange.apply(p.token, {}, { confirmed: true }),
    ).rejects.toThrow("reconciliation");
    expect(await b.db.transactions.count()).toBe(0);
    expect(await b.db.shops.count()).toBe(0);
    expect((await b.db.backups.toArray()).some((v) => !!v.payload)).toBe(true);
  });
  it("rejects unsafe revision graphs and money fields with hidden excess precision", async () => {
    const a = await setup();
    const tx = await a.finance.saveTransaction(entry(a.shop.id, a.account.id));
    const doc = await a.exchange.exportData("all");
    doc.data.revisions.find((r) => r.id === tx.revision)!.parents = [
      tx.revision,
    ];
    await expect(
      a.exchange.previewText(JSON.stringify(doc), { useWorker: false }),
    ).rejects.toThrow("cycle");
    const text = JSON.stringify(await a.exchange.exportData("all")).replace(
      '"amountCents":1000',
      '"amountCents":1000.00000000000000001',
    );
    await expect(
      a.exchange.previewText(text, { useWorker: false }),
    ).rejects.toThrow("precision");
  });
});

describe("explicit shop mapping round trips", () => {
  it("returns mapped records to their original identities across both owners instead of duplicating them", async () => {
    const a = await setup(),
      b = await setup();
    const original = await a.finance.saveTransaction(
      entry(a.shop.id, a.account.id),
    );
    async function mapped(from: typeof a, to: typeof b) {
      const plan = await to.exchange.previewText(
        JSON.stringify(await from.exchange.exportData("all")),
        { useWorker: false, mapping: { [from.shop.id]: to.shop.id } },
      );
      await to.exchange.apply(
        plan.token,
        Object.fromEntries(
          plan.conflicts.map((c) => [c.id, "imported" as const]),
        ),
        { confirmed: true, mappingConfirmed: true },
      );
    }
    await mapped(a, b);
    const onB = (await b.db.transactions.toArray())[0];
    const accountB = (await b.db.accounts.get(onB.accountId!))!;
    await b.finance.saveTransaction(entry(b.shop.id, accountB.id, 2000), {
      id: onB.id,
      expectedRevision: onB.revision,
    });
    await mapped(b, a);
    expect(await a.db.transactions.count()).toBe(1);
    expect((await a.db.transactions.get(original.id))!.amountCents).toBe(2000);
    const onA = (await a.db.transactions.get(original.id))!;
    await a.finance.saveTransaction(entry(a.shop.id, a.account.id, 3000), {
      id: onA.id,
      expectedRevision: onA.revision,
    });
    await mapped(a, b);
    expect(await b.db.transactions.count()).toBe(1);
    expect((await b.db.transactions.get(onB.id))!.amountCents).toBe(3000);
  });
});

it("displays cent amounts exactly at the safe-integer boundary and for negative fractional dollars", () => {
  expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  expect(formatMoney(-1)).toBe("-$0.01");
  expect(formatMoney(29)).toBe("$0.29");
});

it("imports a valid source amount at the exact cent boundary without binary rounding", async () => {
  const m = await setup();
  const root = {
    app: "Synthetic precision",
    version: 1,
    transactions: [
      {
        id: "precision-1",
        date: "2026-06-10",
        type: "Income",
        category: "Needs review",
        payee: "",
        details: "Precision reference",
        income: 0,
        expense: 0,
        bankCredit: 0,
        bankDeposit: 0,
        bankDebit: 0,
        notes: "",
      },
    ],
  };
  const text = JSON.stringify(root).replace(
    '"income":0',
    '"income":90071992547409.91',
  );
  const plan = await m.exchange.previewText(text, {
    targetShopId: m.shop.id,
    useWorker: false,
  });
  await m.exchange.apply(plan.token, {}, { confirmed: true });
  const row = (await m.db.transactions.toArray())[0];
  expect(row.legacyFields!.income).toBe(Number.MAX_SAFE_INTEGER);
  expect(row.source!.moneyText!.income).toBe("90071992547409.91");
});
