import { it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FinanceDatabase } from "../database/db";
import { createRepository } from "../database/repository";
import { createFinanceService, readFinance } from "../services/finance";
import { createExchangeService, snapshot } from "../services/exchange";
import {
  completeLegacyMigration,
  prepareLegacyMigration,
} from "../services/legacy-migration";
import {
  ORIGINAL_BARBERS,
  ORIGINAL_HTML_SHA256,
} from "../config/original-business";
import {
  recordedHistory,
  recordedMonthlySeries,
  recordedDailyHistory,
} from "../calculations/recorded-history";
import { historicalBarberEvidence } from "../calculations/historical-payments";
import { sourceTotals } from "../services/exchange/schema";
vi.setConfig({ testTimeout: 60000 });
const databases: FinanceDatabase[] = [];
const fixture =
  process.env.BIG_BOSS_LEGACY_FIXTURE ??
  "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json";
const html =
  process.env.BIG_BOSS_LEGACY_HTML ??
  "/workspace/attachments/ac7cc350-2f77-48ca-8501-3d7d7617f484/Big Boss Hair Salon – Finance.html";
async function setup() {
  const database = new FinanceDatabase("migration-" + crypto.randomUUID());
  databases.push(database);
  const repo = createRepository(database);
  const shop = await repo.createShop({
    name: "Migration test",
    address: "",
    contact: "",
  });
  const exchange = createExchangeService(database);
  return { database, repo, shop, exchange };
}
async function importOriginal(m: Awaited<ReturnType<typeof setup>>) {
  const text = readFileSync(fixture, "utf8");
  expect(createHash("sha256").update(text).digest("hex")).toBe(
    "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a",
  );
  const plan = await m.exchange.previewText(text, {
    targetShopId: m.shop.id,
    useWorker: false,
  });
  await m.exchange.apply(plan.token, {}, { confirmed: true });
}
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
it("verifies the actual HTML roster and service commission behavior without executing it", () => {
  const text = readFileSync(html, "utf8");
  expect(createHash("sha256").update(text).digest("hex")).toBe(
    ORIGINAL_HTML_SHA256,
  );
  const staff = text
    .match(/staff:\[([^\]]+)\]/)?.[1]
    .match(/'([^']+)'/g)
    ?.map((s) => s.slice(1, -1));
  expect(staff).toEqual([...ORIGINAL_BARBERS, "Sale Product"]);
  expect(text).toMatch(/NOCOM=\['Sale Product'\]/);
  expect(text.match(/const rate=n=>([^,;]+)/)?.[1]).toBe(
    "NOCOM.includes(n)?0:.5",
  );
});
it("completes an already-imported original: four stable barbers, all 85 associations, exact financial preservation and no repeat duplicates", async () => {
  const m = await setup();
  await importOriginal(m);
  const before = await snapshot(m.database);
  expect(before.stylists).toHaveLength(0);
  await expect(
    m.exchange.previewText(readFileSync(fixture, "utf8"), {
      targetShopId: m.shop.id,
      mode: "replace",
      useWorker: false,
    }),
  ).rejects.toThrow("Use Merge");
  expect(await m.database.transactions.count()).toBe(968);

  const result = await completeLegacyMigration(m.database, m.shop.id);
  expect(result.created).toBe(4);
  expect(result.identifiable).toBe(85);
  expect(result.linked).toBe(85);
  expect(result.supported + result.review).toBe(85);
  expect(result.supported).toBe(26);
  expect(result.review).toBe(59);
  const after = await snapshot(m.database);
  expect(after.transactions).toHaveLength(968);
  expect(sourceTotals(after)).toEqual(sourceTotals(before));
  expect(after.stylists.map((s) => s.name).sort()).toEqual(
    [...ORIGINAL_BARBERS].sort(),
  );
  expect(after.stylists.every((s) => s.commissionBasisPoints === 5000)).toBe(
    true,
  );
  expect(after.stylists.some((s) => s.name === "Sale Product")).toBe(false);
  expect(after.commissionPayments).toHaveLength(0);
  expect(after.earnings).toHaveLength(0);
  for (const original of before.transactions) {
    const migrated = after.transactions.find((t) => t.id === original.id)!;
    for (const key of [
      "businessDate",
      "description",
      "category",
      "payee",
      "legacyFields",
      "source",
      "amountCents",
      "postings",
      "operatingExpenseCents",
      "revenueCents",
      "commissionExpenseCents",
    ])
      expect(migrated[key]).toEqual(original[key]);
  }
  const expectedCounts = new Map([
    ["Waseem Saleem", 28],
    ["Aeden Kajo", 27],
    ["Steven Hirmiz", 26],
    ["Mattew Burns", 4],
  ]);
  for (const s of after.stylists)
    expect(after.transactions.filter((t) => t.stylistId === s.id)).toHaveLength(
      expectedCounts.get(s.name)!,
    );
  const repeated = await completeLegacyMigration(m.database, m.shop.id);
  expect(repeated.changed).toBe(false);
  expect(repeated.linked).toBe(0);
  expect(repeated.created).toBe(0);
  expect((await snapshot(m.database)).transactions).toEqual(after.transactions);
  const again = await m.exchange.previewText(readFileSync(fixture, "utf8"), {
    targetShopId: m.shop.id,
    useWorker: false,
  });
  expect(again.conflicts).toHaveLength(0);
  await m.exchange.apply(again.token, {}, { confirmed: true });
  expect(
    (await m.database.transactions.toArray()).filter((t) => t.stylistId),
  ).toHaveLength(85);
  const oldRecovery = await m.database.backups.get(result.backupId!);
  const recovered = await setup();
  const oldPlan = await recovered.exchange.previewText(
    JSON.stringify(oldRecovery!.payload),
    { useWorker: false },
  );
  await recovered.exchange.apply(oldPlan.token, {}, { confirmed: true });
  expect(await recovered.database.stylists.count()).toBe(0);
  expect(sourceTotals(await snapshot(recovered.database))).toEqual(
    sourceTotals(before),
  );
  const native = await m.exchange.exportData("all");
  const fresh = await setup();
  const restore = await fresh.exchange.previewText(JSON.stringify(native), {
    useWorker: false,
  });
  expect(restore.conflicts).toHaveLength(0);
  await fresh.exchange.apply(restore.token, {}, { confirmed: true });
  expect(await fresh.database.stylists.count()).toBe(4);
  expect(
    (await fresh.database.transactions.toArray()).filter((t) => t.stylistId),
  ).toHaveLength(85);
  expect(sourceTotals(await snapshot(fresh.database))).toEqual(
    sourceTotals(before),
  );
  expect(createHash("sha256").update(readFileSync(fixture)).digest("hex")).toBe(
    "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a",
  );
});
it("preserves configured barber rates, rejects ambiguous duplicate matches, and keeps unrelated businesses isolated", async () => {
  const m = await setup();
  await importOriginal(m);
  await m.repo.saveStylist(m.shop.id, {
    name: ORIGINAL_BARBERS[0],
    commissionBasisPoints: 6000,
    status: "active",
  });
  const other = await setup();
  await completeLegacyMigration(m.database, m.shop.id);
  expect(
    (await m.database.stylists.toArray()).find(
      (s) => s.name === ORIGINAL_BARBERS[0],
    )?.commissionBasisPoints,
  ).toBe(6000);
  expect(await other.database.stylists.count()).toBe(0);
  expect(await other.database.transactions.count()).toBe(0);
  await m.repo.saveStylist(m.shop.id, {
    name: ORIGINAL_BARBERS[0],
    commissionBasisPoints: 5000,
    status: "active",
  });
  const before = await snapshot(m.database);
  await expect(completeLegacyMigration(m.database, m.shop.id)).rejects.toThrow(
    "More than one",
  );
  expect(await snapshot(m.database)).toEqual(before);
});
it("retains durable recovery on failed migration and never applies a stale preview", async () => {
  const m = await setup();
  await importOriginal(m);
  const plan = await prepareLegacyMigration(m.database, m.shop.id);
  await m.repo.setPreference("theme", "dark");
  await expect(
    completeLegacyMigration(m.database, m.shop.id, plan),
  ).rejects.toThrow("changed");
  expect(await m.database.stylists.count()).toBe(0);
  expect(
    (await m.database.backups.toArray()).some(
      (b) => b.reason === "Before Complete Legacy Migration",
    ),
  ).toBe(true);
  const before = await m.database.transactions.toArray();
  const hook = () => {
    throw new Error("Forced migration failure");
  };
  m.database.stylists.hook("creating", hook);
  try {
    await expect(
      completeLegacyMigration(m.database, m.shop.id),
    ).rejects.toThrow("Forced migration failure");
  } finally {
    m.database.stylists.hook("creating").unsubscribe(hook);
  }
  expect(await m.database.stylists.count()).toBe(0);
  expect(await m.database.transactions.toArray()).toEqual(before);
});
it("keeps recorded history visible before/after classification, excludes deleted/out-of-scope rows and adds new sales only once", async () => {
  const m = await setup();
  await importOriginal(m);
  await completeLegacyMigration(m.database, m.shop.id);
  const data = await readFinance(m.database);
  const before = recordedHistory(data, m.shop.id, "2026-01-01", "2026-12-31");
  expect(before.sourceCount).toBe(968);
  expect(before.revenueCents).toBeGreaterThan(0);
  expect(before.expenseCents).toBeGreaterThan(0);
  const daily = recordedDailyHistory(
    data,
    m.shop.id,
    "2026-01-01",
    "2026-12-31",
  );
  expect(daily.reduce((sum, d) => sum + d.income, 0)).toBe(before.revenueCents);
  expect(daily.reduce((sum, d) => sum + d.expense, 0)).toBe(
    before.expenseCents,
  );
  expect(daily.reduce((sum, d) => sum + d.count, 0)).toBe(968);

  expect(
    recordedMonthlySeries(data, m.shop.id, "2026-01-01", "2026-12-31").reduce(
      (a, p) => a + p.revenue,
      0,
    ),
  ).toBe(before.revenueCents);
  const row = data.transactions.find((t) => (t.legacyFields?.income ?? 0) > 0)!;
  row.accountingStatus = "classified";
  row.revenueCents = row.legacyFields!.income;
  const after = recordedHistory(data, m.shop.id, "2026-01-01", "2026-12-31");
  expect(after.revenueCents).toBe(before.revenueCents);
  expect(after.classifiedHistorical).toBe(1);
  expect(after.unreviewed).toBe(967);
  const account = await m.repo.saveAccount(m.shop.id, {
    name: "New till",
    type: "Cash",
    openingBalanceCents: 0,
    openingDate: "2026-01-01",
    status: "active",
  });
  const stylist = (await m.database.stylists.toArray())[0];
  await createFinanceService(m.database).saveSale({
    shopId: m.shop.id,
    businessDate: "2026-10-25",
    productCents: 2000,
    cardCents: 0,
    cashCents: 12000,
    cashVerified: true,
    cashAccountId: account.id,
    cardAccountId: account.id,
    notes: "Synthetic new day",
    stylistAllocations: [{ stylistId: stylist.id, serviceCents: 10000 }],
  });
  const next = await readFinance(m.database);
  const combined = recordedHistory(next, m.shop.id, "2026-01-01", "2026-12-31");
  expect(combined.revenueCents).toBe(before.revenueCents + 12000);
  expect(combined.expenseCents).toBe(before.expenseCents + 5000);
  expect((await m.database.earnings.toArray())[0].amountCents).toBe(5000);
  expect((await m.database.dailySales.toArray())[0].productCents).toBe(2000);
});
it("distinguishes payable/expense-only records, explicit supported payments and contradictory splits without inferring cash", () => {
  const row = (description: string, expense: number, bankDebit: number) =>
    ({
      category: "Contract Labour",
      description,
      legacyFields: { expense, bankDebit },
    }) as Parameters<typeof historicalBarberEvidence>[0];
  expect(
    historicalBarberEvidence(row("Amount payable", 10000, 0))
      ?.supportedPaymentCents,
  ).toBe(0);
  expect(
    historicalBarberEvidence(row("Name only", 10000, 0))?.needsReview,
  ).toBe(true);
  expect(
    historicalBarberEvidence(row("Cash 40 + 60 Bank", 10000, 6000))
      ?.supportedPaymentCents,
  ).toBe(10000);
  expect(
    historicalBarberEvidence(row("Cash 40 + 60 Bank", 10000, 5000))
      ?.supportedPaymentCents,
  ).toBe(0);
  expect(
    historicalBarberEvidence(row("Cash 100", 10000, 0))?.supportedPaymentCents,
  ).toBe(10000);
  expect(
    historicalBarberEvidence(row("Name", 10000, 10000))?.supportedPaymentCents,
  ).toBe(10000);
  expect(historicalBarberEvidence(row("Name", 0, 10000))?.needsReview).toBe(
    true,
  );
  expect(historicalBarberEvidence(row("Cash", 10000, 10000))?.needsReview).toBe(
    true,
  );
  expect(
    historicalBarberEvidence(row("Cash 1,000.00", 100000, 0))
      ?.supportedPaymentCents,
  ).toBe(100000);
  expect(
    historicalBarberEvidence(row("100.123 Cash", 12300, 0))
      ?.supportedPaymentCents,
  ).toBe(0);
  expect(
    historicalBarberEvidence(row("Cash 999999999999999999999999999", 10000, 0))
      ?.needsReview,
  ).toBe(true);
});

