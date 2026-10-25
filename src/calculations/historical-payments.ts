import type { Transaction } from "../models";
import { parseMoney, addCents } from "./money";
export function historicalBarberEvidence(t: Transaction) {
  const raw = t.source?.raw as Record<string, unknown> | undefined;
  const category = String(raw?.category ?? t.category).trim();
  if (!t.legacyFields || category !== "Contract Labour") return null;
  const text = String(raw?.details ?? t.description).trim();
  const expense = t.legacyFields.expense ?? 0,
    bank = t.legacyFields.bankDebit ?? 0;
  const base = {
    recordedExpenseCents: expense,
    bankDebitCents: bank,
    supportedPaymentCents: 0,
    needsReview: true,
    label: "Expense recorded; payment not established",
    basis:
      "No payment method or settlement evidence is established by an expense field alone.",
  };
  if (/\b(payable|unpaid|owing|owed|outstanding|accrued)\b/i.test(text))
    return {
      ...base,
      label: "Payable or unsettled amount — review",
      basis:
        "The original description indicates an amount owed, not a completed payment.",
    };
  // Parse only explicit Cash/Bank amount statements. Never derive missing cash from expense minus bank.
  const amount =
    "(?<![0-9.,])(?:\\$?((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{1,2})?))(?![0-9.,])";
  let invalidDescription = false;
  const component = (word: string) => {
    const after = text.match(
      new RegExp("\\b" + word + "\\s*[:=]?\\s*" + amount + "(?![\\d.])", "i"),
    );
    const before = text.match(new RegExp(amount + "\\s*" + word + "\\b", "i"));
    const value = after?.[1] ?? before?.[1];
    if (value === undefined) return undefined;
    try {
      return parseMoney(value.replaceAll(",", ""));
    } catch {
      invalidDescription = true;
      return undefined;
    }
  };
  const cash = component("cash"),
    statedBank = component("bank");
  if (invalidDescription)
    return {
      ...base,
      label: "Payment description needs review",
      basis:
        "A stated payment amount exceeds the supported exact-cent range; no settlement was inferred.",
    };
  if (cash !== undefined && statedBank !== undefined) {
    const total = addCents(cash, statedBank);
    if (total > 0 && bank === statedBank && expense === total)
      return {
        ...base,
        supportedPaymentCents: total,
        needsReview: false,
        label: "Cash + bank payment recorded",
        basis:
          "Both payment components are stated; their sum matches recorded expense and the bank component matches the bank debit.",
      };
    return {
      ...base,
      label: "Cash/bank split needs review",
      basis:
        "Stated components do not agree with all recorded expense/bank fields. No settlement amount was inferred.",
    };
  }
  if (cash !== undefined && cash > 0 && bank === 0 && expense === cash)
    return {
      ...base,
      supportedPaymentCents: cash,
      needsReview: false,
      label: "Cash payment explicitly recorded",
      basis:
        "An explicit cash amount matches recorded expense, with no bank debit. The original cash account is still unknown.",
    };
  if (
    bank > 0 &&
    expense === bank &&
    (statedBank === undefined || statedBank === bank) &&
    cash === undefined &&
    !/\bcash\b/i.test(text)
  )
    return {
      ...base,
      supportedPaymentCents: bank,
      needsReview: false,
      label: "Bank payment recorded",
      basis:
        "The named Contract Labour record has equal expense and bank debit. The receiving account and earnings allocation remain unverified.",
    };
  if (bank > 0)
    return {
      ...base,
      label: "Bank movement recorded — settlement needs review",
      basis:
        "A bank debit exists, but it does not establish full commission settlement or a missing cash amount.",
    };
  return base;
}
