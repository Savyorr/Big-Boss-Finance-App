import { Link } from "react-router-dom";
import { useFinance } from "../../hooks/useFinance";
import { useApp } from "../../app/context";
import { importedHistory } from "../../calculations/imported-history";
import { formatMoney } from "../../calculations/money";
import { MetricCard } from "./MetricCard";
import { ArrowUpRight, ArrowDownLeft, Landmark } from "lucide-react";
export function ImportedHistory({ from, to }: { from: string; to: string }) {
  const data = useFinance();
  const { scope } = useApp();
  if (!data) return null;
  const totals = importedHistory(data, scope, from, to);
  if (!totals.count) {
    const all = importedHistory(data, scope, "0000-01-01", "9999-12-31");
    return all.count ? (
      <section
        className="legacy-overview"
        aria-label="Imported financial history"
      >
        <h2>Your import is saved</h2>
        <p>
          {all.count} imported transactions are outside the selected reporting
          dates. Change From and To above to include your imported history, or
          open Transactions. No records were removed.
        </p>
        <Link to="/transactions">View imported transactions</Link>
      </section>
    ) : null;
  }
  return (
    <section
      className="legacy-overview"
      aria-label="Imported financial history"
    >
      <h2>Your imported financial history</h2>
      <p>
        <strong>{totals.count} imported transactions</strong> in this date
        range. These are the amounts recorded in your original file. Your import
        worked; the figures below are preserved separately from newly posted
        entries.
      </p>
      <div className="metrics-grid">
        <MetricCard
          label="Imported income"
          icon={ArrowUpRight}
          amountCents={totals.income}
          description="Income recorded in the original file"
        />
        <MetricCard
          label="Imported expenses"
          icon={ArrowDownLeft}
          amountCents={totals.expense}
          description="Expense field recorded in the original file"
        />
        <MetricCard
          label="Imported bank withdrawals"
          icon={Landmark}
          amountCents={totals.bankDebit}
          description="Money withdrawn; not an expense total"
        />
      </div>
      <details>
        <summary>Other amounts preserved in your backup</summary>
        <p>
          Bank credits: {formatMoney(totals.bankCredit)} · Bank deposits:{" "}
          {formatMoney(totals.bankDeposit)}
        </p>
        <p>
          Credits and deposits may be receipts of the same sales. They are not
          added to income again.
        </p>
      </details>
      <p>
        Account assignments and historical commission details still need review.
        These totals do not establish verified profit or current bank balances.
        Classified entries leave this section and appear in the posted figures
        below, so they are not counted twice.
      </p>
      <Link to="/transactions">View imported transactions</Link>
    </section>
  );
}
