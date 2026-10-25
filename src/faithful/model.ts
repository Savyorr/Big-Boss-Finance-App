import { z } from "zod";
import {
  addCents,
  safeCents,
  formatMoney,
  moneyInput,
  parseMoney,
} from "../calculations/money";
export { addCents, safeCents, formatMoney, moneyInput, parseMoney };
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date");
const money = z.number().int().refine(Number.isSafeInteger);
const nonnegative = money.refine((v) => v >= 0);
const id = z.string().min(1).max(200);
const raw = z.unknown().optional();
export const staffSchema = z.object({
  originalName: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  rate: z.number().int().min(0).max(10000),
  raw,
});
export const daySchema = z.object({
  date: dateSchema,
  sales: z.record(id, nonnegative),
  rates: z.record(id, z.number().int().min(0).max(10000)),
  product: nonnegative,
  total: nonnegative,
  card: nonnegative,
  deposit: nonnegative,
  notes: z.string(),
  raw,
});
export const txSchema = z.object({
  date: dateSchema,
  type: z.string(),
  category: z.string(),
  sub: z.string(),
  payee: z.string(),
  details: z.string(),
  income: money,
  expense: money,
  bankCredit: money,
  bankDeposit: money,
  bankDebit: money,
  notes: z.string(),
  staffId: id.optional(),
  raw,
});
export const adjustmentSchema = z.object({
  date: dateSchema,
  staffId: id,
  amount: money,
  notes: z.string(),
  raw,
});
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  opening: money,
  openingKnown: z.boolean(),
  asOf: dateSchema,
  limit: nonnegative,
  balances: z.array(z.object({ name: z.string(), amount: money })),
  overlaps: z.record(dateSchema, z.enum(["daily", "ledger", "both"])),
  historyIncomplete: z.boolean(),
  raw,
});
const base = {
  id,
  revision: id,
  ancestors: z.array(id).max(20000),
  deleted: z.boolean(),
};
export const entitySchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("staff"), value: staffSchema }),
  z.object({ ...base, kind: z.literal("day"), value: daySchema }),
  z.object({ ...base, kind: z.literal("tx"), value: txSchema }),
  z.object({ ...base, kind: z.literal("adjustment"), value: adjustmentSchema }),
  z.object({ ...base, kind: z.literal("settings"), value: settingsSchema }),
]);
export type Entity = z.infer<typeof entitySchema>;
export type Kind = Entity["kind"];
export type Of<K extends Kind> = Extract<Entity, { kind: K }>;
export type Staff = z.infer<typeof staffSchema>;
export type Day = z.infer<typeof daySchema>;
export type Tx = z.infer<typeof txSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Adjustment = z.infer<typeof adjustmentSchema>;
export const envelopeSchema = z.object({
  app: z.literal("Big Boss Finance Faithful"),
  version: z.literal(1),
  businessId: id,
  exportedAt: z.string(),
  records: z.array(entitySchema).max(100000),
  sources: z.array(z.object({ id, format: z.string(), raw: z.unknown() })),
});
export type Envelope = z.infer<typeof envelopeSchema>;
export function rows<K extends Kind>(all: Entity[], kind: K): Of<K>[] {
  const result = all.filter((e) => e.kind === kind && !e.deleted) as Of<K>[];
  if (kind === "staff")
    result.sort(
      (a, b) =>
        ((a as Of<"staff">).value.order ?? 100000) -
        ((b as Of<"staff">).value.order ?? 100000),
    );
  return result;
}
export function settings(all: Entity[]): Settings {
  const s = rows(all, "settings")[0];
  if (!s) throw Error("Business settings are missing");
  return s.value;
}
export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function previousMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
  return today(d).slice(0, 7);
}
export function monthName(month: string) {
  return new Date(month + "-01T12:00:00").toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
}
export function period(date: string, payment = false) {
  return (
    date.slice(0, 7) +
    (Number(date.slice(8)) <= (payment ? 22 : 15) ? " H1" : " H2")
  );
}
export function periodEnd(key: string) {
  return (
    key.slice(0, 7) +
    (key.endsWith("H1")
      ? "-15"
      : "-" +
        new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate())
  );
}
export function periodLabel(key: string) {
  return (
    monthName(key.slice(0, 7)) + (key.endsWith("H1") ? " · 1–15" : " · 16–End")
  );
}
export function earned(days: Day[], staffId: string) {
  let n = 0n;
  for (const d of days)
    n += BigInt(d.sales[staffId] ?? 0) * BigInt(d.rates[staffId] ?? 5000);
  return safeCents((n + 5000n) / 10000n);
}
export function dayCommission(d: Day) {
  let n = 0n;
  for (const [id, c] of Object.entries(d.sales))
    n += BigInt(c) * BigInt(d.rates[id] ?? 5000);
  return safeCents((n + 5000n) / 10000n);
}
export function summary(all: Entity[], month: string) {
  const days = rows(all, "day").filter((e) => e.value.date.startsWith(month)),
    tx = rows(all, "tx").filter((e) => e.value.date.startsWith(month));
  const s = settings(all),
    dates = new Set([
      ...days.map((e) => e.value.date),
      ...tx.map((e) => e.value.date),
    ]);
  let revenue = 0;
  const overlaps: string[] = [],
    overlapDates: string[] = [];
  for (const date of dates) {
    const daily = addCents(
      ...days.filter((e) => e.value.date === date).map((e) => e.value.total),
    );
    const ledger = addCents(
      ...tx.filter((e) => e.value.date === date).map((e) => e.value.income),
    );
    if (daily && ledger) {
      overlapDates.push(date);
      const decision = s.overlaps[date];
      if (!decision) overlaps.push(date);
      revenue = addCents(
        revenue,
        decision === "daily"
          ? daily
          : decision === "both"
            ? addCents(daily, ledger)
            : ledger,
      );
    } else revenue = addCents(revenue, daily, ledger);
  }
  const expenses = addCents(...tx.map((e) => e.value.expense));
  return {
    revenue,
    expenses,
    profit: addCents(revenue, -expenses),
    overlaps,
    overlapDates,
    days: days.length,
    card: addCents(...days.map((e) => e.value.card)),
    product: addCents(...days.map((e) => e.value.product)),
  };
}
export function sourceTotals(all: Entity[]) {
  const tx = rows(all, "tx");
  return Object.fromEntries(
    ["income", "expense", "bankCredit", "bankDeposit", "bankDebit"].map((k) => [
      k,
      addCents(...tx.map((e) => e.value[k as keyof Tx] as number)),
    ]),
  ) as Record<string, number>;
}
export function bankAt(all: Entity[], date: string) {
  return addCents(
    settings(all).opening,
    ...rows(all, "day")
      .filter((e) => e.value.date <= date)
      .map((e) => addCents(e.value.card, e.value.deposit)),
    ...rows(all, "tx")
      .filter((e) => e.value.date <= date)
      .map((e) =>
        addCents(e.value.bankCredit, e.value.bankDeposit, -e.value.bankDebit),
      ),
  );
}
export const SUBS: Record<string, string[]> = {
  "Professional Fee": [
    "Annual Report",
    "Corporation Tax",
    "GST Payment",
    "Payroll Payment",
    "Business License",
  ],
  "Bank Fees": ["Activity Fee", "Charges Fee", "Loan Interest", "Monthly Fee"],
};
export const TRANSFERS = [
  "Loan Credit",
  "Loan Payment",
  "Petty Cash",
  "Visa Payment",
  "Visa Withdraw",
  "Cash Deposit",
  "Bank Account",
];
export function categoryKey(category: string) {
  return /^pro[a-z]*\s*fee/i.test(category)
    ? "Professional Fee"
    : /^bank fee/i.test(category)
      ? "Bank Fees"
      : category;
}
// The original norm() recognizes these ledger labels. Derive them for reports
// without changing the original category, payee or raw source in an export.
export function ledgerCategory(t: Tx) {
  if (
    /operat(ion|ing) line/i.test(t.payee) &&
    /loan (credit|payment)/i.test(t.details)
  )
    return /credit/i.test(t.details) ? "Loan Credit" : "Loan Payment";
  return categoryKey(t.category);
}
export function ledgerSub(t: Tx) {
  if (t.sub) return t.sub;
  const text = (t.category + " " + t.payee + " " + t.details).toLowerCase();
  if (ledgerCategory(t) === "Professional Fee")
    return /annual report/.test(text)
      ? "Annual Report"
      : /payroll/.test(text)
        ? "Payroll Payment"
        : /corporation tax/.test(text)
          ? "Corporation Tax"
          : /business licen/.test(text)
            ? "Business License"
            : /gst/.test(text)
              ? "GST Payment"
              : "";
  if (ledgerCategory(t) === "Bank Fees")
    return /activity fee/.test(text)
      ? "Activity Fee"
      : /monthly fee/.test(text)
        ? "Monthly Fee"
        : /loan interest/.test(text)
          ? "Loan Interest"
          : "Charges Fee";
  return "";
}
export function validateRecords(records: Entity[]) {
  const ids = new Set<string>(),
    staff = new Set(records.filter((e) => e.kind === "staff").map((e) => e.id));
  let settingsCount = 0;
  const dates = new Set<string>();
  for (const e of records) {
    entitySchema.parse(e);
    if (ids.has(e.id)) throw Error("Duplicate record identifier");
    ids.add(e.id);
    if (e.ancestors.includes(e.revision))
      throw Error("A revision cannot be its own ancestor");
    if (e.kind === "settings" && !e.deleted) settingsCount++;
    if (e.kind === "day" && !e.deleted) {
      if (dates.has(e.value.date))
        throw Error(
          "Two different saved days use the same date. Resolve the date conflict first.",
        );
      dates.add(e.value.date);
    }
    const refs =
      e.kind === "day"
        ? Object.keys(e.value.sales)
        : e.kind === "adjustment"
          ? [e.value.staffId]
          : e.kind === "tx" && e.value.staffId
            ? [e.value.staffId]
            : [];
    if (refs.some((x) => !staff.has(x)))
      throw Error("A record refers to a missing barber");
  }
  if (settingsCount !== 1)
    throw Error("Exactly one business settings record is required");
  sourceTotals(records);
}
