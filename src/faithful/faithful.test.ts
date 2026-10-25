import { describe, it, expect, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  BusinessDB,
  createBusiness,
  exported,
  write,
  revised,
  remove,
  planImport,
  applyPlan,
  profiles,
} from "./store";
import { readImport, readWorkbook } from "./import";
import {
  summary,
  previousMonth,
  period,
  periodEnd,
  earned,
  dayCommission,
  rows,
  sourceTotals,
  settings,
  bankAt,
  type Day,
  parseMoney,
} from "./model";
import { canonical } from "../services/exchange/json";
import { ORIGINAL_BARBERS } from "../config/original-business";
const opened: BusinessDB[] = [];
async function business(name = "Synthetic shop", original = false) {
  const p = await createBusiness(name, original),
    db = new BusinessDB(p.id);
  opened.push(db);
  return db;
}
afterEach(async () => {
  for (const d of opened.splice(0)) {
    d.close();
    await d.delete();
  }
  await profiles.clear();
});
const day = (
  date: string,
  sales: Record<string, number>,
  product = 0,
  card = 0,
): Day => ({
  date,
  sales,
  rates: Object.fromEntries(Object.keys(sales).map((k) => [k, 5000])),
  product,
  total: Object.values(sales).reduce((a, b) => a + b, product),
  card,
  deposit: 0,
  notes: "",
});
describe("faithful original calculations", () => {
  it("uses the local previous completed month including January and timezone boundary", () => {
    expect(previousMonth(new Date(2026, 9, 25))).toBe("2026-09");
    expect(previousMonth(new Date(2026, 0, 1))).toBe("2025-12");
    expect(previousMonth(new Date(2026, 2, 1, 0, 1))).toBe("2026-02");
  });
  it("keeps original earnings cutoff15, payment/adjustment cutoff22 and period endpoints", () => {
    expect(period("2026-06-15")).toBe("2026-06 H1");
    expect(period("2026-06-16")).toBe("2026-06 H2");
    expect(period("2026-06-22", true)).toBe("2026-06 H1");
    expect(period("2026-06-23", true)).toBe("2026-06 H2");
    expect(periodEnd("2028-02 H2")).toBe("2028-02-29");
  });
  it("rounds aggregate half-cent commission once and excludes product sales", () => {
    const a = day("2026-09-01", { a: 1, b: 1 }, 10000);
    expect(dayCommission(a)).toBe(1);
    expect(earned([a, day("2026-09-02", { a: 1 })], "a")).toBe(1);
    expect(earned([a], "a")).toBe(1);
  });
  it("records cash as total less card, including negative cash as original permits", async () => {
    const db = await business("Big Boss"),
      staff = rows((await exported(db)).records, "staff")[0];
    const d = day("2026-09-01", { [staff.id]: 10000 }, 2000, 15000);
    await write(db, revised("day", "d", d));
    expect(d.total - d.card).toBe(-3000);
    const r = summary((await exported(db)).records, "2026-09");
    expect(r).toMatchObject({ revenue: 12000, expenses: 0, profit: 12000 });
    expect(dayCommission(d)).toBe(5000);
  });
  it("does not double-count overlapping daily totals and imported income or commission", async () => {
    const db = await business("Big Boss"),
      all = (await exported(db)).records,
      s = rows(all, "staff")[0];
    await write(db, revised("day", "d", day("2026-09-01", { [s.id]: 10000 })));
    await write(
      db,
      revised("tx", "t", {
        date: "2026-09-01",
        type: "Income",
        category: "Revenue",
        sub: "",
        payee: "Shop",
        details: "",
        income: 10000,
        expense: 5000,
        bankCredit: 10000,
        bankDeposit: 0,
        bankDebit: 5000,
        notes: "",
      }),
    );
    const a = (await exported(db)).records;
    expect(summary(a, "2026-09")).toMatchObject({
      revenue: 10000,
      expenses: 5000,
      profit: 5000,
      overlaps: ["2026-09-01"],
    });
    const old = rows(a, "settings")[0];
    await write(
      db,
      revised(
        "settings",
        old.id,
        { ...old.value, overlaps: { "2026-09-01": "both" } },
        old,
      ),
    );
    expect(summary((await exported(db)).records, "2026-09").revenue).toBe(
      20000,
    );
  });
  it("rejects overprecision and out-of-range money instead of rounding", () => {
    expect(() => parseMoney("0.001")).toThrow();
    expect(() => parseMoney("900719925474099.99")).toThrow();
  });
});
describe("required original references and lossless import", () => {
  it("inspects the exact original HTML and all 968 original JSON records; restores staff and five sums", async () => {
    const html = await readFile(
      process.env.BIG_BOSS_LEGACY_HTML ??
        "/workspace/attachments/ac7cc350-2f77-48ca-8501-3d7d7617f484/Big Boss Hair Salon – Finance.html",
    );
    expect(createHash("sha256").update(html).digest("hex")).toBe(
      "fcea5106b30636ab2ecf17d108642ce12b5d9c4011083aca8f640520a5f3f31d",
    );
    for (const n of ORIGINAL_BARBERS) expect(html.toString()).toContain(n);
    expect(html.toString()).toContain("const rate=n=>NOCOM.includes(n)?0:.5");
    const file = await readFile(
      process.env.BIG_BOSS_LEGACY_FIXTURE ??
        "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json",
      "utf8",
    );
    expect(createHash("sha256").update(file).digest("hex")).toBe(
      "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a",
    );
    const expected = JSON.parse(
      await readFile(
        process.env.BIG_BOSS_LEGACY_EXPECTED ??
          "private/legacy-expected-totals.json",
        "utf8",
      ),
    );
    const db = await business("Big Boss Hair Salon");
    expect(rows((await exported(db)).records, "staff")).toHaveLength(4);
    const imported = await readImport(file, await exported(db));
    await applyPlan(db, await planImport(db, imported.envelope), {});
    const after = await exported(db),
      tx = rows(after.records, "tx");
    expect(tx).toHaveLength(968);
    expect(new Set(tx.map((x) => x.id)).size).toBe(968);
    expect(sourceTotals(after.records)).toEqual(expected);
    const original = JSON.parse(file).transactions;
    expect(
      tx
        .map((t) => t.value.raw)
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
    ).toEqual(original.sort((a: any, b: any) => a.id.localeCompare(b.id)));
    expect(tx.filter((t) => t.value.staffId)).toHaveLength(85);
    expect(rows(after.records, "day")).toHaveLength(0);
    expect(
      rows(after.records, "staff")
        .map((s) => s.value.name)
        .sort(),
    ).toEqual([...ORIGINAL_BARBERS].sort());
    const monthly = summary(after.records, "2026-09");
    const src = original.filter((t: any) => t.date.startsWith("2026-09"));
    expect(monthly.revenue).toBe(
      src.reduce((a: number, t: any) => a + parseMoney(String(t.income)), 0),
    );
    expect(monthly.expenses).toBe(
      src.reduce((a: number, t: any) => a + parseMoney(String(t.expense)), 0),
    );
    const again = await readImport(file, after);
    await applyPlan(db, await planImport(db, again.envelope), {});
    expect(canonical((await exported(db)).records)).toBe(
      canonical(after.records),
    );
    const fresh = await business("Big Boss");
    await applyPlan(fresh, await planImport(fresh, after), {});
    expect((await exported(fresh)).records).toEqual(after.records);
    expect(sourceTotals((await exported(fresh)).records)).toEqual(expected);
  }, 60000);
  it("restores original HTML backup staff, dates, payments, adjustments and banking without private seeded balances", async () => {
    const db = await business();
    const legacy = {
      days: [
        {
          date: "2026-06-15",
          total: 120,
          card: 50,
          deposit: 10,
          sales: { "Steven Hirmiz": 100, "Sale Product": 20 },
          notes: "Synthetic",
        },
      ],
      tx: [
        {
          id: "p",
          date: "2026-06-22",
          account: "Expense",
          cat: "Contract Labour",
          name: "Steven Hirmiz",
          details: "Synthetic",
          income: 0,
          expense: 40,
          credit: 0,
          deposit: 0,
          debit: 40,
        },
      ],
      staff: [...ORIGINAL_BARBERS, "Sale Product"],
      open: 7,
      bal: {
        asOf: "2026-06-01",
        limit: 150,
        items: [{ n: "Operating Line", v: -20 }],
      },
      adj: [
        {
          id: "a",
          date: "2026-06-22",
          name: "Steven Hirmiz",
          amt: 10,
          note: "Synthetic",
        },
      ],
    };
    const r = await readImport(JSON.stringify(legacy), await exported(db));
    await applyPlan(db, await planImport(db, r.envelope), {});
    const all = (await exported(db)).records;
    expect(rows(all, "staff")).toHaveLength(4);
    const s = rows(all, "staff").find((s) => s.value.name === "Steven Hirmiz")!;
    expect(
      earned(
        rows(all, "day").map((d) => d.value),
        s.id,
      ),
    ).toBe(5000);
    expect(rows(all, "adjustment")[0].value.amount).toBe(1000);
    expect(bankAt(all, "2026-06-30")).toBe(2700);
    expect(summary(all, "2026-06")).toMatchObject({
      revenue: 12000,
      expenses: 4000,
      profit: 8000,
    });
    expect(settings(all).opening).toBe(700);
  });
  it("rejects duplicate IDs, invalid dates and unsupported decimal precision before any writes", async () => {
    const db = await business();
    const baseline = await exported(db);
    const raw = {
      app: "Big Boss Hair Salon Finance",
      transactions: [{ id: "a", date: "2026-02-30", income: 0, expense: 0 }],
    };
    await expect(readImport(JSON.stringify(raw), baseline)).rejects.toThrow();
    raw.transactions[0].date = "2026-02-28";
    raw.transactions[0].expense = 0.001;
    await expect(readImport(JSON.stringify(raw), baseline)).rejects.toThrow();
    expect((await exported(db)).records).toEqual(baseline.records);
  });
  it("recreates original monthly workbook and Journal extraction, offline dependency bundled", async () => {
    const XLSX = await import("xlsx"),
      wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          "Date",
          "Account",
          "Account Name",
          "Name",
          "Details",
          "Income",
          "Expense",
          "Credits",
          "Deposits",
          "Debits",
        ],
        ["2026-06-15", "Income", "Revenue", "Synthetic", "", 120, 0, 50, 0, 0],
        [
          "2026-06-22",
          "Expense",
          "Contract Labour",
          "Steven Hirmiz",
          "",
          0,
          50,
          0,
          0,
          50,
        ],
      ]),
      "Jun-26",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Date", "Name", "Total Amount"],
        ["2026-06-15", "1-Steven Hirmiz", 100],
        ["2026-06-15", "Sale Product", 20],
      ]),
      "Journal",
    );
    const db = await business(),
      result = await readWorkbook(
        XLSX.write(wb, { type: "array", bookType: "xlsx" }),
        await exported(db),
      );
    await applyPlan(db, await planImport(db, result.envelope), {});
    const all = (await exported(db)).records;
    expect(summary(all, "2026-06")).toMatchObject({
      revenue: 12000,
      expenses: 5000,
      profit: 7000,
    });
    expect(rows(all, "tx")).toHaveLength(1);
    expect(rows(all, "day")[0].value.card).toBe(5000);
  });
});
describe("owner exchange and data safeguards", () => {
  it("combines 100 original records and 20 new records into 120 unique records", async () => {
    const a = await business(),
      base = await exported(a);
    for (let i = 0; i < 100; i++)
      base.records.push(
        revised("tx", "t" + i, {
          date: "2026-06-01",
          type: "Expense",
          category: "Synthetic",
          sub: "",
          payee: "",
          details: "",
          income: 0,
          expense: 100,
          bankCredit: 0,
          bankDeposit: 0,
          bankDebit: 0,
          notes: "",
        }),
      );
    await applyPlan(a, await planImport(a, base), {});
    const b = await business();
    await applyPlan(b, await planImport(b, await exported(a)), {});
    for (let i = 100; i < 120; i++)
      await write(
        b,
        revised("tx", "t" + i, {
          date: "2026-06-01",
          type: "Expense",
          category: "Synthetic",
          sub: "",
          payee: "",
          details: "",
          income: 0,
          expense: 100,
          bankCredit: 0,
          bankDeposit: 0,
          bankDebit: 0,
          notes: "",
        }),
      );
    const incoming = await exported(b);
    await applyPlan(a, await planImport(a, incoming), {});
    await applyPlan(a, await planImport(a, incoming), {});
    expect(rows((await exported(a)).records, "tx")).toHaveLength(120);
  });
  it("detects independent edits, merges chosen revision ancestry, and prevents an older export resurrecting deletion", async () => {
    const a = await business();
    const t = revised("tx", "t", {
      date: "2026-06-01",
      type: "Expense",
      category: "Synthetic",
      sub: "",
      payee: "",
      details: "",
      income: 0,
      expense: 100,
      bankCredit: 0,
      bankDeposit: 0,
      bankDebit: 0,
      notes: "",
    });
    await write(a, t);
    const b = await business();
    await applyPlan(b, await planImport(b, await exported(a)), {});
    const left =
      t.kind === "tx" ? revised("tx", "t", { ...t.value, expense: 200 }, t) : t;
    const right =
      t.kind === "tx" ? revised("tx", "t", { ...t.value, expense: 300 }, t) : t;
    await write(a, left);
    await write(b, right);
    const plan = await planImport(a, await exported(b));
    expect(plan.conflicts).toHaveLength(1);
    await expect(applyPlan(a, plan, {})).rejects.toThrow();
    expect(await a.records.get("t")).toEqual(left);
    await applyPlan(a, plan, { t: "incoming" });
    const chosen = (await a.records.get("t"))!;
    expect(chosen.ancestors).toContain(left.revision);
    expect(chosen.ancestors).toContain(right.revision);
    const old = await exported(a);
    await remove(a, chosen);
    await applyPlan(a, await planImport(a, old), {});
    expect((await a.records.get("t"))!.deleted).toBe(true);
    expect(rows((await exported(a)).records, "tx")).toHaveLength(0);
    expect(await a.backups.count()).toBeGreaterThan(0);
  });
  it("refuses cross-business merge and keeps new profiles independent", async () => {
    const a = await business("Big Boss"),
      b = await business("Other");
    expect(rows((await exported(b)).records, "staff")).toHaveLength(0);
    const old = (await b.records.get("settings"))!;
    if (old.kind !== "settings") throw Error();
    await write(
      b,
      revised("settings", old.id, { ...old.value, name: "Other renamed" }, old),
    );
    await write(
      b,
      revised("staff", "other", {
        name: "Other person",
        active: true,
        rate: 5000,
      }),
    );
    await expect(planImport(b, await exported(a))).rejects.toThrow(
      "different business",
    );
    expect(rows((await exported(a)).records, "staff")).toHaveLength(4);
  });
  it("retains a recovery backup and rejects stale previews atomically", async () => {
    const a = await business(),
      file = await exported(a),
      plan = await planImport(a, file);
    const old = (await a.records.get("settings"))!;
    if (old.kind !== "settings") throw Error();
    await write(
      a,
      revised("settings", old.id, { ...old.value, name: "Changed" }, old),
    );
    const before = await exported(a);
    await expect(applyPlan(a, plan, {})).rejects.toThrow(
      "changed after preview",
    );
    expect((await exported(a)).records).toEqual(before.records);
    expect(await a.backups.count()).toBe(1);
  });
  it("rejects changing a record based on stale state in another window", async () => {
    const db = await business(),
      old = (await db.records.get("settings"))!;
    if (old.kind !== "settings") throw Error();
    await write(
      db,
      revised("settings", old.id, { ...old.value, name: "First" }, old),
    );
    await expect(
      write(
        db,
        revised("settings", old.id, { ...old.value, name: "Stale" }, old),
      ),
    ).rejects.toThrow("another window");
  });
  it("keeps a deactivated barber and historical rates with older days", async () => {
    const db = await business("Big Boss"),
      s = rows((await exported(db)).records, "staff")[0];
    await write(
      db,
      revised("day", "day", day("2026-06-01", { [s.id]: 10000 })),
    );
    await write(
      db,
      revised("staff", s.id, { ...s.value, active: false, rate: 6000 }, s),
    );
    expect(
      earned(
        rows((await exported(db)).records, "day").map((d) => d.value),
        s.id,
      ),
    ).toBe(5000);
    expect(rows((await exported(db)).records, "staff")).toHaveLength(4);
  });
});

