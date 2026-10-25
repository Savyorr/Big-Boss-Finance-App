import { createExchangeService } from "../services/exchange";
import { afterEach, expect, it } from "vitest";
import { FinanceDatabase } from "../database/db";
import {
  createBusinessProfile,
  listBusinessProfiles,
} from "../services/business-profiles";
import { createRepository } from "../database/repository";
import { createFinanceService, readFinance } from "../services/finance";
import { importedHistory } from "../calculations/imported-history";
const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) {
    const db = new FinanceDatabase(name);
    await db.delete();
  }
});
it("creates independent databases, including separate barbers, transactions, preferences and exports", async () => {
  const a = await createBusinessProfile("Independent A"),
    b = await createBusinessProfile("Independent B");
  names.push(a.database, b.database);
  const first = new FinanceDatabase(a.database),
    second = new FinanceDatabase(b.database);
  try {
    const shop = (await first.shops.toArray())[0];
    const repo = createRepository(first);
    await repo.saveStylist(shop.id, {
      name: "Only A barber",
      commissionBasisPoints: 5000,
      status: "active",
    });
    const account = await repo.saveAccount(shop.id, {
      name: "A bank",
      type: "Chequing",
      openingBalanceCents: 10000,
      openingDate: "2026-01-01",
      status: "active",
    });
    await createFinanceService(first).saveTransaction({
      shopId: shop.id,
      accountId: account.id,
      businessDate: "2026-06-10",
      kind: "Revenue",
      amountCents: 1234,
      category: "Service",
      payee: "",
      description: "A sale",
      paymentMethod: "Cash",
      notes: "",
    });
    await repo.setPreference("theme", "dark");
    expect(await second.stylists.count()).toBe(0);
    expect(await second.transactions.count()).toBe(0);
    expect(await second.settings.get("theme")).toBeUndefined();
    expect((await readFinance(first)).transactions).toHaveLength(1);
    const exported = await createExchangeService(first).exportData("all");
    expect(
      exported.data.settings.some((s) => s.key === "businessProfileName"),
    ).toBe(false);
    expect(exported.data.stylists).toHaveLength(1);
    await expect(createBusinessProfile(" independent a ")).rejects.toThrow(
      "already exists",
    );
    const profiles = await listBusinessProfiles();
    expect(profiles.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Independent A", "Independent B"]),
    );
  } finally {
    first.close();
    second.close();
  }
});
it("discovers the original database without modifying any financial or recovery data", async () => {
  const legacy = new FinanceDatabase("big-boss-finance");
  names.push(legacy.name);
  const repo = createRepository(legacy);
  await repo.createShop({
    name: "Existing business",
    address: "",
    contact: "",
  });
  const before = await Promise.all(legacy.tables.map((t) => t.toArray()));
  expect(
    (await listBusinessProfiles()).find((p) => p.database === legacy.name)
      ?.name,
  ).toBe("Existing business");
  expect(await Promise.all(legacy.tables.map((t) => t.toArray()))).toEqual(
    before,
  );
  legacy.close();
});
it("shows imported source fields without treating withdrawals as expense or duplicating classified/deleted records", () => {
  const data = {
    accounts: [],
    dailySales: [],
    earnings: [],
    payments: [],
    adjustments: [],
    stylists: [],
    reconciliations: [],
    transactions: [
      {
        shopId: "a",
        businessDate: "2026-06-10",
        accountingStatus: "review",
        legacyFields: {
          income: 10000,
          expense: 2000,
          bankCredit: 9000,
          bankDeposit: 8000,
          bankDebit: 75000,
        },
      },
      {
        shopId: "b",
        businessDate: "2026-06-10",
        accountingStatus: "review",
        legacyFields: { income: 50000 },
      },
      {
        shopId: "a",
        businessDate: "2026-06-10",
        accountingStatus: "classified",
        legacyFields: { income: 12345 },
      },
      {
        shopId: "a",
        businessDate: "2026-06-10",
        deletedAt: "2026-06-11",
        legacyFields: { income: 99999 },
      },
      {
        shopId: "a",
        businessDate: "2025-06-10",
        legacyFields: { income: 99999 },
      },
    ],
  } as unknown as Parameters<typeof importedHistory>[0];
  expect(importedHistory(data, "a", "2026-01-01", "2026-12-31")).toEqual({
    count: 1,
    income: 10000,
    expense: 2000,
    bankCredit: 9000,
    bankDeposit: 8000,
    bankDebit: 75000,
  });
});

it("restores a full backup into an empty profile without conflicting on local chooser labels", async () => {
  const source = await createBusinessProfile("Source business");
  const destination = await createBusinessProfile("Restore destination", true);
  names.push(source.database, destination.database);
  const a = new FinanceDatabase(source.database),
    b = new FinanceDatabase(destination.database);
  try {
    const exported = await createExchangeService(a).exportData("all");
    const exchange = createExchangeService(b);
    const plan = await exchange.previewText(JSON.stringify(exported), {
      useWorker: false,
    });
    expect(plan.conflicts).toHaveLength(0);
    await exchange.apply(plan.token, {}, { confirmed: true });
    expect((await b.shops.toArray()).map((s) => s.name)).toEqual([
      "Source business",
    ]);
    expect((await b.settings.get("businessProfileName"))?.value).toBe(
      "Restore destination",
    );
    expect(
      (await listBusinessProfiles()).find(
        (p) => p.database === destination.database,
      )?.name,
    ).toBe("Restore destination");
  } finally {
    a.close();
    b.close();
  }
});
