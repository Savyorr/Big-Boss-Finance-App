import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../database/db";
import { financialPreferencesSchema } from "../../services/preferences";
import { useState, type FormEvent } from "react";
import { useApp } from "../../app/context";
import type { Transaction } from "../../models";
import { useFinance } from "../../hooks/useFinance";
import { financeService } from "../../services/finance";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field, MoneyInput, DateInput, ErrorMessage } from "../ui/shared";
import { moneyInput, parseMoney } from "../../calculations/money";
import { today } from "../../utils/dates";
import { messageOf } from "./FinancialShared";
export const defaultCategories = [
  "Revenue",
  "Rent Expense",
  "Contract Labour",
  "Salon Supplies",
  "Bank Fees",
  "Utilities",
  "Vehicle Expense",
  "Insurance Expense",
  "Telephone & Internet Expense",
  "Professional Fee",
  "Meals & Entertainment",
  "Repairs & Maintenance",
  "Office Supplies",
  "Loan Interest",
  "Owner distribution",
  "Transfer",
  "Needs review",
  "Adjustment",
];
const entryKinds = [
  "Revenue",
  "Operating expense",
  "Bank deposit",
  "Bank withdrawal",
  "Transfer",
  "Loan advance",
  "Loan principal repayment",
  "Loan interest",
  "Credit card payment",
  "Owner distribution",
  "Needs review",
] as const;
export function TransactionForm({
  record,
  onClose,
}: {
  record?: Transaction;
  onClose: () => void;
}) {
  const { scope, shops } = useApp();
  const data = useFinance();
  const [createId] = useState(() => crypto.randomUUID());
  const [shopId, setShopId] = useState(
    record?.shopId ?? (scope === "all" ? "" : scope),
  );
  const [kind, setKind] = useState<Transaction["kind"]>(
    record?.kind ?? "Operating expense",
  );
  const [date, setDate] = useState(record?.businessDate ?? today());
  const [amount, setAmount] = useState(
    record ? moneyInput(record.amountCents) : "",
  );
  const [accountId, setAccount] = useState(record?.accountId ?? "");
  const [destShop, setDestShop] = useState(
    record?.destinationShopId ??
      record?.shopId ??
      (scope === "all" ? "" : scope),
  );
  const [destination, setDestination] = useState(
    record?.destinationAccountId ?? "",
  );
  const [stylistId, setStylistId] = useState("");
  const [category, setCategory] = useState(record?.category ?? "");
  const [payee, setPayee] = useState(record?.payee ?? "");
  const [description, setDescription] = useState(record?.description ?? "");
  const [method, setMethod] = useState(
    record?.paymentMethod ?? "Bank transfer",
  );
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preferences = useLiveQuery(
    () => db.settings.get(`financial:${shopId}`),
    [shopId],
  );
  const paired = [
    "Transfer",
    "Loan advance",
    "Loan principal repayment",
    "Credit card payment",
  ].includes(kind);
  const categories = [
    ...new Set([
      ...defaultCategories,
      ...(financialPreferencesSchema.safeParse(preferences?.value).data
        ?.categories ?? []),
      ...(data?.transactions
        .filter((t) => t.shopId === shopId)
        .map((t) => t.category) ?? []),
    ]),
  ];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (kind === "Adjustment") {
        await financeService.saveAdjustment(
          {
            shopId,
            stylistId,
            businessDate: date,
            amountCents: parseMoney(amount),
            reason: description,
            adjustmentKind: "Correction",
            periodMode: "calendar",
          },
          { createId },
        );
      } else
        await financeService.saveTransaction(
          {
            shopId,
            businessDate: date,
            kind,
            amountCents: parseMoney(amount),
            accountId: accountId || undefined,
            destinationAccountId: paired ? destination || undefined : undefined,
            destinationShopId: paired
              ? kind === "Transfer"
                ? destShop
                : shopId
              : undefined,
            category,
            payee,
            description,
            paymentMethod: method,
            notes,
          },
          { id: record?.id, expectedRevision: record?.revision, createId },
        );
      onClose();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title={`${record ? "Edit" : "Add"} transaction`}
      description="Record a business event once. Choose the type that describes what happened."
    >
      <form onSubmit={submit} className="form-stack">
        {error && <ErrorMessage message={error} />}
        <div className="form-grid">
          <Field label="Shop">
            <select
              required
              disabled={!!record}
              value={shopId}
              onChange={(e) => {
                setShopId(e.target.value);
                setAccount("");
                setDestShop(e.target.value);
                setDestination("");
              }}
            >
              <option value="">Select a shop</option>
              {shops
                .filter((s) => s.status === "active")
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Date">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Transaction type">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {entryKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount">
            <MoneyInput
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Category (customizable)">
            <input
              required
              list="transaction-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field label="Payee">
            <input value={payee} onChange={(e) => setPayee(e.target.value)} />
          </Field>
        </div>
        <Field label={paired ? "Source account" : "Financial account"}>
          <select
            required={kind !== "Needs review" && kind !== "Adjustment"}
            value={accountId}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">Select an account</option>
            {data?.accounts
              .filter((a) => a.shopId === shopId && a.status === "active")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.type}
                </option>
              ))}
          </select>
        </Field>
        {kind === "Adjustment" && (
          <>
            <Field label="Adjustment stylist">
              <select
                required
                value={stylistId}
                onChange={(e) => setStylistId(e.target.value)}
              >
                <option value="">Select stylist</option>
                {data?.stylists
                  .filter((s) => s.shopId === shopId && !s.deletedAt)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="notice">
              Commission settlement correction only. Enter a positive or
              negative amount and explain it in Description. This changes
              neither cash nor operating expense. Detailed adjustment types are
              available in Stylists & Commissions.
            </p>
          </>
        )}
        {paired && (
          <div className="form-grid">
            {kind === "Transfer" && (
              <Field label="Destination shop">
                <select
                  value={destShop}
                  required
                  onChange={(e) => {
                    setDestShop(e.target.value);
                    setDestination("");
                  }}
                >
                  <option value="">Select a shop</option>
                  {shops
                    .filter((s) => s.status === "active")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Destination account">
              <select
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">Select destination</option>
                {data?.accounts
                  .filter(
                    (a) =>
                      a.shopId === (kind === "Transfer" ? destShop : shopId) &&
                      a.status === "active" &&
                      a.id !== accountId,
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.type}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        )}
        {kind === "Needs review" && (
          <div className="notice">
            Preserved for review. This entry will not affect profit or balances
            until explicitly classified.
          </div>
        )}
        {["Bank deposit", "Bank withdrawal"].includes(kind) && (
          <div className="notice">
            Money movement only. For a transfer between known accounts, use
            Transfer. For a new sale, use Revenue or Daily Sales.
          </div>
        )}
        {kind === "Revenue" && (
          <div className="notice">
            Record only revenue not already included in Daily Sales. Depositing
            previously recorded sales is a Transfer or Bank deposit, not new
            revenue.
          </div>
        )}
        <datalist id="transaction-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label="Description">
          <input
            required
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Payment method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["Bank transfer", "Cash", "Debit / card", "Cheque", "Other"].map(
              (m) => (
                <option key={m}>{m}</option>
              ),
            )}
          </select>
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save transaction"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
