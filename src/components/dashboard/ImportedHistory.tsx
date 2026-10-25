import { Link } from "react-router-dom";
import { useFinance } from "../../hooks/useFinance";
import { useApp } from "../../app/context";
import { recordedHistory } from "../../calculations/recorded-history";
import { importedHistory } from "../../calculations/imported-history";
import { formatMoney } from "../../calculations/money";
import { MetricCard } from "./MetricCard";
import { ArrowUpRight, ArrowDownLeft, Landmark } from "lucide-react";
export function ImportedHistory({ from, to }: { from: string; to: string }) {
  const data = useFinance();
  const { scope } = useApp();
  if (!data) return null;
  const totals = recordedHistory(data, scope, from, to);
  if (!totals.sourceCount) {
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
      <h2>Recorded financial history</h2>
      <p>
        <strong>{totals.sourceCount} imported transactions</strong> ·{" "}
        {totals.newCount} new posted entries. Provisional recorded figures, not
        final accounting statements.
      </p>
      <div className="metrics-grid">
        <MetricCard
          label="Recorded Revenue"
          icon={ArrowUpRight}
          amountCents={totals.revenueCents}
          description="Original recorded income + new posted revenue"
        />
        <MetricCard
          label="Recorded Expenses"
          icon={ArrowDownLeft}
          amountCents={totals.expenseCents}
          description="Original recorded expenses + new posted costs"
        />
        <MetricCard
          label="Recorded bank withdrawals"
          icon={Landmark}
          amountCents={totals.bankDebitCents}
          description="Money withdrawn; not an expense total"
        />
      </div>
      <details>
        <summary>Other amounts preserved in your backup</summary>
        <p>
          Bank credits: {formatMoney(totals.bankCreditCents)} · Bank deposits:{" "}
          {formatMoney(totals.bankDepositCents)}
        </p>
        <p>
          Credits and deposits may be receipts of the same sales. They are not
          added to income again.
        </p>
      </details>
      <p>
        {totals.unreviewed} Unreviewed Historical Records. Bank withdrawals are
        not expenses. Daily barber sales, opening commission liabilities and
        account assignments are incomplete; the recorded difference is not
        verified profit or a reconciled balance.
      </p>
      <Link to="/transactions">View imported transactions</Link>
    </section>
  );
}
