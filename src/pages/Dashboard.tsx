import { reportingRangeIssue } from "../utils/dates";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  Users,
  Landmark,
  Plus,
  ChevronRight,
  ShieldCheck,
  CircleAlert,
  Store,
} from "lucide-react";
import { useApp } from "../app/context";
import { useFinance } from "../hooks/useFinance";
import {
  summarize,
  monthlySeries,
  scoped,
  inRange,
} from "../calculations/finance";
import { formatMoney } from "../calculations/money";
import {
  PageHeader,
  Panel,
  DataTable,
  LoadingState,
} from "../components/ui/shared";
import { Button } from "../components/ui/button";
import { MetricCard } from "../components/dashboard/MetricCard";
import { ChartPanel } from "../components/dashboard/ChartPanel";
import {
  DateRangeControls,
  useDateRange,
  accountingBasis,
} from "../components/forms/FinancialShared";
export function DashboardPage() {
  const { locationName, shops, scope } = useApp();
  const data = useFinance();
  const [range, setRange] = useDateRange();
  const [chart, setChart] = useState("Revenue vs expenses");
  if (!data) return <LoadingState />;
  const rangeIssue = reportingRangeIssue(range.from, range.to);
  const valid = !rangeIssue;
  const summary = summarize(data, scope, range.from, range.to);
  const series = valid ? monthlySeries(data, scope, range.from, range.to) : [];
  const visibleShops = shops.filter((s) => scope === "all" || s.id === scope);
  const recent = scoped(data.transactions, scope)
    .filter(
      (t) => !t.deletedAt && inRange(t.businessDate, range.from, range.to),
    )
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
    .slice(0, 5);
  const hasActivity = series.some((p) => p.revenue || p.expenses || p.cash);
  const metrics = [
    [
      "Total Revenue",
      ArrowUpRight,
      "Recorded business revenue",
      summary.revenueCents,
    ],
    [
      "Operating Expenses",
      ArrowDownLeft,
      "Operating costs & commissions earned",
      summary.expenseCents,
    ],
    [
      "Operating Profit",
      TrendingUp,
      "Operating view · not verified net profit",
      summary.profitCents,
    ],
    [
      "Net Cash Movement",
      Wallet,
      "Cash/bank movement · separate from profit",
      summary.cashMovementCents,
    ],
    [
      "Outstanding Commissions",
      Users,
      "Cumulative amount through end date",
      summary.outstandingCents,
    ],
    [
      "Cash & Bank Balances",
      Landmark,
      "Cash/bank assets through end date",
      summary.balanceCents,
    ],
  ] as const;
  return (
    <>
      <PageHeader
        eyebrow="A CLEARER VIEW OF YOUR BUSINESS"
        title="Financial Overview"
        description={`${locationName} · ${range.from} through ${range.to}`}
        action={
          <Button asChild>
            <Link to="/daily-sales">
              <Plus size={17} />
              Record Today's Sales
            </Link>
          </Button>
        }
      />
      <DateRangeControls range={range} onChange={setRange} />
      {!valid && (
        <p role="alert" className="error-message">
          {rangeIssue}
        </p>
      )}
      <div className="welcome-banner">
        <div className="welcome-icon">
          <ShieldCheck size={22} />
        </div>
        <div>
          <strong>Your business, securely on your device.</strong>
          <p>
            Figures come from your saved financial records. Internal transfers
            do not create revenue or expense.
          </p>
        </div>
        <span className="badge badge-green">LOCAL-FIRST</span>
      </div>
      <div className="metrics-grid">
        {metrics.map(([label, Icon, description, amount], i) => (
          <MetricCard
            key={label}
            label={label}
            icon={Icon}
            description={description}
            amountCents={amount}
            tone={i}
          />
        ))}
      </div>
      <div className="dashboard-chart-row">
        <div>
          <div className="chart-tabs">
            {["Revenue vs expenses", "Monthly profit", "Cash movement"].map(
              (t) => (
                <button
                  key={t}
                  className={chart === t ? "active" : ""}
                  onClick={() => setChart(t)}
                >
                  {t}
                </button>
              ),
            )}
          </div>
          <ChartPanel
            title={
              chart === "Revenue vs expenses" ? "Revenue & expenses" : chart
            }
            subtitle={`${range.from} through ${range.to} · ${locationName}`}
            mode={
              chart === "Monthly profit"
                ? "profit"
                : chart === "Cash movement"
                  ? "cash"
                  : "revenue"
            }
            data={hasActivity ? series : []}
          />
        </div>
        <Panel
          title="Quick actions"
          subtitle="Keep your everyday finances up to date."
          className="quick-panel"
        >
          {[
            [
              "Record daily sales",
              "Sales, receipts & earned commissions",
              "/daily-sales",
              Store,
            ],
            [
              "Add Expense",
              "Income, expenses & movements",
              "/transactions",
              Wallet,
            ],
            ["Pay Stylist", "Settle earned commissions", "/stylists", Users],
            [
              "Review Bank Balance",
              "Accounts and reconciliation",
              "/banking",
              Landmark,
            ],
            [
              "View Monthly Report",
              "Understand your performance",
              "/reports",
              TrendingUp,
            ],
          ].map(([title, desc, path, Icon]) => {
            const I = Icon as typeof Store;
            return (
              <Link
                className="quick-action"
                to={String(path)}
                key={String(title)}
              >
                <span className="quick-icon">
                  <I size={20} />
                </span>
                <div>
                  <strong>{String(title)}</strong>
                  <small>{String(desc)}</small>
                </div>
                <ChevronRight size={16} />
              </Link>
            );
          })}
        </Panel>
      </div>
      <div className="two-columns">
        <Panel
          title="Recent transactions"
          subtitle="Selected period · linked entries appear once."
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/transactions">
                View all
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          }
        >
          <DataTable
            columns={["Transaction", "Date", "Amount"]}
            empty={!recent.length}
            title="No activity in this period"
            description="Record daily sales or add a transaction to get started."
          >
            {recent.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.description}
                  <small className="cell-note">{t.kind}</small>
                </td>
                <td>{t.businessDate}</td>
                <td>{formatMoney(t.amountCents)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel
          title="Location performance"
          subtitle="Independent records. A consistent accounting basis."
          action={
            <span className="badge">
              {visibleShops.filter((s) => s.status === "active").length} active
              shops
            </span>
          }
        >
          <DataTable
            columns={["Location", "Revenue", "Operating profit"]}
            empty={!visibleShops.length}
            title="Your locations belong here"
            description="Add a shop in Settings to get started."
          >
            {visibleShops.map((s) => {
              const c = summarize(data, s.id, range.from, range.to);
              return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <small className="cell-note">{s.status}</small>
                  </td>
                  <td>{formatMoney(c.revenueCents)}</td>
                  <td>{formatMoney(c.profitCents)}</td>
                </tr>
              );
            })}
          </DataTable>
        </Panel>
      </div>
      <div className="two-columns">
        <Panel title="Revenue by location">
          <DataTable
            columns={["Location", "Revenue"]}
            empty={!visibleShops.length}
          >
            {visibleShops.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  {formatMoney(
                    summarize(data, s.id, range.from, range.to).revenueCents,
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="Expense categories">
          <DataTable
            columns={["Category", "Expense"]}
            empty={!summary.expenseCategories.length}
            title="No expenses in this period"
          >
            {summary.expenseCategories.map(([c, v]) => (
              <tr key={c}>
                <td>{c}</td>
                <td>{formatMoney(v)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
      {(summary.reviewCount > 0 || summary.receiptWarnings > 0) && (
        <div className="notice">
          <CircleAlert size={18} />
          {summary.reviewCount} unclassified transactions excluded from
          financial totals · {summary.receiptWarnings} sales receipt warnings.
          Review the original records before correcting them.
        </div>
      )}
      {summary.overpaidCents > 0 && (
        <p className="notice">
          Payments or settlement adjustments exceed earned commissions for some
          stylists by {formatMoney(summary.overpaidCents)}. These credits are
          shown separately and do not reduce amounts owed to other stylists.
        </p>
      )}
      <div className="financial-alert">
        <CircleAlert size={19} />
        <div>
          <strong>What these figures mean</strong>
          <p>
            {accountingBasis} Download independent JSON backups in Data
            Management; browser storage can be cleared.
          </p>
        </div>
        <Link to="/data">
          Data management
          <ChevronRight size={15} />
        </Link>
      </div>
    </>
  );
}
