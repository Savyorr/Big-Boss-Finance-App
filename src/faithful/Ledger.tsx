import { useState } from "react";
import { write, revised, remove } from "./store";
import {
  Of,
  rows,
  settings,
  today,
  formatMoney as M,
  addCents as sum,
  bankAt,
  ledgerCategory,
} from "./model";
import { Field, Table, Panel, Confirm, Common } from "./ui";
import { TransactionForm } from "./TransactionForm";
export function Ledger(c: Common) {
  const { db, all, run, notify, busy } = c;
  const [editor, setEditor] = useState<Of<"tx"> | "new" | null>(null),
    [deleting, setDeleting] = useState<Of<"tx"> | null>(null),
    [month, setMonth] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const tx = rows(all, "tx")
    .filter(
      (e) =>
        (!month || e.value.date.startsWith(month)) &&
        [
          e.value.category,
          e.value.sub,
          e.value.payee,
          e.value.details,
          e.value.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.value.date.localeCompare(a.value.date) || a.id.localeCompare(b.id),
    );
  const at = Math.min(page, Math.max(0, Math.ceil(tx.length / 50) - 1));
  const [balances, setBalances] = useState(false);
  const s = settings(all),
    ol = s.balances.find((b) => b.name === "Operating Line")?.amount;
  const after = rows(all, "tx").filter((e) => e.value.date > s.asOf);
  const olNow =
    ol === undefined
      ? undefined
      : sum(
          ol,
          ...after
            .filter((e) => ledgerCategory(e.value) === "Loan Payment")
            .map((e) => e.value.bankDebit),
          ...after
            .filter((e) => ledgerCategory(e.value) === "Loan Credit")
            .map((e) => -e.value.bankDeposit),
        );
  return (
    <>
      <div className="actions">
        <button className="primary" onClick={() => setEditor("new")}>
          Add expense or transfer
        </button>
        <button onClick={() => setBalances(!balances)}>
          {balances ? "Hide" : "Show"} bank balances
        </button>
      </div>
      {editor && (
        <Panel
          title={
            editor === "new" ? "Add expense or transfer" : "Edit transaction"
          }
        >
          <TransactionForm
            key={typeof editor === "string" ? editor : editor.id}
            all={all}
            old={editor === "new" ? undefined : editor}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSave={(v) =>
              run(async () => {
                await write(
                  db,
                  revised(
                    "tx",
                    editor === "new" ? crypto.randomUUID() : editor.id,
                    v,
                    editor === "new" ? undefined : editor,
                  ),
                );
                setEditor(null);
                notify("Transaction saved");
              })
            }
          />
        </Panel>
      )}
      {balances && (
        <Panel title="Account balances">
          <Table heads={["Account", "Balance", "As of / basis"]}>
            <tr>
              <td>Chequing</td>
              <td>
                {s.openingKnown
                  ? M(bankAt(all, today()))
                  : "Opening balance not supplied"}
              </td>
              <td>Calculated from saved receipts and bank movements</td>
            </tr>
            {s.balances.map((b, i) => (
              <tr key={i}>
                <td>{b.name}</td>
                <td>
                  {M(
                    b.name === "Operating Line"
                      ? (olNow ?? b.amount)
                      : b.amount,
                  )}
                </td>
                <td>
                  {b.name === "Operating Line"
                    ? "Available credit: " + M(sum(s.limit, olNow ?? 0))
                    : s.asOf}
                </td>
              </tr>
            ))}
          </Table>
          <p className="muted small">
            Opening and statement balances are set in Settings. Transaction-only
            backups do not establish an opening balance.
          </p>
        </Panel>
      )}
      <Panel title="Transaction history">
        <div className="form-grid">
          <Field label="Filter month">
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(0);
              }}
            />
          </Field>
          <Field label="Search transactions">
            <input
              type="search"
              placeholder="Payee, category, details…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </Field>
        </div>
        <p className="muted">{tx.length} transactions</p>
        <Table
          heads={[
            "Date",
            "Category",
            "Payee",
            "Details",
            "Income",
            "Expense",
            "Bank in",
            "Bank out",
            "Actions",
          ]}
        >
          {tx.slice(at * 50, (at + 1) * 50).map((e) => (
            <tr key={e.id}>
              <td>{e.value.date}</td>
              <td>
                {e.value.category}
                {e.value.sub ? " · " + e.value.sub : ""}
              </td>
              <td>{e.value.payee}</td>
              <td>{e.value.details}</td>
              <td className="income">{M(e.value.income)}</td>
              <td className="expense">{M(e.value.expense)}</td>
              <td>{M(sum(e.value.bankCredit, e.value.bankDeposit))}</td>
              <td>{M(e.value.bankDebit)}</td>
              <td>
                <button
                  aria-label={"Edit transaction " + e.id}
                  onClick={() => {
                    setEditor(e);
                    window.scrollTo(0, 0);
                  }}
                >
                  Edit
                </button>
                <button
                  className="danger"
                  aria-label={"Delete transaction " + e.id}
                  onClick={() => setDeleting(e)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!tx.length && <p className="empty">No transactions match.</p>}
        <div className="pagination">
          <button disabled={!at} onClick={() => setPage(at - 1)}>
            Previous
          </button>
          <span>
            Page {at + 1} of {Math.max(1, Math.ceil(tx.length / 50))}
          </span>
          <button
            disabled={(at + 1) * 50 >= tx.length}
            onClick={() => setPage(at + 1)}
          >
            Next
          </button>
        </div>
      </Panel>
      {deleting && (
        <Confirm
          title="Delete transaction?"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void run(async () => {
              await remove(db, deleting);
              setDeleting(null);
              notify(
                "Transaction deleted; deletion is retained for synchronization.",
              );
            })
          }
        >
          <p>
            {deleting.value.date} · {deleting.value.payee} ·{" "}
            {M(
              deleting.value.expense ||
                deleting.value.income ||
                deleting.value.bankDebit,
            )}
          </p>
        </Confirm>
      )}
    </>
  );
}
