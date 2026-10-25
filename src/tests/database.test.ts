import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { FinanceDatabase, schemaV3 } from "../database/db";
import { createRepository } from "../database/repository";
import {
  shopSchema,
  accountSchema,
  stylistSchema,
  transactionSchema,
  dateOnly,
} from "../models";
import { parseMoney, moneyInput } from "../calculations/money";
import {
  transactionDraftSchema,
  dailySalesDraftSchema,
} from "../validation/forms";
let db: FinanceDatabase;
let repo: ReturnType<typeof createRepository>;
const shopInput = {
  name: "Downtown",
  address: "123 Main Street",
  contact: "Owner",
};
beforeEach(async () => {
  db = new FinanceDatabase(`test-${crypto.randomUUID()}`);
  repo = createRepository(db);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});
describe("Stage 1 local database", () => {
  it("initializes every version 3 table without seeded financial data", async () => {
    expect(db.verno).toBe(3);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      Object.keys(schemaV3).sort(),
    );
    for (const table of db.tables) expect(await table.count()).toBe(0);
    expect(
      db.transactions.schema.indexes.some(
        (i) => i.name === "[shopId+businessDate]",
      ),
    ).toBe(true);
  });
  it("creates, edits, archives and restores a stable shop with revisions", async () => {
    const shop = await repo.createShop(shopInput);
    expect(shopSchema.safeParse(shop).success).toBe(true);
    const edited = await repo.editShop(
      shop.id,
      { ...shopInput, name: "Uptown" },
      shop.revision,
    );
    expect(edited.id).toBe(shop.id);
    expect(edited.createdAt).toBe(shop.createdAt);
    expect(edited.revision).not.toBe(shop.revision);
    await repo.setShopStatus(shop.id, "archived", edited.revision);
    const archived = (await db.shops.get(shop.id))!;
    expect(archived.status).toBe("archived");
    await repo.setShopStatus(shop.id, "active", archived.revision);
    expect((await db.shops.get(shop.id))!.status).toBe("active");
    expect(await db.revisions.count()).toBe(4);
  });
  it("rejects stale edits without overwriting a changed record", async () => {
    const shop = await repo.createShop(shopInput);
    await repo.editShop(
      shop.id,
      { ...shopInput, name: "New name" },
      shop.revision,
    );
    await expect(
      repo.editShop(shop.id, shopInput, shop.revision),
    ).rejects.toThrow("changed");
    expect((await db.shops.get(shop.id))!.name).toBe("New name");
  });
  it("switches between shops and All Locations and persists theme preferences", async () => {
    const a = await repo.createShop(shopInput);
    const b = await repo.createShop({ ...shopInput, name: "West" });
    await repo.selectShop(a.id);
    expect((await db.settings.get("activeShop"))!.value).toBe(a.id);
    await repo.selectShop(b.id);
    expect((await db.settings.get("activeShop"))!.value).toBe(b.id);
    await repo.selectShop("all");
    await repo.setPreference("theme", "dark");
    const name = db.name;
    db.close();
    db = new FinanceDatabase(name);
    repo = createRepository(db);
    await db.open();
    expect((await db.settings.get("activeShop"))!.value).toBe("all");
    expect((await db.settings.get("theme"))!.value).toBe("dark");
  });
  it("preserves shop, edited stylist, and edited account after reopening the database", async () => {
    const shop = await repo.createShop(shopInput);
    const stylist = await repo.saveStylist(shop.id, {
      name: "Alex",
      commissionBasisPoints: 5000,
      status: "active",
    });
    const account = await repo.saveAccount(shop.id, {
      name: "Operating",
      type: "Chequing",
      openingBalanceCents: 12345,
      openingDate: "2026-10-24",
      status: "active",
    });
    await repo.saveStylist(
      shop.id,
      { name: "Alex S", commissionBasisPoints: 5250, status: "inactive" },
      stylist.id,
      stylist.revision,
    );
    await repo.saveAccount(
      shop.id,
      {
        name: "Main operating",
        type: "Chequing",
        openingBalanceCents: 12345,
        openingDate: "2026-10-24",
        status: "archived",
      },
      account.id,
      account.revision,
    );
    const name = db.name;
    db.close();
    db = new FinanceDatabase(name);
    repo = createRepository(db);
    await db.open();
    expect((await db.shops.get(shop.id))!.name).toBe("Downtown");
    expect(stylistSchema.parse(await db.stylists.get(stylist.id)).status).toBe(
      "inactive",
    );
    expect(accountSchema.parse(await db.accounts.get(account.id)).name).toBe(
      "Main operating",
    );
    expect((await db.accounts.get(account.id))!.openingBalanceCents).toBe(
      12345,
    );
  });
  it("isolates location queries and blocks cross-location edits", async () => {
    const a = await repo.createShop(shopInput);
    const b = await repo.createShop({ ...shopInput, name: "West" });
    const stylist = await repo.saveStylist(a.id, {
      name: "Alex",
      commissionBasisPoints: 5000,
      status: "active",
    });
    const account = await repo.saveAccount(a.id, {
      name: "Cash",
      type: "Cash",
      openingBalanceCents: 0,
      openingDate: "2026-10-24",
      status: "active",
    });
    expect(await repo.listOwned("stylists", b.id)).toHaveLength(0);
    expect(await repo.listOwned("stylists", a.id)).toHaveLength(1);
    expect(await repo.listOwned("accounts", "all")).toHaveLength(1);
    await expect(
      repo.saveStylist(
        b.id,
        { name: "Wrong", commissionBasisPoints: 0, status: "active" },
        stylist.id,
        stylist.revision,
      ),
    ).rejects.toThrow("belong");
    await expect(
      repo.saveAccount(
        b.id,
        {
          name: "Wrong",
          type: "Cash",
          openingBalanceCents: 0,
          openingDate: "2026-10-24",
          status: "active",
        },
        account.id,
        account.revision,
      ),
    ).rejects.toThrow("belong");
    expect((await db.stylists.get(stylist.id))!.name).toBe("Alex");
    expect(await db.revisions.count()).toBe(5);
  });
  it("archiving preserves related records and prevents new profile writes", async () => {
    const shop = await repo.createShop(shopInput);
    await repo.saveStylist(shop.id, {
      name: "Alex",
      commissionBasisPoints: 5000,
      status: "active",
    });
    await repo.setShopStatus(shop.id, "archived", shop.revision);
    expect(await repo.listOwned("stylists", shop.id)).toHaveLength(1);
    await expect(
      repo.saveStylist(shop.id, {
        name: "New",
        commissionBasisPoints: 0,
        status: "active",
      }),
    ).rejects.toThrow("active shop");
    await expect(repo.selectShop(shop.id)).rejects.toThrow("active shop");
  });
  it("rolls back a profile write if revision persistence fails", async () => {
    const shop = await repo.createShop(shopInput);
    db.revisions.hook("creating", () => {
      throw new Error("Simulated storage failure");
    });
    await expect(
      repo.saveStylist(shop.id, {
        name: "Alex",
        commissionBasisPoints: 5000,
        status: "active",
      }),
    ).rejects.toThrow("Simulated");
    expect(await db.stylists.count()).toBe(0);
    expect(await db.revisions.count()).toBe(1);
  });
});
describe("validated values and future contracts", () => {
  it("rejects missing shop names, whitespace names, invalid rates and invalid dates", async () => {
    await expect(
      repo.createShop({ ...shopInput, name: "  " }),
    ).rejects.toThrow();
    const shop = await repo.createShop(shopInput);
    await expect(
      repo.saveStylist(shop.id, {
        name: "Alex",
        commissionBasisPoints: 10001,
        status: "active",
      }),
    ).rejects.toThrow();
    expect(dateOnly.safeParse("2026-02-30").success).toBe(false);
    expect(dateOnly.safeParse("2024-02-29").success).toBe(true);
    expect(transactionDraftSchema.safeParse({}).success).toBe(false);
    expect(dailySalesDraftSchema.safeParse({}).success).toBe(false);
  });
  it("parses money exactly, preserves precision and rejects unsafe or excess precision input", () => {
    expect(parseMoney("123456.78")).toBe(12345678);
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("-12.01")).toBe(-1201);
    expect(moneyInput(-1201)).toBe("-12.01");
    expect(() => parseMoney("1.001")).toThrow();
    expect(() => parseMoney("900719925474099.99")).toThrow();
    expect(() => parseMoney("1e3")).toThrow();
  });
  it("keeps independent legacy fields without collapsing amounts", () => {
    const id = crypto.randomUUID();
    const date = new Date().toISOString();
    const record = transactionSchema.parse({
      id,
      shopId: crypto.randomUUID(),
      createdAt: date,
      updatedAt: date,
      revision: crypto.randomUUID(),
      businessDate: "2026-10-24",
      kind: "Needs review",
      amountCents: 0,
      category: "",
      payee: "",
      description: "Synthetic test only",
      paymentMethod: "",
      notes: "",
      legacyFields: {
        income: 101,
        expense: 202,
        bankCredit: 303,
        bankDeposit: 404,
        bankDebit: 505,
      },
    });
    expect(record.legacyFields).toEqual({
      income: 101,
      expense: 202,
      bankCredit: 303,
      bankDeposit: 404,
      bankDebit: 505,
    });
  });
});