describe("legacy balance protection and recognizable reporting labels", () => {
  it("does not let a repeat old backup reset a corrected opening balance; a different unversioned balance conflicts", async () => {
    const db = await business();
    const raw = {
      days: [],
      tx: [],
      staff: [],
      open: 7,
      bal: { asOf: "2026-06-01", items: [] },
    };
    let result = await readImport(JSON.stringify(raw), await exported(db));
    await applyPlan(db, await planImport(db, result.envelope), {});
    const old = rows((await exported(db)).records, "settings")[0];
    await write(
      db,
      revised("settings", old.id, { ...old.value, opening: 900 }, old),
    );
    result = await readImport(JSON.stringify(raw), await exported(db));
    const again = await planImport(db, result.envelope);
    expect(again.conflicts).toHaveLength(0);
    await applyPlan(db, again, {});
    expect(settings((await exported(db)).records).opening).toBe(900);
    raw.open = 8;
    result = await readImport(JSON.stringify(raw), await exported(db));
    expect((await planImport(db, result.envelope)).conflicts).toHaveLength(1);
  });
  it("derives the original norm() loan and subcategory behavior without modifying raw category/payee", async () => {
    const { ledgerCategory, ledgerSub } = await import("./model");
    const t = {
      date: "2026-06-01",
      type: "Transfer",
      category: "Bank Account",
      sub: "",
      payee: "Operation Line",
      details: "Loan Credit",
      income: 0,
      expense: 0,
      bankCredit: 0,
      bankDeposit: 5000,
      bankDebit: 0,
      notes: "",
    };
    expect(ledgerCategory(t)).toBe("Loan Credit");
    expect(t.category).toBe("Bank Account");
    expect(
      ledgerSub({
        ...t,
        category: "Professional Fees",
        details: "GST Payment",
      }),
    ).toBe("GST Payment");
    expect(
      ledgerSub({ ...t, category: "Bank Fees", details: "Monthly Fee" }),
    ).toBe("Monthly Fee");
  });
});

