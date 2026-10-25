import { useState } from "react";
import {
  Entity,
  Of,
  Tx,
  rows,
  today,
  moneyInput as I,
  addCents as sum,
  SUBS,
  TRANSFERS,
  categoryKey,
} from "./model";
import { Field, Money, text, cents } from "./ui";
export function TransactionForm({
  all,
  old,
  preset,
  onSave,
  onCancel,
  busy,
}: {
  all: Entity[];
  old?: Of<"tx">;
  preset?: Partial<Tx>;
  onSave: (v: Tx) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const x = old?.value;
  const initial = x ?? preset;
  const [kind, setKind] = useState(
      x?.income
        ? "Income"
        : x?.expense
          ? "Expense"
          : x
            ? "Transfer"
            : "Expense",
    ),
    [category, setCategory] = useState(initial?.category ?? ""),
    [payee, setPayee] = useState(initial?.payee ?? ""),
    [direction, setDirection] = useState(
      x && (x.bankCredit || x.bankDeposit) ? "in" : "out",
    );
  const [advanced, setAdvanced] = useState(false),
    [formError, setFormError] = useState("");
  const categories =
    kind === "Transfer"
      ? TRANSFERS
      : [
          ...new Set([
            "Rent Expense",
            "Contract Labour",
            "Salon Supplies",
            ...Object.keys(SUBS),
            ...rows(all, "tx")
              .filter((e) => e.value.expense)
              .map((e) => e.value.category),
          ]),
        ].sort();
  const key = categoryKey(category),
    subs = SUBS[key];
  const initialAmount = x
    ? x.income || x.expense || sum(x.bankCredit, x.bankDeposit) || x.bankDebit
    : 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setFormError("");
        void (async () => {
          const amount = cents(f, "amount"),
            cat =
              kind === "Expense"
                ? categoryKey(category || "Uncategorized")
                : category || "Bank Account";
          if (!old && amount <= 0) throw Error("Enter a positive amount");
          if (
            kind === "Transfer" &&
            ((cat === "Loan Credit" && direction !== "in") ||
              (cat === "Loan Payment" && direction !== "out"))
          )
            throw Error(cat + " has the wrong direction");
          let amounts = {
            income: x?.income ?? 0,
            expense: x?.expense ?? 0,
            bankCredit: x?.bankCredit ?? 0,
            bankDeposit: x?.bankDeposit ?? 0,
            bankDebit: x?.bankDebit ?? 0,
          };
          const paid = text(f, "bank");
          const originalKind = x?.income
            ? "Income"
            : x?.expense
              ? "Expense"
              : "Transfer";
          const unchanged =
            !!x &&
            kind === originalKind &&
            amount === initialAmount &&
            (kind === "Transfer" ||
              paid === "keep" ||
              (paid === "1" &&
                (kind === "Income"
                  ? x.bankCredit === x.income
                  : x.bankDebit === x.expense)) ||
              (paid === "0" &&
                (kind === "Income"
                  ? x.bankCredit === 0
                  : x.bankDebit === 0))) &&
            (kind !== "Transfer" ||
              direction === (x.bankCredit || x.bankDeposit ? "in" : "out"));
          if (!unchanged) {
            if (!x || kind !== originalKind)
              amounts = {
                income: 0,
                expense: 0,
                bankCredit: 0,
                bankDeposit: 0,
                bankDebit: 0,
              };
            if (kind === "Expense") {
              amounts.expense = amount;
              amounts.bankDebit =
                paid === "1"
                  ? amount
                  : paid === "keep"
                    ? (x?.bankDebit ?? 0)
                    : 0;
            } else if (kind === "Income") {
              amounts.income = amount;
              amounts.bankCredit =
                paid === "1"
                  ? amount
                  : paid === "keep"
                    ? (x?.bankCredit ?? 0)
                    : 0;
            } else if (direction === "out") amounts.bankDebit = amount;
            else if (x?.bankCredit && !x.bankDeposit)
              amounts.bankCredit = amount;
            else if (x?.bankCredit && x.bankDeposit && !advanced)
              throw Error(
                "This row has both bank credits and deposits. Use Original recorded amounts to correct them separately.",
              );
            else amounts.bankDeposit = amount;
          }
          if (advanced)
            for (const k of [
              "income",
              "expense",
              "bankCredit",
              "bankDeposit",
              "bankDebit",
            ] as const)
              amounts[k] = cents(f, k);
          const payee = text(f, "payee"),
            stylist = rows(all, "staff").find(
              (s) => s.value.name.toLowerCase() === payee.toLowerCase(),
            );
          const value: Tx = {
            ...amounts,
            date: text(f, "date"),
            type: unchanged ? x!.type : kind,
            category: cat,
            sub: text(f, "sub"),
            payee,
            details: text(f, "details"),
            notes: text(f, "notes"),
            ...(cat === "Contract Labour" && stylist
              ? { staffId: stylist.id }
              : {}),
            ...(x?.raw ? { raw: x.raw } : {}),
          };
          await onSave(value);
        })().catch((e) =>
          setFormError(
            e instanceof Error ? e.message : "Check the entered amounts",
          ),
        );
      }}
    >
      <div className="form-grid">
        <Field label="Transaction date">
          <input
            name="date"
            type="date"
            defaultValue={initial?.date ?? today()}
            required
          />
        </Field>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option>Expense</option>
            <option>Transfer</option>
            <option>Income</option>
          </select>
        </Field>
        <Field label="Category">
          <input
            name="category"
            list="category-options"
            value={category}
            onChange={(e) => {
              const c = /^loan credit$/i.test(e.target.value)
                ? "Loan Credit"
                : /^loan payment$/i.test(e.target.value)
                  ? "Loan Payment"
                  : e.target.value;
              setCategory(c);
              if (c === "Loan Credit") setDirection("in");
              if (c === "Loan Payment") setDirection("out");
              if ((c === "Loan Credit" || c === "Loan Payment") && !payee)
                setPayee("Operating Line");
            }}
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </datalist>
        </Field>
        {kind === "Expense" && subs && (
          <Field label="Sub-account">
            <select name="sub" defaultValue={x?.sub ?? ""}>
              <option value="">None</option>
              {subs.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Payee">
          <input
            name="payee"
            list="barber-options"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
          <datalist id="barber-options">
            {rows(all, "staff").map((s) => (
              <option key={s.id}>{s.value.name}</option>
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Details">
        <input name="details" defaultValue={x?.details ?? ""} />
      </Field>
      <div className="form-grid">
        <Money
          label={advanced ? "Amount (edit original fields below)" : "Amount"}
          name="amount"
          value={I(initialAmount)}
          readOnly={advanced}
        />
        {kind === "Transfer" ? (
          <Field label="Direction">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="in">Into Chequing (deposit)</option>
              <option value="out">Out of Chequing (withdrawal)</option>
            </select>
          </Field>
        ) : (
          <Field
            label={kind === "Income" ? "Received in bank?" : "Paid from bank?"}
          >
            <select name="bank" defaultValue={x ? "keep" : "1"}>
              <option value="1">Yes</option>
              <option value="0">No (cash / Visa)</option>
              {x && <option value="keep">Keep original bank amount</option>}
            </select>
          </Field>
        )}
      </div>
      <Field label="Transaction notes">
        <textarea name="notes" defaultValue={x?.notes ?? ""} />
      </Field>
      {x && (
        <details onToggle={(e) => setAdvanced(e.currentTarget.open)}>
          <summary>Original recorded amounts</summary>
          <div className="form-grid">
            {(
              [
                "income",
                "expense",
                "bankCredit",
                "bankDeposit",
                "bankDebit",
              ] as const
            ).map((k) => (
              <Money key={k} label={k} name={k} value={I(x[k])} signed />
            ))}
          </div>
        </details>
      )}
      <div>
        {formError && (
          <p role="alert" className="error">
            {formError}
          </p>
        )}
      </div>
      <div className="actions">
        <button className="primary" disabled={busy}>
          {old ? "Save transaction" : "Add transaction"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
