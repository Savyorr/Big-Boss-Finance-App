import { historicalBarberEvidence } from "../../calculations/historical-payments";
import { HistoricalBarberRecords } from "./HistoricalBarberRecords";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useApp } from "../../app/context";
import { useFinance } from "../../hooks/useFinance";
import { type CommissionPayment, type Adjustment } from "../../models";
import {
  scoped,
  commissionSummary,
  periodKey,
  periodEnd,
} from "../../calculations/finance";
import { formatMoney } from "../../calculations/money";
import { financeService } from "../../services/finance";
import { Button } from "../ui/button";
import { Panel, FilterBar, DataTable, LoadingState } from "../ui/shared";
import { CommissionForm } from "./CommissionForm";
import {
  ConfirmDelete,
  DateRangeControls,
  useDateRange,
} from "./FinancialShared";
export function CommissionWorkspace({
  tab,
  initialStylistId = "",
}: {
  tab: string;
  initialStylistId?: string;
}) {
  const { scope, shops } = useApp();
  const data = useFinance();
  const [range, setRange] = useDateRange();
  const [stylistId, setStylist] = useState(initialStylistId);
  const [payPeriod, setPayPeriod] = useState("");
  const [form, setForm] = useState<"payment" | "adjustment" | null>(null);
  const [editing, setEditing] = useState<CommissionPayment | Adjustment | null>(
    null,
  );
  const [deleting, setDeleting] = useState<{
    table: "commissionPayments" | "adjustments";
    record: CommissionPayment | Adjustment;
  } | null>(null);
  if (!data) return <LoadingState />;
  const stylists = scoped(data.stylists, scope).filter((s) => !s.deletedAt);
  const chosen = stylists.filter((s) => !stylistId || s.id === stylistId);
  const from = payPeriod
    ? `${payPeriod.slice(0, 7)}-${payPeriod.endsWith("H1") ? "01" : "16"}`
    : range.from;
  const to = payPeriod ? periodEnd(payPeriod) : range.to;
  const periods = [
    ...new Set([
      ...scoped(data.earnings, scope).map((e) => periodKey(e.businessDate)),
      ...scoped(data.transactions, scope)
        .filter(
          (t) => !t.deletedAt && t.stylistId && historicalBarberEvidence(t),
        )
        .map((t) => periodKey(t.businessDate, true, "legacy")),
      ...scoped(data.payments, scope).map((p) =>
        periodKey(p.businessDate, true, p.periodMode),
      ),
      ...scoped(data.adjustments, scope).map((p) =>
        periodKey(p.businessDate, true, p.periodMode),
      ),
    ]),
  ]
    .sort()
    .reverse();
  const effective = (p: CommissionPayment | Adjustment) =>
    p.periodMode === "legacy"
      ? periodEnd(periodKey(p.businessDate, true, "legacy"))
      : p.businessDate;
  const earnings = scoped(data.earnings, scope).filter(
    (e) =>
      !e.deletedAt &&
      (!stylistId || e.stylistId === stylistId) &&
      e.businessDate >= from &&
      e.businessDate <= to,
  );
  const payments = scoped(data.payments, scope).filter(
    (p) =>
      !p.deletedAt &&
      (!stylistId || p.stylistId === stylistId) &&
      (payPeriod
        ? periodKey(p.businessDate, true, p.periodMode) === payPeriod
        : effective(p) >= from && effective(p) <= to),
  );
  const adjustments = scoped(data.adjustments, scope).filter(
    (p) =>
      !p.deletedAt &&
      (!stylistId || p.stylistId === stylistId) &&
      (payPeriod
        ? periodKey(p.businessDate, true, p.periodMode) === payPeriod
        : effective(p) >= from && effective(p) <= to),
  );
  return (
    <>
      <DateRangeControls
        range={range}
        onChange={(v) => {
          setRange(v);
          setPayPeriod("");
        }}
      />
      <Panel
        title={
          tab === "Payment history"
            ? "Payments & adjustments"
            : "Commission reconciliation"
        }
        subtitle="New-entry ledger: opening liability + earnings − verified payments − settlement adjustments. Historical source payment evidence is listed separately below."
      >
        <FilterBar>
          <select
            aria-label="Stylist filter"
            value={stylistId}
            onChange={(e) => setStylist(e.target.value)}
          >
            <option value="">All stylists</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Pay period filter"
            value={payPeriod}
            onChange={(e) => setPayPeriod(e.target.value)}
          >
            <option value="">Date range</option>
            {periods.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <Button
            onClick={() => {
              setEditing(null);
              setForm("payment");
            }}
          >
            Pay Stylist
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setForm("adjustment");
            }}
          >
            Add adjustment
          </Button>
        </FilterBar>
        <DataTable
          columns={[
            "Stylist",
            "Service revenue",
            "Previous balance",
            "Earned",
            "Paid",
            "Adjustments",
            "Outstanding",
          ]}
          empty={!chosen.length}
          title="No stylists in this location"
        >
          {chosen.map((s) => {
            const c = commissionSummary(data, s.id, from, to);
            return (
              <tr key={s.id}>
                <td>
                  {s.name}
                  <small className="cell-note">
                    {shops.find((p) => p.id === s.shopId)?.name}
                  </small>
                </td>
                <td>{formatMoney(c.serviceCents)}</td>
                <td>{formatMoney(c.previousCents)}</td>
                <td>{formatMoney(c.earnedCents)}</td>
                <td>{formatMoney(c.paidCents)}</td>
                <td>{formatMoney(c.adjustmentCents)}</td>
                <td>{formatMoney(c.outstandingCents)}</td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
      <HistoricalBarberRecords
        from={from}
        to={to}
        stylistId={stylistId}
        payPeriod={payPeriod}
      />
      <Panel
        title="Commission earnings audit"
        subtitle="Rate snapshots are saved per stylist per day; products are excluded."
      >
        <DataTable
          columns={[
            "Sale date",
            "Stylist",
            "Service revenue",
            "Rate",
            "Earned",
          ]}
          empty={!earnings.length}
          title="No earnings in this period"
        >
          {earnings.map((e) => (
            <tr key={e.id}>
              <td>{e.businessDate}</td>
              <td>{data.stylists.find((s) => s.id === e.stylistId)?.name}</td>
              <td>{formatMoney(e.serviceCents)}</td>
              <td>{(e.rateBasisPoints / 100).toFixed(2)}%</td>
              <td>{formatMoney(e.amountCents)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Panel
        title="Payment history"
        subtitle="Removing a payment reverses its cash and settlement effect; audit history remains."
      >
        <DataTable
          columns={["Date", "Stylist", "Amount", "Account", "Notes", "Actions"]}
          empty={!payments.length}
          title="No payments in this period"
        >
          {payments.map((p) => (
            <tr key={p.id}>
              <td>
                {p.businessDate}
                <small className="cell-note">
                  {p.periodMode === "legacy"
                    ? "Legacy assignment"
                    : "Actual date"}
                </small>
              </td>
              <td>{data.stylists.find((s) => s.id === p.stylistId)?.name}</td>
              <td>{formatMoney(p.amountCents)}</td>
              <td>{data.accounts.find((a) => a.id === p.accountId)?.name}</td>
              <td>{p.notes}</td>
              <td>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit payment ${p.businessDate}`}
                  onClick={() => {
                    setEditing(p);
                    setForm("payment");
                  }}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Reverse payment ${p.businessDate}`}
                  onClick={() =>
                    setDeleting({ table: "commissionPayments", record: p })
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Panel title="Settlement adjustments">
        <DataTable
          columns={[
            "Date",
            "Stylist",
            "Amount",
            "Type / explanation",
            "Actions",
          ]}
          empty={!adjustments.length}
          title="No adjustments in this period"
        >
          {adjustments.map((a) => (
            <tr key={a.id}>
              <td>{a.businessDate}</td>
              <td>{data.stylists.find((s) => s.id === a.stylistId)?.name}</td>
              <td>{formatMoney(a.amountCents)}</td>
              <td>
                {a.adjustmentKind}
                <small className="cell-note">{a.reason}</small>
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit adjustment ${a.businessDate}`}
                  onClick={() => {
                    setEditing(a);
                    setForm("adjustment");
                  }}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete adjustment ${a.businessDate}`}
                  onClick={() =>
                    setDeleting({ table: "adjustments", record: a })
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      {form && (
        <CommissionForm
          kind={form}
          record={editing ?? undefined}
          onClose={() => {
            setForm(null);
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title={`Remove ${deleting.table === "commissionPayments" ? "payment" : "adjustment"}?`}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            financeService.deleteRecord(
              deleting.table,
              deleting.record.shopId,
              deleting.record.id,
              deleting.record.revision,
            )
          }
        />
      )}
    </>
  );
}