it("keeps deleted, out-of-period and other-business historical fields out of recorded summaries", () => {
  const rows = [
    {
      shopId: "a",
      businessDate: "2026-06-10",
      legacyFields: { income: 10000, expense: 2000, bankDebit: 90000 },
    },
    {
      shopId: "b",
      businessDate: "2026-06-10",
      legacyFields: { income: 99999 },
    },
    {
      shopId: "a",
      businessDate: "2025-06-10",
      legacyFields: { income: 99999 },
    },
    {
      shopId: "a",
      businessDate: "2026-06-10",
      deletedAt: "2026-06-11T00:00:00.000Z",
      legacyFields: { income: 99999 },
    },
    {
      shopId: "a",
      businessDate: "2026-06-10",
      accountingStatus: "classified",
      revenueCents: 3000,
      operatingExpenseCents: 1000,
    },
  ];
  const data = {
    accounts: [],
    transactions: rows,
    dailySales: [],
    earnings: [],
    payments: [],
    adjustments: [],
    stylists: [],
    reconciliations: [],
  } as unknown as Parameters<typeof recordedHistory>[0];
  const result = recordedHistory(data, "a", "2026-01-01", "2026-12-31");
  expect(result.revenueCents).toBe(13000);
  expect(result.expenseCents).toBe(3000);
  expect(result.bankDebitCents).toBe(90000);
  expect(result.sourceCount).toBe(1);
  expect(result.unreviewed).toBe(1);
});
