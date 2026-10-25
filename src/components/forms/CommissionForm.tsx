import { useState, type FormEvent } from "react";
import { useApp } from "../../app/context";
import { useFinance } from "../../hooks/useFinance";
import { type CommissionPayment, type Adjustment } from "../../models";
import { financeService } from "../../services/finance";
import { isCashAccount } from "../../calculations/finance";
import { moneyInput, parseMoney } from "../../calculations/money";
import { today } from "../../utils/dates";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field, MoneyInput, DateInput, ErrorMessage } from "../ui/shared";
import { messageOf } from "./FinancialShared";
export function CommissionForm({
  kind,
  record,
  onClose,
}: {
  kind: "payment" | "adjustment";
  record?: CommissionPayment | Adjustment;
  onClose: () => void;
}) {
  const { scope, shops } = useApp();
  const data = useFinance();
  const [createId] = useState(() => crypto.randomUUID());
  const [shopId, setShop] = useState(
    record?.shopId ?? (scope === "all" ? "" : scope),
  );
  const [stylistId, setStylist] = useState(record?.stylistId ?? "");
  const [accountId, setAccount] = useState(
    record && "accountId" in record ? record.accountId : "",
  );
  const [date, setDate] = useState(record?.businessDate ?? today());
  const [amount, setAmount] = useState(
    record ? moneyInput(record.amountCents) : "",
  );
  const [method, setMethod] = useState(
    record && "paymentMethod" in record
      ? (record.paymentMethod ?? "Bank transfer")
      : "Bank transfer",
  );
  const [notes, setNotes] = useState(
    record && "notes" in record
      ? (record.notes ?? "")
      : record && "reason" in record
        ? record.reason
        : "",
  );
  const [adjustmentKind, setAdjustmentKind] = useState<
    NonNullable<Adjustment["adjustmentKind"]>
  >(
    record && "adjustmentKind" in record
      ? (record.adjustmentKind ?? "Correction")
      : "Correction",
  );
  const [mode, setMode] = useState<"calendar" | "legacy">(
    record?.periodMode ?? "calendar",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const options = {
        id: record?.id,
        expectedRevision: record?.revision,
        createId,
      };
      if (kind === "payment")
        await financeService.savePayment(
          {
            shopId,
            stylistId,
            accountId,
            businessDate: date,
            amountCents: parseMoney(amount),
            paymentMethod: method,
            notes,
            periodMode: mode,
          },
          options,
        );
      else
        await financeService.saveAdjustment(
          {
            shopId,
            stylistId,
            businessDate: date,
            amountCents: parseMoney(amount),
            reason: notes,
            adjustmentKind,
            periodMode: mode,
          },
          options,
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
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={`${record ? "Edit" : kind === "payment" ? "Pay stylist" : "Add"} ${kind === "payment" && !record ? "" : kind}`}
      description={
        kind === "payment"
          ? "Settle commissions already earned. The payment reduces the account balance, without a second expense."
          : "Settlement correction only. Positive reduces what is owed; negative increases it. No cash or profit entry is created."
      }
    >
      <form className="form-stack" onSubmit={submit}>
        {error && <ErrorMessage message={error} />}
        <Field label="Shop">
          <select
            value={shopId}
            required
            disabled={!!record}
            onChange={(e) => {
              setShop(e.target.value);
              setStylist("");
              setAccount("");
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
        <Field label="Stylist">
          <select
            required
            value={stylistId}
            onChange={(e) => setStylist(e.target.value)}
          >
            <option value="">Select a stylist</option>
            {data?.stylists
              .filter((s) => s.shopId === shopId && !s.deletedAt)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Payment or adjustment date">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount">
            <MoneyInput
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>
        {kind === "payment" ? (
          <>
            <Field label="Payment account">
              <select
                required
                value={accountId}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">Select an account</option>
                {data?.accounts
                  .filter(
                    (a) =>
                      a.shopId === shopId &&
                      a.status === "active" &&
                      isCashAccount(a),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {["Bank transfer", "Cash", "Cheque", "Other"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Adjustment type">
              <select
                value={adjustmentKind}
                onChange={(e) =>
                  setAdjustmentKind(e.target.value as typeof adjustmentKind)
                }
              >
                {[
                  "Correction",
                  "Advance reclassification",
                  "Deduction",
                  "Previously settled",
                  "Other",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <p className="notice">
              An advance reclassification changes settlement tracking only.
              Record any actual cash advance separately as a bank withdrawal; it
              is not automatically a commission expense.
            </p>
          </>
        )}
        <Field label="Pay-period treatment">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="calendar">
              Actual date · halves split at day 15
            </option>
            <option value="legacy">
              Legacy · payments through day 22 assigned to first half
            </option>
          </select>
        </Field>
        <Field
          label={
            kind === "payment" ? "Payment notes" : "Explanation (required)"
          }
        >
          <textarea
            required={kind === "adjustment"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
          <Button disabled={busy} type="submit">
            {busy
              ? "Saving…"
              : kind === "payment"
                ? "Save payment"
                : "Save adjustment"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
