import { useState } from "react";
import { write, revised } from "./store";
import {
  rows,
  settings,
  today,
  previousMonth,
  monthName,
  summary,
  formatMoney as M,
  addCents as sum,
  earned,
  bankAt,
  ledgerCategory,
  ledgerSub,
} from "./model";
import { Field, Table, Panel, Common } from "./ui";
export function Reports({ db, all, run, notify, busy }: Common) {
  const [month, setMonth] = useState(previousMonth());
  const r = summary(all, month),
    tx = rows(all, "tx").filter((t) => t.value.date.startsWith(month)),
    days = rows(all, "day")
      .filter((d) => d.value.date.startsWith(month))
      .map((d) => d.value),
    s = settings(all),
    cats = new Map<string, { total: number; subs: Map<string, number> }>();
  for (const t of tx) {
    if (t.value.expense <= 0) continue;
    const name = ledgerCategory(t.value),
      g = cats.get(name) ?? { total: 0, subs: new Map<string, number>() };
    g.total = sum(g.total, t.value.expense);
    const sub = ledgerSub(t.value) || "No sub-account";
    g.subs.set(sub, sum(g.subs.get(sub) ?? 0, t.value.expense));
    cats.set(name, g);
  }
  const prev = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1,
      0,
      12,
    ),
    end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12);
  const nonloan = tx.filter(
    (t) => !["Loan Credit", "Loan Payment"].includes(ledgerCategory(t.value)),
  );
  return (
    <>
      <div className="actions no-print">
        <Field label="Report month">
          <input
            type="month"
            required
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </Field>
        <button className="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <h2>{monthName(month)} · Financial report</h2>
      {r.overlapDates.length > 0 && (
        <Panel title="Sales recorded in two places">
          <p>
            The following dates have both a daily total and recorded transaction
            income. Until you choose, only the transaction income is counted for
            each date.
          </p>
          {r.overlapDates.map((date) => (
            <div className="actions" key={date}>
              <strong>{date}</strong>
              <span className="muted small">
                {s.overlaps[date]
                  ? "Chosen: " +
                    {
                      daily: "Daily sales",
                      ledger: "Transaction income",
                      both: "Both are separate sales",
                    }[s.overlaps[date]]
                  : "Choose the source"}
              </span>
              {(["daily", "ledger", "both"] as const).map((choice) => (
                <button
                  disabled={busy}
                  key={choice}
                  onClick={() =>
                    void run(async () => {
                      const old = rows(all, "settings")[0];
                      await write(
                        db,
                        revised(
                          "settings",
                          old.id,
                          { ...s, overlaps: { ...s.overlaps, [date]: choice } },
                          old,
                        ),
                      );
                      notify("Revenue source saved for " + date);
                    })
                  }
                >
                  {choice === "daily"
                    ? "Use daily sales"
                    : choice === "ledger"
                      ? "Use transaction income"
                      : "Both are separate sales"}
                </button>
              ))}
            </div>
          ))}
        </Panel>
      )}
      <Panel title="Profit & loss">
        <Table heads={["Measure", "CAD"]}>
          <tr className="total">
            <td>Revenue</td>
            <td>{M(r.revenue)}</td>
          </tr>
          {days.length > 0 && (
            <>
              <tr>
                <td>Card / debit receipts</td>
                <td>{M(r.card)}</td>
              </tr>
              <tr>
                <td>Cash received from saved days</td>
                <td>{M(sum(...days.map((d) => sum(d.total, -d.card))))}</td>
              </tr>
            </>
          )}
          <tr className="total">
            <td>Expenses</td>
            <td>{M(r.expenses)}</td>
          </tr>
          {[...cats]
            .sort((a, b) => b[1].total - a[1].total)
            .map(([name, g]) => (
              <tr key={name}>
                <td>
                  {name}
                  {[...g.subs.keys()].some((k) => k !== "No sub-account") && (
                    <ul className="small muted">
                      {[...g.subs].map(([k, v]) => (
                        <li key={k}>
                          {k}: {M(v)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>{M(g.total)}</td>
              </tr>
            ))}
          <tr className="total">
            <td>Profit</td>
            <td>{M(r.profit)}</td>
          </tr>
        </Table>
        <p className="muted small">
          Recorded revenue − recorded expenses. Contract Labour is included once
          in expenses. Bank movements are not additional income or expenses.
        </p>
      </Panel>
      <Panel title="Stylist commissions">
        {s.historyIncomplete && days.length > 0 && (
          <p className="muted small">
            Service revenue and commission cover saved daily sales only;
            historical individual earnings are unavailable.
          </p>
        )}
        <Table
          heads={[
            "Stylist",
            "Service revenue",
            "Commission",
            "Paid this month",
          ]}
        >
          {rows(all, "staff").map((st) => (
            <tr key={st.id}>
              <td>{st.value.name}</td>
              <td>
                {s.historyIncomplete && !days.length
                  ? "Unavailable for historical backup"
                  : M(sum(...days.map((d) => d.sales[st.id] ?? 0)))}
              </td>
              <td>
                {s.historyIncomplete && !days.length
                  ? "Unavailable for historical backup"
                  : M(earned(days, st.id))}
              </td>
              <td>
                {M(
                  sum(
                    ...tx
                      .filter(
                        (t) =>
                          t.value.category === "Contract Labour" &&
                          t.value.staffId === st.id,
                      )
                      .map((t) => t.value.expense),
                  ),
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td>Sale Product (no commission)</td>
            <td>{M(r.product)}</td>
            <td>{M(0)}</td>
            <td>—</td>
          </tr>
        </Table>
      </Panel>
      <Panel title="Chequing account movement">
        <Table heads={["Movement", "CAD"]}>
          <tr>
            <td>
              {s.openingKnown
                ? "Opening balance"
                : "Recorded movement before this month"}
            </td>
            <td>{M(bankAt(all, today(prev)))}</td>
          </tr>
          <tr>
            <td>Card receipts and sales deposits</td>
            <td>{M(sum(...days.map((d) => sum(d.card, d.deposit))))}</td>
          </tr>
          <tr>
            <td>Loan Credit (drawn from Operating Line)</td>
            <td>
              {M(
                sum(
                  ...tx
                    .filter((t) => ledgerCategory(t.value) === "Loan Credit")
                    .map((t) => t.value.bankDeposit),
                ),
              )}
            </td>
          </tr>
          <tr>
            <td>Other deposits and transfers in</td>
            <td>
              {M(
                sum(
                  ...nonloan.map((t) =>
                    sum(t.value.bankCredit, t.value.bankDeposit),
                  ),
                ),
              )}
            </td>
          </tr>
          <tr>
            <td>Loan Payment (to Operating Line)</td>
            <td>
              {M(
                -sum(
                  ...tx
                    .filter((t) => ledgerCategory(t.value) === "Loan Payment")
                    .map((t) => t.value.bankDebit),
                ),
              )}
            </td>
          </tr>
          <tr>
            <td>Expenses paid from bank and other withdrawals</td>
            <td>{M(-sum(...nonloan.map((t) => t.value.bankDebit)))}</td>
          </tr>
          <tr className="total">
            <td>
              {s.openingKnown
                ? "Closing balance"
                : "Recorded cumulative movement · opening not supplied"}
            </td>
            <td>{M(bankAt(all, today(end)))}</td>
          </tr>
        </Table>
        <p className="muted small">
          Calculated from the opening balance in Settings; a transaction-only
          file does not supply an original opening balance.
        </p>
      </Panel>
    </>
  );
}
