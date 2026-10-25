import { beforeEach, afterEach, describe, it, expect } from "vitest";
import Dexie from "dexie";
import { FinanceDatabase, schemaV1 } from "../database/db";
import { createRepository } from "../database/repository";
import { createFinanceService, readFinance } from "../services/finance";
import {
  accountBalance,
  summarize,
  commissionSummary,
  monthlySeries,
  reconciliationState,
  reconciliationIsCurrent,
  movements,
  periodKey,
  periodEnd,
} from "../calculations/finance";
import { commissionCents, addCents } from "../calculations/money";
import type { Account, Stylist, Shop } from "../models";
import type {
  FinancialInput,
  SaleInput,
  PaymentInput,
} from "../models/financial-inputs";
let db: FinanceDatabase;
let repo: ReturnType<typeof createRepository>;
let service: ReturnType<typeof createFinanceService>;
let shop: Shop;
let bank: Account;
let cash: Account;
let stylist: Stylist;
const date = "2026-06-10";
beforeEach(async () => {
  db = new FinanceDatabase(`finance-${crypto.randomUUID()}`);
  await db.open();
  repo = createRepository(db);
  service = createFinanceService(db);
  shop = await repo.createShop({ name: "Test shop", address: "", contact: "" });
  bank = await repo.saveAccount(shop.id, {
    name: "Bank",
    type: "Chequing",
    openingBalanceCents: 100000,
    openingDate: "2026-01-01",
    status: "active",
  });
  cash = await repo.saveAccount(shop.id, {
    name: "Till",
    type: "Cash",
    openingBalanceCents: 0,
    openingDate: "2026-01-01",
    status: "active",
  });
  stylist = await repo.saveStylist(shop.id, {
    name: "Test stylist",
    commissionBasisPoints: 5000,
    status: "active",
  });
});
afterEach(async () => {
  await db.delete();
});
const sale = (changes: Partial<SaleInput> = {}): SaleInput => ({
  shopId: shop.id,
  businessDate: date,
  stylistAllocations: [{ stylistId: stylist.id, serviceCents: 10001 }],
  productCents: 2000,
  cardCents: 8000,
  cashCents: 0,
  cashVerified: false,
  cashAccountId: cash.id,
  cardAccountId: bank.id,
  notes: "Synthetic only",
  ...changes,
});
const entry = (changes: Partial<FinancialInput> = {}): FinancialInput => ({
  shopId: shop.id,
  businessDate: date,
  kind: "Operating expense",
  amountCents: 1000,
  accountId: bank.id,
  category: "Rent Expense",
  description: "Synthetic expense",
  payee: "",
  notes: "",
  paymentMethod: "Bank transfer",
  ...changes,
});
const payment = (changes: Partial<PaymentInput> = {}): PaymentInput => ({
  shopId: shop.id,
  stylistId: stylist.id,
  accountId: bank.id,
  businessDate: date,
  amountCents: 3000,
  paymentMethod: "Bank transfer",
  notes: "Synthetic only",
  periodMode: "calendar",
  ...changes,
});
const summary = async (
  scope = shop.id,
  from = "2026-01-01",
  to = "2026-12-31",
) => summarize(await readFinance(db), scope, from, to);
describe("daily revenue and historical commissions", () => {
  it("posts sales and receipts once, excludes products from commissions, and rounds half cents up", async () => {
    const day = await service.saveSale(sale());
    expect(day.serviceCents).toBe(10001);
    expect(day.cashCents).toBe(4001);
    expect(day.calculatedCashCents).toBe(4001);
    expect(day.cashVerified).toBe(false);
    expect(day.commissionSnapshots![0].commissionCents).toBe(5001);
    const s = await summary();
    expect(s.revenueCents).toBe(12001);
    expect(s.expenseCents).toBe(5001);
    expect(s.profitCents).toBe(7000);
    expect(s.outstandingCents).toBe(5001);
    expect(s.cashMovementCents).toBe(12001);
    expect(s.balanceCents).toBe(112001);
    expect(await db.transactions.count()).toBe(1);
  });
  it("preserves receipt mismatches and legitimate negative calculated cash with warnings", async () => {
    const day = await service.saveSale(sale({ cardCents: 15000 }));
    expect(day.cashCents).toBe(-2999);
    expect((await summary()).receiptWarnings).toBe(1);
    const edited = await service.saveSale(
      sale({ cardCents: 8000, cashVerified: true, cashCents: 3900 }),
      { id: day.id, expectedRevision: day.revision },
    );
    expect(edited.cashCents).toBe(3900);
    expect((await summary()).revenueCents).toBe(12001);
    expect((await summary()).cashMovementCents).toBe(11900);
  });
  it("rejects a duplicate active shop/date but permits another shop on that date", async () => {
    await service.saveSale(sale());
    await expect(service.saveSale(sale())).rejects.toThrow("already exists");
    const other = await repo.createShop({
      name: "Other",
      address: "",
      contact: "",
    });
    const a = await repo.saveAccount(other.id, {
      name: "Till",
      type: "Cash",
      openingBalanceCents: 0,
      openingDate: date,
      status: "active",
    });
    await service.saveSale(
      sale({
        shopId: other.id,
        stylistAllocations: [],
        productCents: 2000,
        cardCents: 0,
        cashAccountId: a.id,
        cardAccountId: a.id,
      }),
    );
    expect(await db.dailySales.count()).toBe(2);
  });
  it("edits a day without duplicate earnings or event postings and rejects a stale save", async () => {
    const day = await service.saveSale(sale());
    const edited = await service.saveSale(sale({ productCents: 3000 }), {
      id: day.id,
      expectedRevision: day.revision,
    });
    expect(edited.id).toBe(day.id);
    expect(edited.createdAt).toBe(day.createdAt);
    expect(edited.linkedTransactionIds).toEqual(day.linkedTransactionIds);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.earnings.count()).toBe(1);
    expect((await summary()).revenueCents).toBe(13001);
    await expect(
      service.saveSale(sale(), { id: day.id, expectedRevision: day.revision }),
    ).rejects.toThrow("changed");
  });
  it("applies effective-dated rate changes to new days and preserves edited-day rate snapshots", async () => {
    const old = await service.saveSale(sale());
    await repo.saveStylist(
      shop.id,
      { name: stylist.name, commissionBasisPoints: 6000, status: "active" },
      stylist.id,
      stylist.revision,
      "2026-06-15",
    );
    const future = await service.saveSale(sale({ businessDate: "2026-06-20" }));
    expect(future.commissionSnapshots![0].rateBasisPoints).toBe(6000);
    expect(future.commissionSnapshots![0].commissionCents).toBe(6001);
    const past = await service.saveSale(sale({ businessDate: "2026-06-11" }));
    expect(past.commissionSnapshots![0].rateBasisPoints).toBe(5000);
    const edited = await service.saveSale(sale({ productCents: 0 }), {
      id: old.id,
      expectedRevision: old.revision,
    });
    expect(edited.commissionSnapshots![0].rateBasisPoints).toBe(5000);
  });
  it("deletes all effects atomically and retains revision/tombstone history", async () => {
    const day = await service.saveSale(sale());
    await service.deleteRecord("dailySales", shop.id, day.id, day.revision);
    const s = await summary();
    expect(s.revenueCents).toBe(0);
    expect(s.expenseCents).toBe(0);
    expect(s.outstandingCents).toBe(0);
    expect(s.balanceCents).toBe(100000);
    expect((await db.dailySales.get(day.id))!.deletedAt).toBeTruthy();
    expect(await db.tombstones.count()).toBe(3);
    await service.saveSale(sale());
    expect((await summary()).revenueCents).toBe(12001);
  });
  it("rolls back the entire sale when linked event persistence fails", async () => {
    db.transactions.hook("creating", () => {
      throw new Error("Simulated quota failure");
    });
    await expect(service.saveSale(sale())).rejects.toThrow("quota");
    expect(await db.dailySales.count()).toBe(0);
    expect(await db.earnings.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
  });
});
describe("classification, balances and consolidated reporting", () => {
  it("recognizes revenue and its receipt once; an unrelated bank deposit is not more revenue", async () => {
    await service.saveTransaction(
      entry({ kind: "Revenue", amountCents: 10000, category: "Revenue" }),
    );
    await service.saveTransaction(
      entry({
        kind: "Bank deposit",
        amountCents: 10000,
        category: "Money movement",
      }),
    );
    const s = await summary();
    expect(s.revenueCents).toBe(10000);
    expect(s.cashMovementCents).toBe(20000);
    expect(s.balanceCents).toBe(120000);
  });
  it("separates loan advance, principal repayment and interest", async () => {
    const loan = await repo.saveAccount(shop.id, {
      name: "Loan",
      type: "Operating Line of Credit",
      openingBalanceCents: 0,
      openingDate: "2026-01-01",
      status: "active",
    });
    await service.saveTransaction(
      entry({
        kind: "Loan advance",
        amountCents: 20000,
        accountId: loan.id,
        destinationAccountId: bank.id,
      }),
    );
    await service.saveTransaction(
      entry({
        kind: "Loan principal repayment",
        amountCents: 5000,
        destinationAccountId: loan.id,
      }),
    );
    await service.saveTransaction(
      entry({
        kind: "Loan interest",
        amountCents: 200,
        category: "Loan Interest",
      }),
    );
    const data = await readFinance(db);
    expect(accountBalance(data, loan, "2026-12-31")).toBe(-15000);
    expect(accountBalance(data, bank, "2026-12-31")).toBe(114800);
    expect((await summary()).expenseCents).toBe(200);
    expect((await summary()).revenueCents).toBe(0);
  });
  it("recognizes a credit-card purchase as expense and repayment as settlement only", async () => {
    const card = await repo.saveAccount(shop.id, {
      name: "Card",
      type: "Credit Card",
      openingBalanceCents: 0,
      openingDate: "2026-01-01",
      status: "active",
    });
    await service.saveTransaction(
      entry({ accountId: card.id, amountCents: 10000 }),
    );
    await service.saveTransaction(
      entry({
        kind: "Credit card payment",
        destinationAccountId: card.id,
        amountCents: 6000,
      }),
    );
    const data = await readFinance(db);
    expect(accountBalance(data, card, "2026-12-31")).toBe(-4000);
    expect((await summary()).expenseCents).toBe(10000);
    expect((await summary()).cashMovementCents).toBe(-6000);
  });
  it("keeps distributions outside operating expenses", async () => {
    await service.saveTransaction(
      entry({ kind: "Owner distribution", amountCents: 1000 }),
    );
    expect((await summary()).expenseCents).toBe(0);
    expect((await summary()).cashMovementCents).toBe(-1000);
  });
  it("eliminates internal transfers and isolates individual shop reports", async () => {
    const other = await repo.createShop({
      name: "Other shop",
      address: "",
      contact: "",
    });
    const dest = await repo.saveAccount(other.id, {
      name: "Other bank",
      type: "Savings",
      openingBalanceCents: 5000,
      openingDate: "2026-01-01",
      status: "active",
    });
    await service.saveTransaction(
      entry({
        kind: "Transfer",
        amountCents: 10000,
        destinationAccountId: dest.id,
        destinationShopId: other.id,
      }),
    );
    expect((await summary()).cashMovementCents).toBe(-10000);
    expect((await summary(other.id)).cashMovementCents).toBe(10000);
    const all = await summary("all");
    expect(all.cashMovementCents).toBe(0);
    expect(all.balanceCents).toBe(105000);
    expect(all.revenueCents).toBe(0);
    expect(all.expenseCents).toBe(0);
  });
  it("excludes movements before opening date and never invents a pre-opening balance", async () => {
    const later = await repo.saveAccount(shop.id, {
      name: "Later bank",
      type: "Chequing",
      openingBalanceCents: 1000,
      openingDate: "2026-06-15",
      status: "active",
    });
    await service.saveTransaction(
      entry({
        accountId: later.id,
        businessDate: "2026-06-14",
        amountCents: 500,
      }),
    );
    await service.saveTransaction(
      entry({
        accountId: later.id,
        businessDate: "2026-06-15",
        amountCents: 100,
      }),
    );
    const data = await readFinance(db);
    expect(accountBalance(data, later, "2026-06-14")).toBeNull();
    expect(accountBalance(data, later, "2026-06-15")).toBe(900);
  });
  it("preserves unclassified records but excludes them from financial metrics", async () => {
    const row = await service.saveTransaction(
      entry({ kind: "Needs review", accountId: undefined }),
    );
    expect(row.accountingStatus).toBe("review");
    expect((await summary()).revenueCents).toBe(0);
    expect((await summary()).expenseCents).toBe(0);
    expect((await summary()).reviewCount).toBe(1);
  });
  it("uses the same aggregation for monthly and consolidated reports", async () => {
    await service.saveSale(sale());
    await service.saveTransaction(entry({ amountCents: 2000 }));
    const data = await readFinance(db);
    const monthly = monthlySeries(data, "all", "2026-01-01", "2026-12-31");
    expect(monthly).toHaveLength(12);
    expect(addCents(...monthly.map((m) => m.revenue))).toBe(
      (await summary("all")).revenueCents,
    );
    expect(monthly[5].profit).toBe(5000);
    expect(monthlySeries(data, "all", "2026-12-31", "2026-01-01")).toEqual([]);
  });
  it("safely edits and deletes transactions without extra postings; detects stale and foreign edits", async () => {
    const row = await service.saveTransaction(entry());
    const edited = await service.saveTransaction(entry({ amountCents: 2000 }), {
      id: row.id,
      expectedRevision: row.revision,
    });
    expect(await db.transactions.count()).toBe(1);
    expect((await summary()).expenseCents).toBe(2000);
    await expect(
      service.saveTransaction(entry(), {
        id: row.id,
        expectedRevision: row.revision,
      }),
    ).rejects.toThrow("changed");
    const other = await repo.createShop({
      name: "Other",
      address: "",
      contact: "",
    });
    await expect(
      service.saveTransaction(entry({ shopId: other.id }), {
        id: row.id,
        expectedRevision: edited.revision,
      }),
    ).rejects.toThrow("belong");
    await service.deleteRecord(
      "transactions",
      shop.id,
      row.id,
      edited.revision,
    );
    expect((await summary()).expenseCents).toBe(0);
    expect((await summary()).balanceCents).toBe(100000);
  });
  it("rejects malformed amounts, dates, accounts, rate and inappropriate negative input", async () => {
    await expect(
      service.saveTransaction(entry({ amountCents: NaN })),
    ).rejects.toThrow();
    await expect(
      service.saveTransaction(entry({ amountCents: 1.5 })),
    ).rejects.toThrow();
    await expect(
      service.saveTransaction(entry({ businessDate: "2026-02-30" })),
    ).rejects.toThrow();
    await expect(
      service.saveTransaction(entry({ accountId: crypto.randomUUID() })),
    ).rejects.toThrow("account");
    await expect(
      service.saveTransaction(entry({ amountCents: -1 })),
    ).rejects.toThrow();
    expect(() => commissionCents(1, 10001)).toThrow();
  });
  it("does not silently merge unrelated identical transactions but prevents replayed operation IDs", async () => {
    await service.saveTransaction(entry());
    await service.saveTransaction(entry());
    const createId = crypto.randomUUID();
    await service.saveTransaction(entry(), { createId });
    await expect(
      service.saveTransaction(entry(), { createId }),
    ).rejects.toThrow("already saved");
    expect(await db.transactions.count()).toBe(3);
  });
});
describe("commission payments and adjustments", () => {
  it("settles liabilities without a second expense and supports edit and reversal", async () => {
    await service.saveSale(sale());
    const p = await service.savePayment(payment());
    expect((await summary()).expenseCents).toBe(5001);
    expect((await summary()).outstandingCents).toBe(2001);
    const edited = await service.savePayment(payment({ amountCents: 4000 }), {
      id: p.id,
      expectedRevision: p.revision,
    });
    expect((await summary()).outstandingCents).toBe(1001);
    expect(await db.commissionPayments.count()).toBe(1);
    expect(await db.transactions.count()).toBe(2);
    await service.deleteRecord(
      "commissionPayments",
      shop.id,
      p.id,
      edited.revision,
    );
    expect((await summary()).outstandingCents).toBe(5001);
    expect((await summary()).cashMovementCents).toBe(12001);
  });
  it("applies signed explained adjustments to settlement only, with previous-period carry-forward", async () => {
    await service.saveSale(sale());
    await service.savePayment(payment());
    const input = {
      shopId: shop.id,
      stylistId: stylist.id,
      businessDate: "2026-06-11",
      amountCents: 1000,
      reason: "Previously settled outside recorded payments",
      adjustmentKind: "Previously settled" as const,
      periodMode: "calendar" as const,
    };
    const a = await service.saveAdjustment(input);
    await service.saveAdjustment({
      ...input,
      amountCents: -200,
      reason: "Advance was not commission",
    });
    const s = commissionSummary(
      await readFinance(db),
      stylist.id,
      "2026-07-01",
      "2026-07-31",
    );
    expect(s.previousCents).toBe(1201);
    expect(s.outstandingCents).toBe(1201);
    expect((await summary()).expenseCents).toBe(5001);
    await expect(
      service.saveAdjustment({ ...input, reason: " " }),
    ).rejects.toThrow();
    await service.deleteRecord("adjustments", shop.id, a.id, a.revision);
    expect((await summary()).outstandingCents).toBe(2201);
  });
  it("keeps actual cash date separate from legacy settlement assignment through day 22", async () => {
    await service.saveSale(sale());
    await service.savePayment(
      payment({ businessDate: "2026-06-20", periodMode: "legacy" }),
    );
    const data = await readFinance(db);
    expect(
      commissionSummary(data, stylist.id, "2026-06-01", "2026-06-15").paidCents,
    ).toBe(3000);
    expect(
      summarize(data, shop.id, "2026-06-01", "2026-06-15").cashMovementCents,
    ).toBe(12001);
    expect(periodKey("2026-06-22", true, "legacy")).toBe("2026-06 H1");
    expect(periodKey("2026-06-23", true, "legacy")).toBe("2026-06 H2");
    expect(periodEnd("2024-02 H2")).toBe("2024-02-29");
  });
  it("prevents payment replay and direct editing of managed events", async () => {
    const createId = crypto.randomUUID();
    const p = await service.savePayment(payment(), { createId });
    await expect(service.savePayment(payment(), { createId })).rejects.toThrow(
      "already saved",
    );
    const event = (await db.transactions.get(p.transactionId))!;
    await expect(
      service.deleteRecord("transactions", shop.id, event.id, event.revision),
    ).rejects.toThrow("linked");
  });
});
describe("reconciliation and migration", () => {
  it("completes only at zero, preserves movements, and flags edited cleared events", async () => {
    const tx = await service.saveTransaction(entry({ amountCents: 1000 }));
    let data = await readFinance(db);
    const rows = movements(data, bank, "2026-06-30");
    const input = {
      shopId: shop.id,
      accountId: bank.id,
      statementDate: "2026-06-30",
      statementBalanceCents: 99000,
      clearedKeys: rows.map((m) => m.key),
      expectedAccountRevision: bank.revision,
      expectedEventRevisions: Object.fromEntries(
        rows.map((m) => [m.key, m.revision]),
      ),
    };
    const r = await service.saveReconciliation(input);
    expect(r.status).toBe("completed");
    expect(r.differenceCents).toBe(0);
    expect(reconciliationIsCurrent(r, data, bank)).toBe(true);
    const draft = await service.saveReconciliation({
      ...input,
      statementBalanceCents: 98000,
    });
    expect(draft.status).toBe("in-progress");
    expect(draft.differenceCents).toBe(1000);
    await service.saveTransaction(entry({ amountCents: 2000 }), {
      id: tx.id,
      expectedRevision: tx.revision,
    });
    data = await readFinance(db);
    expect(reconciliationIsCurrent(r, data, bank)).toBe(false);
    await expect(service.saveReconciliation(input)).rejects.toThrow("changed");
  });
  it("includes opening balance once, keeps uncleared rows outstanding, and rejects fabricated cleared IDs", async () => {
    await service.saveTransaction(entry({ amountCents: 1000 }));
    const state = reconciliationState(
      await readFinance(db),
      bank,
      "2026-06-30",
      [],
      100000,
    );
    expect(state.clearedBalanceCents).toBe(100000);
    expect(state.outstanding).toHaveLength(1);
    expect(state.differenceCents).toBe(0);
    await expect(
      service.saveReconciliation({
        shopId: shop.id,
        accountId: bank.id,
        statementDate: "2026-06-30",
        statementBalanceCents: 0,
        clearedKeys: ["fake"],
        expectedAccountRevision: bank.revision,
        expectedEventRevisions: {},
      }),
    ).rejects.toThrow("changed");
  });
  it("upgrades populated version 1 without changing any original payloads", async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(schemaV1);
    await v1.open();
    await v1.table("shops").put(shop);
    await v1.table("accounts").put(bank);
    await v1.table("stylists").put(stylist);
    v1.close();
    const upgraded = new FinanceDatabase(name);
    try {
      await upgraded.open();
      expect(upgraded.verno).toBe(3);
      expect(await upgraded.shops.get(shop.id)).toEqual(shop);
      expect(await upgraded.accounts.get(bank.id)).toEqual(bank);
      expect(await upgraded.stylists.get(stylist.id)).toEqual(stylist);
      expect(await upgraded.earnings.count()).toBe(0);
    } finally {
      await upgraded.delete();
    }
  });
  it("survives database close/reopen with financial events, commissions and balances intact", async () => {
    await service.saveSale(sale());
    await service.savePayment(payment());
    const before = await summary();
    const name = db.name;
    db.close();
    db = new FinanceDatabase(name);
    await db.open();
    repo = createRepository(db);
    service = createFinanceService(db);
    expect(await summary()).toEqual(before);
    expect(await db.earnings.count()).toBe(1);
    expect(await db.commissionPayments.count()).toBe(1);
  });
  it("uses exact safe integer intermediates and catches aggregate overflow", () => {
    expect(commissionCents(1, 5000)).toBe(1);
    expect(commissionCents(3, 5000)).toBe(2);
    expect(commissionCents(10001, 3333)).toBe(3333);
    expect(commissionCents(Number.MAX_SAFE_INTEGER, 10000)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow("range");
  });
});

