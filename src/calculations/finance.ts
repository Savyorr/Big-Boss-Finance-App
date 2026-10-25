import { monthEnd, reportingRangeIssue } from "../utils/dates";
import type {
  Account,
  Transaction,
  DailySale,
  Earning,
  CommissionPayment,
  Adjustment,
  Stylist,
  Reconciliation,
  ShopScope,
} from "../models";
import { addCents } from "./money";
export const isCashAccount = (a: Account) =>
  ["Chequing", "Savings", "Cash", "Petty Cash"].includes(a.type);
export const isLiability = (a: Account) =>
  ["Credit Card", "Operating Line of Credit"].includes(a.type);
export const inRange = (date: string, from: string, to: string) =>
  date >= from && date <= to;
export interface FinanceData {
  accounts: Account[];
  transactions: Transaction[];
  dailySales: DailySale[];
  earnings: Earning[];
  payments: CommissionPayment[];
  adjustments: Adjustment[];
  stylists: Stylist[];
  reconciliations: Reconciliation[];
}
export const emptyFinanceData: FinanceData = {
  accounts: [],
  transactions: [],
  dailySales: [],
  earnings: [],
  payments: [],
  adjustments: [],
  stylists: [],
  reconciliations: [],
};
export function scoped<T extends { shopId: string }>(
  records: T[],
  scope: ShopScope,
) {
  return records.filter((r) => scope === "all" || r.shopId === scope);
}
export function movements(
  data: FinanceData,
  account: Account,
  through: string,
) {
  return data.transactions
    .filter(
      (t) =>
        !t.deletedAt &&
        t.accountingStatus === "classified" &&
        t.businessDate >= account.openingDate &&
        t.businessDate <= through,
    )
    .flatMap((t) =>
      (t.postings ?? [])
        .filter(
          (p) => p.accountId === account.id && p.shopId === account.shopId,
        )
        .map((p) => ({
          key: `${t.id}:${account.id}`,
          eventId: t.id,
          revision: t.revision,
          date: t.businessDate,
          deltaCents: p.deltaCents,
          description: t.description,
          kind: t.kind,
          category: t.category,
        })),
    );
}
export function accountBalance(
  data: FinanceData,
  account: Account,
  through: string,
) {
  return through < account.openingDate
    ? null
    : addCents(
        account.openingBalanceCents,
        ...movements(data, account, through).map((m) => m.deltaCents),
      );
}
export function periodKey(
  date: string,
  settlement = false,
  mode: "legacy" | "calendar" = "calendar",
) {
  return `${date.slice(0, 7)} H${Number(date.slice(8)) <= (settlement && mode === "legacy" ? 22 : 15) ? 1 : 2}`;
}
export function periodEnd(key: string) {
  const [month, half] = key.split(" ");
  return half === "H1" ? `${month}-15` : monthEnd(month);
}
export function commissionSummary(
  data: FinanceData,
  stylistId: string,
  from: string,
  to: string,
) {
  const earned = data.earnings.filter(
    (e) => !e.deletedAt && e.stylistId === stylistId,
  );
  const paid = data.payments.filter(
    (p) => !p.deletedAt && p.stylistId === stylistId,
  );
  const adjustments = data.adjustments.filter(
    (a) => !a.deletedAt && a.stylistId === stylistId,
  );
  const effective = (p: CommissionPayment | Adjustment) =>
    p.periodMode === "legacy"
      ? periodEnd(periodKey(p.businessDate, true, "legacy"))
      : p.businessDate;
  const sumBefore = (date: string) =>
    addCents(
      ...earned.filter((e) => e.businessDate < date).map((e) => e.amountCents),
      ...paid.filter((p) => effective(p) < date).map((p) => -p.amountCents),
      ...adjustments
        .filter((a) => effective(a) < date)
        .map((a) => -a.amountCents),
    );
  const serviceCents = addCents(
    ...earned
      .filter((e) => inRange(e.businessDate, from, to))
      .map((e) => e.serviceCents),
  );
  const earnedCents = addCents(
    ...earned
      .filter((e) => inRange(e.businessDate, from, to))
      .map((e) => e.amountCents),
  );
  const paidCents = addCents(
    ...paid
      .filter((p) => inRange(effective(p), from, to))
      .map((p) => p.amountCents),
  );
  const adjustmentCents = addCents(
    ...adjustments
      .filter((a) => inRange(effective(a), from, to))
      .map((a) => a.amountCents),
  );
  const previousCents = sumBefore(from);
  return {
    stylistId,
    serviceCents,
    earnedCents,
    paidCents,
    adjustmentCents,
    previousCents,
    outstandingCents: addCents(
      previousCents,
      earnedCents,
      -paidCents,
      -adjustmentCents,
    ),
  };
}
export function summarize(
  data: FinanceData,
  scope: ShopScope,
  from: string,
  to: string,
) {
  const tx = scoped(data.transactions, scope).filter(
    (t) =>
      !t.deletedAt &&
      t.accountingStatus === "classified" &&
      inRange(t.businessDate, from, to),
  );
  const revenueCents = addCents(...tx.map((t) => t.revenueCents ?? 0));
  const operatingExpensesCents = addCents(
    ...tx.map((t) => t.operatingExpenseCents ?? 0),
  );
  const commissionExpensesCents = addCents(
    ...tx.map((t) => t.commissionExpenseCents ?? 0),
  );
  const expenseCents = addCents(
    operatingExpensesCents,
    commissionExpensesCents,
  );
  const cashAccounts = scoped(data.accounts, scope).filter(
    (a) => !a.deletedAt && isCashAccount(a),
  );
  const internalTransfers = new Set(
    data.transactions
      .filter(
        (t) =>
          !t.deletedAt &&
          t.kind === "Transfer" &&
          (t.postings ?? []).length === 2 &&
          (t.postings ?? []).every((p) =>
            cashAccounts.some(
              (a) => a.id === p.accountId && a.shopId === p.shopId,
            ),
          ),
      )
      .map((t) => t.id),
  );
  const cashMovementCents = addCents(
    ...cashAccounts.flatMap((a) =>
      movements(data, a, to)
        .filter((m) => m.date >= from && !internalTransfers.has(m.eventId))
        .map((m) => m.deltaCents),
    ),
  );
  const balanceCents = addCents(
    ...cashAccounts.map((a) => accountBalance(data, a, to) ?? 0),
  );
  const stylists = scoped(data.stylists, scope).filter((s) => !s.deletedAt);
  const commissionPositions = stylists.map(
    (s) => commissionSummary(data, s.id, "0001-01-01", to).outstandingCents,
  );
  // A credit for one stylist must not hide amounts still owed to someone else.
  const outstandingCents = addCents(
    ...commissionPositions.filter((v) => v > 0),
  );
  const overpaidCents = addCents(
    ...commissionPositions.filter((v) => v < 0).map((v) => -v),
  );
  const sales = scoped(data.dailySales, scope).filter(
    (s) => !s.deletedAt && inRange(s.businessDate, from, to),
  );
  const expenseCategories = new Map<string, number>();
  for (const t of tx) {
    if (t.operatingExpenseCents)
      expenseCategories.set(
        t.category,
        addCents(
          expenseCategories.get(t.category) ?? 0,
          t.operatingExpenseCents,
        ),
      );
    if (t.commissionExpenseCents)
      expenseCategories.set(
        "Stylist commissions earned",
        addCents(
          expenseCategories.get("Stylist commissions earned") ?? 0,
          t.commissionExpenseCents,
        ),
      );
  }
  const unpostedSales = scoped(data.dailySales, scope).filter(
    (s) =>
      !s.deletedAt &&
      inRange(s.businessDate, from, to) &&
      !s.linkedTransactionIds.some((id) =>
        data.transactions.some(
          (t) =>
            t.id === id && !t.deletedAt && t.accountingStatus === "classified",
        ),
      ),
  ).length;
  const reviewCount =
    unpostedSales +
    scoped(data.transactions, scope).filter(
      (t) =>
        !t.deletedAt &&
        t.accountingStatus !== "classified" &&
        inRange(t.businessDate, from, to),
    ).length;
  const receiptWarnings = sales.filter(
    (s) =>
      addCents(s.cashCents, s.cardCents) !==
        addCents(s.serviceCents, s.productCents) || s.cashCents < 0,
  ).length;
  return {
    revenueCents,
    operatingExpensesCents,
    commissionExpensesCents,
    expenseCents,
    profitCents: addCents(revenueCents, -expenseCents),
    cashMovementCents,
    balanceCents,
    outstandingCents,
    overpaidCents,
    serviceCents: addCents(...sales.map((s) => s.serviceCents)),
    productCents: addCents(...sales.map((s) => s.productCents)),
    expenseCategories: [...expenseCategories].sort((a, b) => b[1] - a[1]),
    reviewCount,
    receiptWarnings,
  };
}
export function monthlySeries(
  data: FinanceData,
  scope: ShopScope,
  from: string,
  to: string,
) {
  if (!from || !to || from > to) return [];
  const issue = reportingRangeIssue(from, to);
  if (issue) throw new Error(issue);
  const result = [];
  const start = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)) - 1;
  const finish = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - 1;
  for (let ordinal = start; ordinal <= finish; ordinal++) {
    const month = `${String(Math.floor(ordinal / 12)).padStart(4, "0")}-${String((ordinal % 12) + 1).padStart(2, "0")}`;
    const begin = `${month}-01`,
      end = monthEnd(month);
    const summary = summarize(
      data,
      scope,
      from > begin ? from : begin,
      to < end ? to : end,
    );
    result.push({
      period: month,
      revenue: summary.revenueCents,
      expenses: summary.expenseCents,
      profit: summary.profitCents,
      cash: summary.cashMovementCents,
    });
  }
  return result;
}
export function reconciliationState(
  data: FinanceData,
  account: Account,
  date: string,
  clearedKeys: string[],
  statementCents: number,
) {
  const rows = movements(data, account, date);
  const cleared = rows.filter((m) => clearedKeys.includes(m.key));
  const clearedBalanceCents = addCents(
    account.openingBalanceCents,
    ...cleared.map((m) => m.deltaCents),
  );
  return {
    rows,
    clearedBalanceCents,
    differenceCents: addCents(clearedBalanceCents, -statementCents),
    outstanding: rows.filter((m) => !clearedKeys.includes(m.key)),
    calculatedCents: accountBalance(data, account, date),
  };
}
export function reconciliationIsCurrent(
  record: Reconciliation,
  data: FinanceData,
  account: Account,
) {
  if (
    account.deletedAt ||
    record.statementDate < account.openingDate ||
    account.revision !== record.accountRevision
  )
    return false;
  const keys = Object.keys(record.eventRevisions);
  if (
    new Set(record.clearedKeys).size !== record.clearedKeys.length ||
    keys.length !== record.clearedKeys.length ||
    keys.some((key) => !record.clearedKeys.includes(key))
  )
    return false;
  const rows = movements(data, account, record.statementDate);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  if (
    keys.some((key) => byKey.get(key)?.revision !== record.eventRevisions[key])
  )
    return false;
  try {
    const state = reconciliationState(
      data,
      account,
      record.statementDate,
      record.clearedKeys,
      record.statementBalanceCents,
    );
    return (
      state.clearedBalanceCents === record.clearedBalanceCents &&
      state.differenceCents === record.differenceCents &&
      (record.status !== "completed" || state.differenceCents === 0)
    );
  } catch {
    return false;
  }
}
