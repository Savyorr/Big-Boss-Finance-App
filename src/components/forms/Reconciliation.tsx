import { useState, type FormEvent } from "react";
import type { Account } from "../../models";
import { useFinance } from "../../hooks/useFinance";
import {
  reconciliationState,
  reconciliationIsCurrent,
} from "../../calculations/finance";
import { parseMoney, formatMoney } from "../../calculations/money";
import { financeService } from "../../services/finance";
import { today } from "../../utils/dates";
import { Button } from "../ui/button";
import {
  Field,
  MoneyInput,
  DateInput,
  DataTable,
  ErrorMessage,
  LoadingState,
} from "../ui/shared";
import { messageOf } from "./FinancialShared";
export function ReconciliationForm({ account }: { account: Account }) {
  const data = useFinance();
  const [date, setDate] = useState(today());
  const [statement, setStatement] = useState("");
  const [selected, setSelected] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) return <LoadingState />;
  const history = data.reconciliations
    .filter((r) => r.accountId === account.id && !r.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cleared =
    selected ??
    history.find(
      (r) =>
        r.status === "completed" && reconciliationIsCurrent(r, data, account),
    )?.clearedKeys ??
    [];
  let amount = 0,
    valid = true;
  try {
    amount = parseMoney(statement);
  } catch {
    valid = false;
  }
  const state = reconciliationState(data, account, date, cleared, amount);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const current = state.rows.filter((r) => cleared.includes(r.key));
      const result = await financeService.saveReconciliation({
        shopId: account.shopId,
        accountId: account.id,
        statementDate: date,
        statementBalanceCents: parseMoney(statement),
        clearedKeys: current.map((r) => r.key),
        expectedAccountRevision: account.revision,
        expectedEventRevisions: Object.fromEntries(
          current.map((r) => [r.key, r.revision]),
        ),
      });
      setSuccess(
        result.status === "completed"
          ? "Reconciliation completed with zero difference."
          : "Saved as in progress. An unexplained difference remains.",
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack reconciliation-form" onSubmit={save}>
      <p className="muted small">
        Select the cumulative cleared movements through the statement date,
        including previously cleared entries. Liability balances use a negative
        amount for debt owed.
      </p>
      {error && <ErrorMessage message={error} />}
      <div className="form-grid">
        <Field label="Statement date">
          <DateInput
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelected(null);
            }}
          />
        </Field>
        <Field label="Statement closing balance">
          <MoneyInput
            required
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
        </Field>
      </div>
      <div className="totals-grid">
        <span>
          Calculated balance
          <strong>
            {state.calculatedCents === null
              ? "Before opening date"
              : formatMoney(state.calculatedCents)}
          </strong>
        </span>
        <span>
          Cleared balance
          <strong>{formatMoney(state.clearedBalanceCents)}</strong>
        </span>
        <span>
          Statement balance<strong>{valid ? formatMoney(amount) : "—"}</strong>
        </span>
        <span>
          Difference
          <strong>{valid ? formatMoney(state.differenceCents) : "—"}</strong>
        </span>
      </div>
      <DataTable
        columns={["Cleared", "Date", "Description", "Movement"]}
        empty={!state.rows.length}
        title="No movements through this date"
        description="Opening balance is included once; earlier movements are excluded."
      >
        {state.rows.map((r) => (
          <tr key={r.key}>
            <td>
              <input
                type="checkbox"
                aria-label={`Clear ${r.description} ${r.date}`}
                checked={cleared.includes(r.key)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...cleared, r.key]
                      : cleared.filter((k) => k !== r.key),
                  )
                }
              />
            </td>
            <td>{r.date}</td>
            <td>{r.description}</td>
            <td>{formatMoney(r.deltaCents)}</td>
          </tr>
        ))}
      </DataTable>
      <p className="muted small">
        {state.outstanding.length} outstanding movements. A nonzero difference
        can be saved only as in progress.
      </p>
      <Button
        type="submit"
        disabled={busy || !valid || state.calculatedCents === null}
      >
        {busy
          ? "Saving…"
          : valid && state.differenceCents === 0
            ? "Complete reconciliation"
            : "Save reconciliation in progress"}
      </Button>
      {success && (
        <p role="status" className="notice">
          {success}
        </p>
      )}
      <DataTable
        columns={[
          "Statement date",
          "Statement balance",
          "Difference",
          "Status",
        ]}
        empty={!history.length}
        title="No reconciliation history"
      >
        {history.map((r) => (
          <tr key={r.id}>
            <td>{r.statementDate}</td>
            <td>{formatMoney(r.statementBalanceCents)}</td>
            <td>{formatMoney(r.differenceCents)}</td>
            <td>
              {reconciliationIsCurrent(r, data, account)
                ? r.status
                : "Needs review · records changed"}
            </td>
          </tr>
        ))}
      </DataTable>
    </form>
  );
}
