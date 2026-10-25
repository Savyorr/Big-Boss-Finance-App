import { it, expect, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import {
  BusinessDB,
  createBusiness,
  exported,
  write,
  revised,
  remove,
  applyPlan,
  planImport,
  profiles,
  recovery,
} from "./store";
import { readImport } from "./import";
import {
  dailyIncome,
  summary,
  sourceTotals,
  rows,
  bankAt,
  earned,
  rateForDate,
  commissionIncomplete,
  type Day,
  type Entity,
  settings,
  calendarMonth,
} from "./model";
import { expenseBreakdown, historicalMonths, comparison } from "./analytics";
import { canonical } from "../services/exchange/json";
const open: BusinessDB[] = [];
async function setup(name = "Big Boss") {
  const p = await createBusiness(name),
    db = new BusinessDB(p.id);
  open.push(db);
  return db;
}
afterEach(async () => {
  for (const d of open.splice(0)) {
    d.close();
    await d.delete();
  }
  await profiles.clear();
});
const tx = (date: string, income = 10000, expense = 0) => ({
  date,
  type: income ? "Income" : "Expense",
  category: income ? "Revenue" : "Rent Expense",
  sub: "",
  payee: "Synthetic",
  details: "Synthetic verification",
  income,
  expense,
  bankCredit: income,
  bankDeposit: 0,
  bankDebit: expense,
  notes: "",
});
const day = (date: string, id: string, total = 10000): Day => ({
  date,
  sales: { [id]: total },
  rates: { [id]: 5000 },
  product: 0,
  total,
  card: total,
  deposit: 0,
  notes: "Synthetic",
});
it("groups multiple legitimate revenue records, distinguishes saved zero from missing, and updates across edit/delete", async () => {
  const db = await setup();
  await write(db, revised("tx", "a", tx("2026-09-01", 10000)));
  await write(db, revised("tx", "b", tx("2026-09-01", 5000)));
  await write(
    db,
    revised("tx", "zero", { ...tx("2026-09-02", 0), category: "Revenue" }),
  );
  let all = (await exported(db)).records;
  let values = dailyIncome(all, "2026-09");
  expect(values).toHaveLength(30);
  expect(values[0].revenue).toBe(15000);
  expect(values[1]).toMatchObject({ revenue: 0, status: "Confirmed zero" });
  expect(values[2]).toMatchObject({ revenue: null, status: "Missing record" });
  const old = rows(all, "tx").find((t) => t.id === "b")!;
  await write(db, revised("tx", old.id, { ...old.value, income: 6000 }, old));
  expect(dailyIncome((await exported(db)).records, "2026-09")[0].revenue).toBe(
    16000,
  );
  await remove(db, (await db.records.get("a"))!);
  expect(dailyIncome((await exported(db)).records, "2026-09")[0].revenue).toBe(
    6000,
  );
});
it("links later-entered barber breakdowns without duplicating revenue OR bank receipts; original fields remain immutable", async () => {
  const db = await setup();
  await write(db, revised("tx", "source", tx("2026-09-01", 12000)));
  let all = (await exported(db)).records;
  const s = rows(all, "staff")[0],
    t = rows(all, "tx")[0],
    before = sourceTotals(all),
    bank = bankAt(all, "2026-09-30");
  const d = {
    ...day("2026-09-01", s.id, 10000),
    product: 2000,
    total: 12000,
    card: 15000,
    tips: 3000,
    revenueLink: {
      sources: [{ id: t.id, revision: t.revision }],
      resolution: "ledger" as const,
      recordedTotal: 12000,
    },
  };
  await write(db, revised("day", "d", d));
  all = (await exported(db)).records;
  expect(summary(all, "2026-09")).toMatchObject({
    revenue: 12000,
    expenses: 0,
    profit: 12000,
  });
  expect(bankAt(all, "2026-09-30")).toBe(bank);
  expect(sourceTotals(all)).toEqual(before);
  expect(
    earned(
      rows(all, "day").map((e) => e.value),
      s.id,
    ),
  ).toBe(5000);
  expect(d.total - d.card).toBe(-3000);
  expect(d.tips).toBe(3000);
  const old = rows(all, "day")[0];
  await write(db, revised("day", old.id, { ...old.value, total: 11000 }, old));
  expect(summary((await exported(db)).records, "2026-09").revenue).toBe(12000);
});
it("reacts to linked source corrections, flags changed source sets, and never resurrects deleted linked revenue", async () => {
  const db = await setup();
  await write(db, revised("tx", "source", tx("2026-09-01")));
  let a = (await exported(db)).records;
  const s = rows(a, "staff")[0],
    t = rows(a, "tx")[0];
  await write(
    db,
    revised("day", "day", {
      ...day(t.value.date, s.id),
      revenueLink: {
        sources: [{ id: t.id, revision: t.revision }],
        resolution: "ledger",
        recordedTotal: 10000,
      },
    }),
  );
  await write(db, revised("tx", t.id, { ...t.value, income: 11000 }, t));
  a = (await exported(db)).records;
  expect(summary(a, "2026-09").revenue).toBe(11000);
  expect(summary(a, "2026-09").overlaps).toContain("2026-09-01");
  await remove(db, (await db.records.get("source"))!);
  expect(
    dailyIncome((await exported(db)).records, "2026-09")[0].revenue,
  ).toBeNull();
});
it("rejects a stale historical breakdown if its source changed while editing", async () => {
  const db = await setup();
  await write(db, revised("tx", "source", tx("2026-09-01")));
  const a = (await exported(db)).records,
    s = rows(a, "staff")[0],
    t = rows(a, "tx")[0];
  await write(db, revised("tx", t.id, { ...t.value, income: 11000 }, t));
  await expect(
    write(
      db,
      revised("day", "day", {
        ...day(t.value.date, s.id),
        revenueLink: {
          sources: [{ id: t.id, revision: t.revision }],
          resolution: "ledger",
          recordedTotal: 10000,
        },
      }),
    ),
  ).rejects.toThrow("Recorded income changed");
  expect(rows((await exported(db)).records, "day")).toHaveLength(0);
});
it("expense categories reconcile exactly to Reports and do not count bank-only transfers", async () => {
  const db = await setup();
  await write(db, revised("tx", "rent", tx("2026-09-01", 0, 10000)));
  await write(
    db,
    revised("tx", "credit", {
      ...tx("2026-09-01", 0, -2000),
      category: "Rent Expense",
    }),
  );
  await write(
    db,
    revised("tx", "loan", {
      ...tx("2026-09-02", 0),
      category: "Loan Payment",
      bankDebit: 50000,
    }),
  );
  const a = (await exported(db)).records,
    e = expenseBreakdown(a, "2026-09");
  expect(e.reduce((s, x) => s + x.amount, 0)).toBe(
    summary(a, "2026-09").expenses,
  );
  expect(e).toEqual([{ category: "Rent Expense", amount: 8000, percent: 100 }]);
});
it("12 completed month values agree with Reports, include losses and leave missing months missing", async () => {
  const db = await setup();
  await write(db, revised("tx", "a", tx("2026-09-01", 10000, 15000)));
  const a = (await exported(db)).records,
    h = historicalMonths(a, "2026-09");
  expect(h).toHaveLength(12);
  expect(h[0].month).toBe("2025-10");
  expect(h.at(-1)).toMatchObject({
    month: "2026-09",
    revenue: 10000,
    expenses: 15000,
    profit: -5000,
  });
  expect(h[0].revenue).toBeNull();
  for (const p of h.filter((x) => x.revenue !== null))
    expect(p.profit).toBe(summary(a, p.month).profit);
});
it("month comparisons are neutral for missing data and zero baselines, accurate when calendar coverage is complete", async () => {
  const db = await setup(),
    s = rows((await exported(db)).records, "staff")[0];
  expect(
    comparison((await exported(db)).records, "2026-02", "revenue"),
  ).toContain("unavailable");
  for (const m of ["2026-01", "2026-02"])
    for (const date of calendarMonth(m))
      await write(db, revised("day", date, day(date, s.id, 0)));
  expect(comparison((await exported(db)).records, "2026-02", "revenue")).toBe(
    "No change from previous month",
  );
  const old = (await db.records.get("2026-02-01"))!;
  if (old.kind !== "day") throw Error();
  await write(db, revised("day", old.id, { ...old.value, total: 100 }, old));
  expect(
    comparison((await exported(db)).records, "2026-02", "revenue"),
  ).toContain("zero or negative baseline");
});
it("full backup restores EVERY stored business record, source, rate change, tips, preferences, links, tombstone and recovery snapshot", async () => {
  const db = await setup();
  const legacy = await readFile(
    process.env.BIG_BOSS_LEGACY_FIXTURE ??
      "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json",
    "utf8",
  );
  const result = await readImport(legacy, await exported(db));
  await applyPlan(db, await planImport(db, result.envelope), {});
  let all = (await exported(db)).records;
  const st = rows(all, "staff")[0],
    t = rows(all, "tx").find((e) => e.value.income > 0)!;
  await write(
    db,
    revised(
      "staff",
      st.id,
      {
        ...st.value,
        active: false,
        rate: 6000,
        rateHistory: [
          {
            effectiveDate: "2026-10-01",
            from: 5000,
            to: 6000,
            changedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
      st,
    ),
  );
  await write(
    db,
    revised("day", "breakdown", {
      ...day(t.value.date, st.id, t.value.income),
      tips: 123,
      deposit: 45,
      revenueLink: {
        sources: [{ id: t.id, revision: t.revision }],
        recordedTotal: t.value.income,
        resolution: "ledger",
      },
    }),
  );
  await write(
    db,
    revised("adjustment", "adj", {
      date: "2026-09-22",
      staffId: st.id,
      amount: -100,
      notes: "Synthetic",
    }),
  );
  const old = rows((await exported(db)).records, "settings")[0];
  await write(
    db,
    revised(
      "settings",
      old.id,
      {
        ...old.value,
        preferences: { theme: "dark" },
        openingKnown: true,
        opening: 700,
        balances: [{ name: "Synthetic account", amount: 12345 }],
      },
      old,
    ),
  );
  await write(db, revised("tx", "deleted", tx("2026-10-01")));
  await remove(db, (await db.records.get("deleted"))!);
  await recovery(db);
  const before = await exported(db);
  expect(before.version).toBe(2);
  const fresh = await setup("Fresh restore");
  await applyPlan(fresh, await planImport(fresh, before), {});
  const after = await exported(fresh);
  expect(canonical(after.records)).toBe(canonical(before.records));
  expect(canonical(after.sources)).toBe(canonical(before.sources));
  expect(after.businessId).toBe(before.businessId);
  for (const snap of before.recoveryBackups ?? [])
    expect(after.recoveryBackups).toContainEqual(snap);
  expect(settings(after.records).preferences?.theme).toBe("dark");
  expect(sourceTotals(after.records)).toEqual(sourceTotals(before.records));
  expect(dailyIncome(after.records, "2026-09")).toEqual(
    dailyIncome(before.records, "2026-09"),
  );
  expect(historicalMonths(after.records, "2026-09")).toEqual(
    historicalMonths(before.records, "2026-09"),
  );
}, 60000);
it("rate history applies by business date without rewriting saved commissions", () => {
  const s = {
    name: "Synthetic",
    active: true,
    rate: 6000,
    rateHistory: [
      {
        effectiveDate: "2026-10-01",
        from: 5000,
        to: 6000,
        changedAt: "2026-10-01T00:00:00Z",
      },
    ],
  };
  expect(rateForDate(s, "2026-09-30")).toBe(5000);
  expect(rateForDate(s, "2026-10-01")).toBe(6000);
});

it("deduplicates full recovery history on disk and restores old heads only into recovery, never current financial rows", async () => {
  const { packBackup, unpackBackup } = await import("./backup");
  const db = await setup();
  await write(db, revised("tx", "t", tx("2026-09-01", 10000)));
  for (let i = 0; i < 8; i++) await recovery(db);
  const old = (await db.records.get("t"))!;
  if (old.kind !== "tx") throw Error();
  await write(db, revised("tx", "t", { ...old.value, income: 12000 }, old));
  const before = await exported(db),
    packed = packBackup(before),
    restored = unpackBackup(JSON.parse(JSON.stringify(packed)));
  expect(packed.recoveryBackups).toBeUndefined();
  expect(packed.recoveryArchive?.snapshots).toHaveLength(8);
  expect(
    packed.recoveryArchive?.records.filter((e) => e.kind === "tx"),
  ).toHaveLength(1);
  expect(JSON.stringify(packed).length).toBeLessThan(
    JSON.stringify(before).length / 2,
  );
  expect(canonical(restored)).toBe(canonical(before));
  const next = await setup("Restored");
  await applyPlan(next, await planImport(next, packed), {});
  expect(summary((await exported(next)).records, "2026-09").revenue).toBe(
    12000,
  );
  expect(rows((await exported(next)).records, "tx")).toHaveLength(1);
});
it("rejects missing compact snapshot references without partially importing", async () => {
  const { packBackup, unpackBackup } = await import("./backup");
  const db = await setup();
  await recovery(db);
  const packed = packBackup(await exported(db));
  packed.recoveryArchive!.snapshots[0].recordRefs.push("missing-reference");
  expect(() => unpackBackup(packed)).toThrow("missing a recovery record");
  const before = await exported(db);
  await expect(planImport(db, packed)).rejects.toThrow();
  expect((await exported(db)).records).toEqual(before.records);
});
it("computes actual month-over-month percentages when both months have complete known coverage", async () => {
  const db = await setup(),
    s = rows((await exported(db)).records, "staff")[0];
  for (const month of ["2026-01", "2026-02"])
    for (const date of calendarMonth(month))
      await write(
        db,
        revised("day", date, day(date, s.id, month === "2026-01" ? 100 : 200)),
      );
  expect(comparison((await exported(db)).records, "2026-02", "revenue")).toBe(
    "Increased 80.6% vs previous month",
  );
});
