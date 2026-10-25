import { reportingRangeIssue } from "../utils/dates";
import { dateOnly } from "../models";
import { useState } from "react";
import { Printer, FileChartColumn } from "lucide-react";
import { useApp } from "../app/context";
import { useFinance } from "../hooks/useFinance";
import { ShopSelector } from "../components/layout/ShopSelector";
import { Button } from "../components/ui/button";
import {
  PageHeader,
  Panel,
  DataTable,
  LoadingState,
} from "../components/ui/shared";
import {
  DateRangeControls,
  useDateRange,
  accountingBasis,
} from "../components/forms/FinancialShared";
import {
  summarize,
  monthlySeries,
  scoped,
  inRange,
  accountBalance,
  movements,
  commissionSummary,
  reconciliationIsCurrent,
} from "../calculations/finance";
import { addCents, formatMoney } from "../calculations/money";
const reports = [
  "Profit & Loss",
  "Revenue Summary",
  "Expense Breakdown",
  "Cash Flow",
  "Commission Summary",
  "Banking Summary",
  "Location Comparison",
  "Annual Overview",
];
export function ReportsPage() {
  const { scope, shops, locationName } = useApp();
  const data = useFinance();
  const [report, setReport] = useState(reports[0]);
  const [range, setRange] = useDateRange();
  if (!data) return <LoadingState />;
  const rangeIssue = reportingRangeIssue(range.from, range.to);
  if (rangeIssue)
    return (
      <>
        <PageHeader
          eyebrow={locationName}
          title="Reports"
          description="Choose a valid date range."
        />
        <DateRangeControls range={range} onChange={setRange} />
        <p className="error-message" role="alert">
          {rangeIssue}
        </p>
      </>
    );
  const summary = summarize(data, scope, range.from, range.to);
  const monthly = monthlySeries(data, scope, range.from, range.to);
  const tx = scoped(data.transactions, scope).filter(
    (t) =>
      !t.deletedAt &&
      t.accountingStatus === "classified" &&
      inRange(t.businessDate, range.from, range.to),
  );
  const stylists = scoped(data.stylists, scope).filter((s) => !s.deletedAt);
  const locations = shops.filter((s) => scope === "all" || s.id === scope);
  const accounts = scoped(data.accounts, scope).filter((a) => !a.deletedAt);
  const byDay = new Map<string, number>();
  for (const t of tx)
    if (t.revenueCents)
      byDay.set(
        t.businessDate,
        addCents(byDay.get(t.businessDate) ?? 0, t.revenueCents),
      );
  return (
    <>
      <PageHeader
        eyebrow={locationName}
        title="Reports"
        description="Shared calculations for every view. Print or save as PDF in your browser."
        action={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} />
            Print / Save as PDF
          </Button>
        }
      />
      <DateRangeControls range={range} onChange={setRange} />
      {range.from > range.to && (
        <p role="alert" className="error-message">
          From must be on or before To.
        </p>
      )}
      <div className="report-workspace">
        <nav aria-label="Report types" className="report-nav">
          {reports.map((r) => (
            <button
              className={report === r ? "active" : ""}
              key={r}
              onClick={() => setReport(r)}
            >
              <FileChartColumn size={16} />
              {r}
            </button>
          ))}
        </nav>
        <Panel
          title={report}
          subtitle={`${locationName} · ${range.from} through ${range.to}`}
          action={<ShopSelector />}
        >
          <div className="report-paper">
            <span className="eyebrow">BIG BOSS FINANCE · CAD</span>
            <h2>{report}</h2>
            <p className="muted small">
              {locationName} · {range.from} through {range.to}
            </p>
            <p className="notice report-basis">{accountingBasis}</p>
            {summary.reviewCount > 0 && (
              <p className="error-message">
                {summary.reviewCount} unclassified records are excluded. This
                report needs classification review.
              </p>
            )}
            {report === "Profit & Loss" && (
              <>
                <DataTable columns={["Measure", "CAD"]} empty={false}>
                  <tr>
                    <td>Revenue</td>
                    <td>{formatMoney(summary.revenueCents)}</td>
                  </tr>
                  <tr>
                    <td>Recorded operating expenses</td>
                    <td>{formatMoney(summary.operatingExpensesCents)}</td>
                  </tr>
                  <tr>
                    <td>Commissions earned</td>
                    <td>{formatMoney(summary.commissionExpensesCents)}</td>
                  </tr>
                  <tr>
                    <td>Total operating expenses</td>
                    <td>{formatMoney(summary.expenseCents)}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Operating profit</strong>
                    </td>
                    <td>
                      <strong>{formatMoney(summary.profitCents)}</strong>
                    </td>
                  </tr>
                </DataTable>
                <h3>Expenses by category</h3>
                <DataTable
                  columns={["Category", "Expense"]}
                  empty={!summary.expenseCategories.length}
                >
                  {summary.expenseCategories.map(([c, v]) => (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>{formatMoney(v)}</td>
                    </tr>
                  ))}
                </DataTable>
              </>
            )}
            {report === "Revenue Summary" && (
              <>
                <div className="totals-grid">
                  <span>
                    Total revenue
                    <strong>{formatMoney(summary.revenueCents)}</strong>
                  </span>
                  <span>
                    Daily service revenue
                    <strong>{formatMoney(summary.serviceCents)}</strong>
                  </span>
                  <span>
                    Product sales
                    <strong>{formatMoney(summary.productCents)}</strong>
                  </span>
                  <span>
                    Other revenue
                    <strong>
                      {formatMoney(
                        addCents(
                          summary.revenueCents,
                          -summary.serviceCents,
                          -summary.productCents,
                        ),
                      )}
                    </strong>
                  </span>
                </div>
                <h3>Revenue by date</h3>
                <DataTable columns={["Date", "Revenue"]} empty={!byDay.size}>
                  {[...byDay]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([d, v]) => (
                      <tr key={d}>
                        <td>{d}</td>
                        <td>{formatMoney(v)}</td>
                      </tr>
                    ))}
                </DataTable>
                <h3>Revenue by stylist</h3>
                <DataTable
                  columns={["Stylist", "Location", "Service revenue"]}
                  empty={!stylists.length}
                >
                  {stylists.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{shops.find((p) => p.id === s.shopId)?.name}</td>
                      <td>
                        {formatMoney(
                          commissionSummary(data, s.id, range.from, range.to)
                            .serviceCents,
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <LocationTable />
              </>
            )}
            {report === "Expense Breakdown" && (
              <>
                <DataTable
                  columns={["Category (largest first)", "Expense"]}
                  empty={!summary.expenseCategories.length}
                >
                  {summary.expenseCategories.map(([c, v]) => (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>{formatMoney(v)}</td>
                    </tr>
                  ))}
                </DataTable>
                <MonthlyTable />
                <LocationTable />
              </>
            )}
            {report === "Cash Flow" && (
              <>
                <p className="muted small">
                  Cash/bank assets only. Financing and distributions affect cash
                  but not operating profit. Paired internal cash transfers net
                  to zero across included locations.
                </p>
                <p className="report-total">
                  Net cash movement: {formatMoney(summary.cashMovementCents)}
                </p>
                <MonthlyTable />
              </>
            )}
            {report === "Commission Summary" && (
              <DataTable
                columns={[
                  "Stylist",
                  "Previous balance",
                  "Earned",
                  "Paid",
                  "Adjustments",
                  "Outstanding",
                ]}
                empty={!stylists.length}
              >
                {stylists.map((s) => {
                  const c = commissionSummary(data, s.id, range.from, range.to);
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{formatMoney(c.previousCents)}</td>
                      <td>{formatMoney(c.earnedCents)}</td>
                      <td>{formatMoney(c.paidCents)}</td>
                      <td>{formatMoney(c.adjustmentCents)}</td>
                      <td>{formatMoney(c.outstandingCents)}</td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
            {report === "Banking Summary" && (
              <>
                <p className="muted small">
                  Original opening balances anchor each account. Period opening
                  includes prior movements. Negative liability balances mean
                  debt owed; entries before the opening date are excluded.
                </p>
                <DataTable
                  columns={[
                    "Account",
                    "Period opening",
                    "Receipts",
                    "Payments",
                    "Net transfers / financing",
                    "Closing",
                    "Reconciliation",
                  ]}
                  empty={!accounts.length}
                >
                  {accounts.map((a) => {
                    const priorDate = new Date(`${range.from}T12:00:00Z`);
                    priorDate.setUTCDate(priorDate.getUTCDate() - 1);
                    const before = priorDate.toISOString().slice(0, 10);
                    const opening =
                      accountBalance(data, a, before) ??
                      (range.to >= a.openingDate ? a.openingBalanceCents : 0);
                    const rows = movements(data, a, range.to).filter(
                      (m) => m.date >= range.from,
                    );
                    const paired = (k: string) =>
                      [
                        "Transfer",
                        "Loan advance",
                        "Loan principal repayment",
                        "Credit card payment",
                      ].includes(k);
                    const receipts = addCents(
                      ...rows
                        .filter((m) => m.deltaCents > 0 && !paired(m.kind))
                        .map((m) => m.deltaCents),
                    );
                    const payments = addCents(
                      ...rows
                        .filter((m) => m.deltaCents < 0 && !paired(m.kind))
                        .map((m) => -m.deltaCents),
                    );
                    const transfers = addCents(
                      ...rows
                        .filter((m) => paired(m.kind))
                        .map((m) => m.deltaCents),
                    );
                    const close = accountBalance(data, a, range.to);
                    const rec = data.reconciliations
                      .filter(
                        (r) =>
                          r.accountId === a.id &&
                          !r.deletedAt &&
                          r.statementDate <= range.to,
                      )
                      .sort(
                        (x, y) =>
                          y.statementDate.localeCompare(x.statementDate) ||
                          y.createdAt.localeCompare(x.createdAt),
                      )[0];
                    return (
                      <tr key={a.id}>
                        <td>
                          {a.name}
                          <small className="cell-note">
                            Initial {formatMoney(a.openingBalanceCents)} ·{" "}
                            {a.openingDate}
                          </small>
                        </td>
                        <td>{formatMoney(opening)}</td>
                        <td>{formatMoney(receipts)}</td>
                        <td>{formatMoney(payments)}</td>
                        <td>{formatMoney(transfers)}</td>
                        <td>
                          {close === null
                            ? "Before opening date"
                            : formatMoney(close)}
                        </td>
                        <td>
                          {rec
                            ? reconciliationIsCurrent(rec, data, a)
                              ? `${rec.status} · ${rec.statementDate}`
                              : "Needs review · records changed"
                            : "Not reconciled"}
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              </>
            )}
            {report === "Location Comparison" && (
              <>
                <p className="muted small">
                  Consolidated revenue {formatMoney(summary.revenueCents)} ·
                  Expenses {formatMoney(summary.expenseCents)} · Operating
                  profit {formatMoney(summary.profitCents)}. Transfers are
                  excluded from profit.
                </p>
                <LocationTable />
              </>
            )}
            {report === "Annual Overview" && <MonthlyTable />}
          </div>
        </Panel>
      </div>
    </>
  );
  function MonthlyTable() {
    return (
      <DataTable
        columns={[
          "Month",
          "Revenue",
          "Expenses",
          "Operating profit",
          "Cash movement",
        ]}
        empty={!monthly.length}
      >
        {monthly.map((m) => (
          <tr key={m.period}>
            <td>{m.period}</td>
            <td>{formatMoney(m.revenue)}</td>
            <td>{formatMoney(m.expenses)}</td>
            <td>{formatMoney(m.profit)}</td>
            <td>{formatMoney(m.cash)}</td>
          </tr>
        ))}
      </DataTable>
    );
  }
  function LocationTable() {
    return (
      <DataTable
        columns={[
          "Location",
          "Revenue",
          "Expenses",
          "Operating profit",
          "Cash movement",
        ]}
        empty={!locations.length}
      >
        {locations.map((s) => {
          const c = summarize(data!, s.id, range.from, range.to);
          return (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{formatMoney(c.revenueCents)}</td>
              <td>{formatMoney(c.expenseCents)}</td>
              <td>{formatMoney(c.profitCents)}</td>
              <td>{formatMoney(c.cashMovementCents)}</td>
            </tr>
          );
        })}
      </DataTable>
    );
  }
}