it("rolls back records, metadata and sources after a post-write failure while retaining the separate recovery backup", async () => {
  const db = await business("Big Boss"),
    before = await exported(db),
    incoming = structuredClone(before);
  incoming.records.push(
    revised("tx", "synthetic-atomic-row", {
      date: "2026-06-01",
      type: "Expense",
      category: "Synthetic",
      sub: "",
      payee: "Synthetic",
      details: "Atomic rollback verification",
      income: 0,
      expense: 100,
      bankCredit: 0,
      bankDeposit: 0,
      bankDebit: 100,
      notes: "",
    }),
  );
  incoming.sources.push({
    id: "synthetic-forced-source",
    format: "Synthetic",
    raw: { verification: true },
  });
  const plan = await planImport(db, incoming);
  const fail = () => {
    throw Error("Forced source write failure after record writes");
  };
  db.sources.hook("creating", fail);
  try {
    await expect(applyPlan(db, plan, {})).rejects.toThrow(
      "Forced source write failure",
    );
  } finally {
    db.sources.hook("creating").unsubscribe(fail);
  }
  const after = await exported(db);
  expect(after.records).toEqual(before.records);
  expect(after.sources).toEqual(before.sources);
  expect(after.businessId).toBe(before.businessId);
  expect(await db.backups.count()).toBe(1);
});
