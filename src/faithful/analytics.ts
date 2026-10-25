import {
  type Entity,
  summary,
  dailyIncome,
  rows,
  ledgerCategory,
  addCents,
  calendarMonth,
  monthName,
} from "./model";
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function expenseBreakdown(all: Entity[], month: string) {
  const groups = new Map<string, number>();
  for (const t of rows(all, "tx"))
    if (t.value.date.startsWith(month) && t.value.expense !== 0) {
      const k = ledgerCategory(t.value) || "Uncategorized";
      groups.set(k, addCents(groups.get(k) ?? 0, t.value.expense));
    }
  const total = addCents(...groups.values());
  return [...groups]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? (amount / total) * 100 : null,
    }));
}
export function historicalMonths(all: Entity[], ending: string) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = shiftMonth(ending, i - 11),
      r = summary(all, month),
      income = dailyIncome(all, month);
    const hasData =
      rows(all, "tx").some((t) => t.value.date.startsWith(month)) ||
      rows(all, "day").some((t) => t.value.date.startsWith(month));
    return {
      month,
      label: monthName(month),
      revenue: hasData ? r.revenue : null,
      expenses: hasData ? r.expenses : null,
      profit: hasData ? r.profit : null,
      coverage: income.filter((d) => d.revenue !== null).length,
      days: calendarMonth(month).length,
    };
  });
}
export function comparison(
  all: Entity[],
  month: string,
  field: "revenue" | "expenses" | "profit",
) {
  const prior = shiftMonth(month, -1),
    a = summary(all, month),
    b = summary(all, prior);
  const reliable = [month, prior].every((m) =>
    dailyIncome(all, m).every((d) => d.revenue !== null && !d.ambiguous),
  );
  if (!reliable) return "Comparison unavailable · incomplete daily records";
  if (b[field] <= 0)
    return b[field] === a[field]
      ? "No change from previous month"
      : "Percentage unavailable · zero or negative baseline";
  const pct = ((a[field] - b[field]) / b[field]) * 100;
  return pct === 0
    ? "No change from previous month"
    : `${pct > 0 ? "Increased" : "Decreased"} ${Math.abs(pct).toFixed(1)}% vs previous month`;
}
