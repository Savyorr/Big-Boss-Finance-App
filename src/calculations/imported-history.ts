import type { FinanceData } from "./finance";
import { scoped, inRange } from "./finance";
import type { ShopScope } from "../models";
import { addCents } from "./money";
export function importedHistory(
  data: FinanceData,
  scope: ShopScope,
  from: string,
  to: string,
) {
  const rows = scoped(data.transactions, scope).filter(
    (t) =>
      !t.deletedAt &&
      t.accountingStatus !== "classified" &&
      t.legacyFields &&
      inRange(t.businessDate, from, to),
  );
  const sum = (
    key: "income" | "expense" | "bankCredit" | "bankDeposit" | "bankDebit",
  ) => addCents(...rows.map((t) => t.legacyFields?.[key] ?? 0));
  return {
    count: rows.length,
    income: sum("income"),
    expense: sum("expense"),
    bankCredit: sum("bankCredit"),
    bankDeposit: sum("bankDeposit"),
    bankDebit: sum("bankDebit"),
  };
}
