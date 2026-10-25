import { addCents } from "./money";
import { scoped, inRange, monthlySeries, type FinanceData } from "./finance";
import type { ShopScope } from "../models";
export function recordedHistory(
  data: FinanceData,
  scope: ShopScope,
  from: string,
  to: string,
) {
  const rows = scoped(data.transactions, scope).filter(
    (t) => !t.deletedAt && inRange(t.businessDate, from, to),
  );
  const original = rows.filter((t) => t.legacyFields);
  // Each original contributes its preserved fields once, even after classification.
  // Only new, non-legacy entries contribute recognized amounts alongside them.
  const newer = rows.filter(
    (t) => !t.legacyFields && t.accountingStatus === "classified",
  );
  const source = (
    key: "income" | "expense" | "bankCredit" | "bankDeposit" | "bankDebit",
  ) => addCents(...original.map((t) => t.legacyFields?.[key] ?? 0));
  const revenueCents = addCents(
    source("income"),
    ...newer.map((t) => t.revenueCents ?? 0),
  );
  const expenseCents = addCents(
    source("expense"),
    ...newer.map((t) =>
      addCents(t.operatingExpenseCents ?? 0, t.commissionExpenseCents ?? 0),
    ),
  );
  const categories = new Map<string, number>();
  for (const t of rows) {
    const value = t.legacyFields
      ? (t.legacyFields.expense ?? 0)
      : t.accountingStatus === "classified"
        ? addCents(t.operatingExpenseCents ?? 0, t.commissionExpenseCents ?? 0)
        : 0;
    if (value)
      categories.set(
        t.category,
        addCents(categories.get(t.category) ?? 0, value),
      );
  }
  return {
    sourceCount: original.length,
    unreviewed: original.filter((t) => t.accountingStatus !== "classified")
      .length,
    classifiedHistorical: original.filter(
      (t) => t.accountingStatus === "classified",
    ).length,
    newCount: newer.length,
    revenueCents,
    expenseCents,
    differenceCents: addCents(revenueCents, -expenseCents),
    bankCreditCents: source("bankCredit"),
    bankDepositCents: source("bankDeposit"),
    bankDebitCents: source("bankDebit"),
    categories: [...categories.entries()],
  };
}
export function recordedMonthlySeries(
  data: FinanceData,
  scope: ShopScope,
  from: string,
  to: string,
) {
  return monthlySeries(data, scope, from, to).map((point) => {
    const month = point.period;
    const h = recordedHistory(
      data,
      scope,
      from > month + "-01" ? from : month + "-01",
      to < month + "-31" ? to : month + "-31",
    );
    return {
      ...point,
      revenue: h.revenueCents,
      expenses: h.expenseCents,
      profit: h.differenceCents,
      cash: 0,
    };
  });
}

export function recordedDailyHistory(
  data: FinanceData,
  scope: ShopScope,
  from: string,
  to: string,
) {
  const days = new Map<
    string,
    {
      date: string;
      count: number;
      income: number;
      expense: number;
      bankCredit: number;
      bankDeposit: number;
      bankDebit: number;
    }
  >();
  const fields = [
    "income",
    "expense",
    "bankCredit",
    "bankDeposit",
    "bankDebit",
  ] as const;
  for (const t of scoped(data.transactions, scope)) {
    if (t.deletedAt || !t.legacyFields || !inRange(t.businessDate, from, to))
      continue;
    const day = days.get(t.businessDate) ?? {
      date: t.businessDate,
      count: 0,
      income: 0,
      expense: 0,
      bankCredit: 0,
      bankDeposit: 0,
      bankDebit: 0,
    };
    day.count++;
    for (const field of fields)
      day[field] = addCents(day[field], t.legacyFields[field] ?? 0);
    days.set(day.date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