describe("integrity edge cases", () => {
  it("serializes concurrent daily writes and rejects foreign account references even on review records", async () => {
    const results = await Promise.allSettled([
      service.saveSale(sale()),
      service.saveSale(sale()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.dailySales.count()).toBe(1);
    await expect(
      service.saveTransaction(
        entry({ kind: "Needs review", accountId: crypto.randomUUID() }),
      ),
    ).rejects.toThrow("account");
    await expect(
      service.saveTransaction(entry({ destinationAccountId: cash.id })),
    ).rejects.toThrow("destination");
  });
  it("keeps a source payload unchanged when its accounting classification is edited", async () => {
    const original = await service.saveTransaction(
      entry({ kind: "Needs review", accountId: undefined }),
    );
    const legacyFields = {
      income: 100,
      expense: 200,
      bankCredit: 300,
      bankDeposit: 400,
      bankDebit: 500,
    };
    const source = {
      format: "synthetic-v1",
      originalId: "source-1",
      raw: { income: "1.00", description: "Unchanged" },
    };
    await db.transactions.update(original.id, { legacyFields, source });
    const edited = await service.saveTransaction(entry(), {
      id: original.id,
      expectedRevision: original.revision,
    });
    expect(edited.legacyFields).toEqual(legacyFields);
    expect(edited.source).toEqual(source);
    expect((await summary()).expenseCents).toBe(1000);
  });
  it("updates account opening balances explicitly and blocks reinterpreting a posted account type", async () => {
    await service.saveTransaction(entry());
    const changed = await repo.saveAccount(
      shop.id,
      {
        name: bank.name,
        type: bank.type,
        openingBalanceCents: 200000,
        openingDate: bank.openingDate,
        status: "active",
      },
      bank.id,
      bank.revision,
    );
    expect(accountBalance(await readFinance(db), changed, "2026-12-31")).toBe(
      199000,
    );
    await expect(
      repo.saveAccount(
        shop.id,
        {
          name: bank.name,
          type: "Credit Card",
          openingBalanceCents: 200000,
          openingDate: bank.openingDate,
          status: "active",
        },
        bank.id,
        changed.revision,
      ),
    ).rejects.toThrow("type");
  });
  it("edits adjustments through one linked audit event and deletes both effects", async () => {
    await service.saveSale(sale());
    const input = {
      shopId: shop.id,
      stylistId: stylist.id,
      businessDate: date,
      amountCents: 1000,
      reason: "Settlement correction",
      adjustmentKind: "Correction" as const,
      periodMode: "calendar" as const,
    };
    const a = await service.saveAdjustment(input);
    const edited = await service.saveAdjustment(
      { ...input, amountCents: -500 },
      { id: a.id, expectedRevision: a.revision },
    );
    expect(edited.transactionId).toBe(a.transactionId);
    expect(await db.transactions.count()).toBe(2);
    expect((await summary()).outstandingCents).toBe(5501);
    await service.deleteRecord("adjustments", shop.id, a.id, edited.revision);
    expect((await summary()).outstandingCents).toBe(5001);
    expect(
      (await db.transactions.get(a.transactionId!))!.deletedAt,
    ).toBeTruthy();
  });
});

describe("gross commission liabilities", () => {
  it("does not offset one stylist overpayment against a different stylist payable", async () => {
    await service.saveSale(sale());
    const other = await repo.saveStylist(shop.id, {
      name: "Second stylist",
      commissionBasisPoints: 5000,
      status: "active",
    });
    await service.savePayment(
      payment({ stylistId: other.id, amountCents: 9000 }),
    );
    const result = await summary();
    expect(result.outstandingCents).toBe(5001);
    expect(result.overpaidCents).toBe(9000);
    expect(
      commissionSummary(
        await readFinance(db),
        other.id,
        "2026-01-01",
        "2026-12-31",
      ).outstandingCents,
    ).toBe(-9000);
  });
});

describe("reclassification of paired events", () => {
  it("removes obsolete destination references and reverses the old destination effect", async () => {
    const transfer = await service.saveTransaction(
      entry({
        kind: "Transfer",
        destinationAccountId: cash.id,
        amountCents: 1000,
      }),
    );
    const edited = await service.saveTransaction(
      entry({ kind: "Operating expense", amountCents: 2000 }),
      { id: transfer.id, expectedRevision: transfer.revision },
    );
    expect(edited.destinationAccountId).toBeUndefined();
    expect(edited.destinationShopId).toBeUndefined();
    expect(edited.postings).toHaveLength(1);
    expect(accountBalance(await readFinance(db), cash, "2026-12-31")).toBe(0);
    expect((await summary()).expenseCents).toBe(2000);
  });
});
