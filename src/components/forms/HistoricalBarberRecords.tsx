import { useFinance } from "../../hooks/useFinance";
import { useApp } from "../../app/context";
import { historicalBarberEvidence } from "../../calculations/historical-payments";
import { inRange, scoped, periodKey } from "../../calculations/finance";
import { formatMoney, addCents } from "../../calculations/money";
import { DataTable, Panel } from "../ui/shared";
import { useState } from "react";
export function HistoricalBarberRecords({
  from,
  to,
  stylistId = "",
  payPeriod = "",
}: {
  from: string;
  to: string;
  stylistId?: string;
  payPeriod?: string;
}) {
  const data = useFinance();
  const { scope } = useApp();
  const [page, setPage] = useState(0);
  if (!data) return null;
  const rows = scoped(data.transactions, scope)
    .filter(
      (t) =>
        !t.deletedAt &&
        t.stylistId &&
        (!stylistId || t.stylistId === stylistId) &&
        (payPeriod
          ? periodKey(t.businessDate, true, "legacy") === payPeriod
          : inRange(t.businessDate, from, to)) &&
        historicalBarberEvidence(t),
    )
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  if (!rows.length) return null;
  const groups = scoped(data.stylists, scope)
    .filter((s) => !s.deletedAt && (!stylistId || s.id === stylistId))
    .map((s) => {
      const records = rows.filter((t) => t.stylistId === s.id);
      return {
        s,
        records,
        evidence: records.map((t) => historicalBarberEvidence(t)!),
      };
    })
    .filter((g) => g.records.length);
  const count = Math.max(0, Math.min(page, Math.ceil(rows.length / 25) - 1));
  return (
    <Panel
      title="Historical barber payments & records"
      subtitle="Original linked records, not extra payments or expenses. Recorded payment evidence remains provisional until accounts and earnings are verified."
    >
      <p>
        Daily barber sales and opening commission liabilities were not included
        in this transaction backup. Historical commission earned and outstanding
        cannot be reconstructed from payments alone. The new-entry commission
        table above is separate.
      </p>
      <DataTable
        columns={[
          "Barber",
          "Linked records",
          "Recorded expense",
          "Bank debits",
          "Payment evidence · provisional",
          "Settlement review",
        ]}
        empty={false}
      >
        {groups.map(({ s, records, evidence }) => (
          <tr key={s.id}>
            <td>{s.name}</td>
            <td>{records.length}</td>
            <td>
              {formatMoney(
                addCents(...evidence.map((e) => e.recordedExpenseCents)),
              )}
            </td>
            <td>
              {formatMoney(addCents(...evidence.map((e) => e.bankDebitCents)))}
            </td>
            <td>
              {formatMoney(
                addCents(...evidence.map((e) => e.supportedPaymentCents)),
              )}
            </td>
            <td>{evidence.filter((e) => e.needsReview).length} need review</td>
          </tr>
        ))}
      </DataTable>
      <DataTable
        columns={[
          "Date",
          "Barber",
          "Original description",
          "Recorded expense",
          "Bank debit",
          "Payment evidence",
          "Legacy payroll period",
        ]}
        empty={false}
      >
        {rows.slice(count * 25, (count + 1) * 25).map((t) => {
          const evidence = historicalBarberEvidence(t)!;
          return (
            <tr key={t.id}>
              <td>{t.businessDate}</td>
              <td>{data.stylists.find((s) => s.id === t.stylistId)?.name}</td>
              <td>{t.description}</td>
              <td>{formatMoney(evidence.recordedExpenseCents)}</td>
              <td>{formatMoney(evidence.bankDebitCents)}</td>
              <td>
                {evidence.label}
                {!evidence.needsReview && (
                  <small className="cell-note">
                    {formatMoney(evidence.supportedPaymentCents)} · original
                    payment evidence, not verified settlement
                  </small>
                )}
              </td>
              <td>{periodKey(t.businessDate, true, "legacy")}</td>
            </tr>
          );
        })}
      </DataTable>
      <div className="table-footer">
        <button
          className="button button-outline"
          disabled={count === 0}
          onClick={() => setPage(count - 1)}
        >
          Previous historical records
        </button>
        <span>Page {count + 1}</span>
        <button
          className="button button-outline"
          disabled={(count + 1) * 25 >= rows.length}
          onClick={() => setPage(count + 1)}
        >
          Next historical records
        </button>
      </div>
    </Panel>
  );
}
