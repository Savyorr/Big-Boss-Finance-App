import { recordedDailyHistory } from "../calculations/recorded-history";
import { useState, type FormEvent } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { useApp } from "../app/context";
import { useFinance } from "../hooks/useFinance";
import { db } from "../database/db";
import { useLiveQuery } from "dexie-react-hooks";
import { type DailySale } from "../models";
import {
  addCents,
  commissionCents,
  formatMoney,
  moneyInput,
  parseMoney,
} from "../calculations/money";
import { scoped, inRange, isCashAccount } from "../calculations/finance";
import { financeService } from "../services/finance";
import {
  ConfirmDelete,
  DateRangeControls,
  useDateRange,
  messageOf,
} from "../components/forms/FinancialShared";
import {
  PageHeader,
  Panel,
  DataTable,
  Field,
  MoneyInput,
  DateInput,
  ErrorMessage,
  LoadingState,
} from "../components/ui/shared";
import { Button } from "../components/ui/button";
import { today } from "../utils/dates";
function SalesEntry({
  record,
  onClose,
}: {
  record?: DailySale;
  onClose: () => void;
}) {
  const { scope, shops } = useApp();
  const data = useFinance();
  const rules = useLiveQuery(() => db.commissionRules.toArray(), []);
  const [createId] = useState(() => crypto.randomUUID());
  const [shopId, setShopId] = useState(
    record?.shopId ?? (scope === "all" ? "" : scope),
  );
  const [date, setDate] = useState(record?.businessDate ?? today());
  const [allocations, setAllocations] = useState<Record<string, string>>(
    Object.fromEntries(
      record?.stylistAllocations.map((a) => [
        a.stylistId,
        moneyInput(a.serviceCents),
      ]) ?? [],
    ),
  );
  const [products, setProducts] = useState(
    record ? moneyInput(record.productCents) : "0.00",
  );
  const [card, setCard] = useState(
    record ? moneyInput(record.cardCents) : "0.00",
  );
  const [cash, setCash] = useState(
    record ? moneyInput(record.cashCents) : "0.00",
  );
  const [verified, setVerified] = useState(record?.cashVerified ?? false);
  const [cashAccount, setCashAccount] = useState(record?.cashAccountId ?? "");
  const [cardAccount, setCardAccount] = useState(record?.cardAccountId ?? "");
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data || !rules) return <LoadingState />;
  const stylists = scoped(data.stylists, shopId).filter(
    (s) =>
      s.status === "active" ||
      record?.stylistAllocations.some((a) => a.stylistId === s.id),
  );
  const accounts = data.accounts.filter(
    (a) => a.shopId === shopId && a.status === "active" && isCashAccount(a),
  );
  let service = 0,
    product = 0,
    cardCents = 0,
    calculatedCash = 0,
    total = 0,
    commission = 0,
    previewError = "";
  const rateFor = (stylistId: string) => {
    const saved =
      record?.businessDate === date
        ? record.commissionSnapshots?.find((s) => s.stylistId === stylistId)
            ?.rateBasisPoints
        : undefined;
    if (saved !== undefined) return saved;
    const allRules = rules.filter(
      (r) => r.shopId === shopId && r.stylistId === stylistId,
    );
    const applicable = allRules
      .filter(
        (r) =>
          !r.deletedAt &&
          r.effectiveFrom <= date &&
          (!r.effectiveTo || r.effectiveTo >= date),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    if (applicable) return applicable.rateBasisPoints;
    return allRules.length
      ? undefined
      : stylists.find((s) => s.id === stylistId)?.commissionBasisPoints;
  };
  try {
    service = addCents(
      ...stylists.map((s) => parseMoney(allocations[s.id] ?? "0.00")),
    );
    product = parseMoney(products);
    cardCents = parseMoney(card);
    total = addCents(service, product);
    calculatedCash = addCents(total, -cardCents);
    commission = addCents(
      ...stylists.map((s) =>
        commissionCents(
          parseMoney(allocations[s.id] ?? "0.00"),
          rateFor(s.id) ?? 0,
        ),
      ),
    );
  } catch {
    previewError =
      "Enter valid amounts with up to two decimals to calculate totals.";
  }
  if (stylists.some((s) => rateFor(s.id) === undefined))
    previewError =
      "No commission rate is effective on this sale date for one or more stylists. Set an applicable rate before saving.";
  const cashValue = () => (verified ? parseMoney(cash) : calculatedCash);
  let discrepancy = false;
  try {
    discrepancy = addCents(cashValue(), cardCents) !== total || cashValue() < 0;
  } catch {
    previewError = "Enter valid cash receipts.";
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await financeService.saveSale(
        {
          shopId,
          businessDate: date,
          productCents: parseMoney(products),
          cardCents: parseMoney(card),
          cashCents: parseMoney(cash),
          cashVerified: verified,
          cashAccountId: cashAccount,
          cardAccountId:
            cardAccount || (cardCents === 0 ? cashAccount : cardAccount),
          notes,
          stylistAllocations: stylists
            .filter((s) => s.id in allocations)
            .map((s) => ({
              stylistId: s.id,
              serviceCents: parseMoney(allocations[s.id]),
            })),
        },
        { id: record?.id, expectedRevision: record?.revision, createId },
      );
      onClose();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title={record ? "Edit daily sales" : "Record daily sales"}
      subtitle="Commission rounds half up per stylist per day. Saved rate snapshots are preserved."
    >
      <form className="form-stack" onSubmit={save}>
        {error && <ErrorMessage message={error} />}
        {record?.source?.format === "legacy-html" &&
          !record.linkedTransactionIds.length && (
            <p className="notice">
              This legacy day has no recognized posting. Saving will use the
              stylist/product rows for revenue and per-day commission rounding
              after you choose accounts. The original saved total (
              {formatMoney(
                record.legacyTotalCents ??
                  addCents(record.serviceCents, record.productCents),
              )}
              ) and raw source remain preserved; review any difference first.
            </p>
          )}
        <div className="form-grid">
          <Field label="Sales shop">
            <select
              required
              disabled={!!record}
              value={shopId}
              onChange={(e) => {
                setShopId(e.target.value);
                setAllocations({});
                setCashAccount("");
                setCardAccount("");
              }}
            >
              <option value="">Select a shop</option>
              {shops
                .filter((s) => s.status === "active")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Sales date">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <DataTable
          empty={!stylists.length}
          columns={["Stylist", "Service revenue (CAD)", "Rate", "Commission"]}
          title="Select a shop and add stylists"
          description="Product sales can also be recorded without stylist allocations."
        >
          {stylists.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>
                <MoneyInput
                  aria-label={`Service revenue for ${s.name}`}
                  value={allocations[s.id] ?? "0.00"}
                  onChange={(e) =>
                    setAllocations({ ...allocations, [s.id]: e.target.value })
                  }
                />
              </td>
              <td>
                {rateFor(s.id) === undefined
                  ? "Needs effective rate"
                  : `${(rateFor(s.id)! / 100).toFixed(2)}%`}
              </td>
              <td>
                {(() => {
                  try {
                    return formatMoney(
                      commissionCents(
                        parseMoney(allocations[s.id] ?? "0.00"),
                        rateFor(s.id) ?? 0,
                      ),
                    );
                  } catch {
                    return "—";
                  }
                })()}
              </td>
            </tr>
          ))}
        </DataTable>
        <div className="form-grid">
          <Field label="Product sales" hint="Products do not earn commission.">
            <MoneyInput
              required
              value={products}
              onChange={(e) => setProducts(e.target.value)}
            />
          </Field>
          <Field label="Debit / card receipts">
            <MoneyInput
              required
              value={card}
              onChange={(e) => setCard(e.target.value)}
            />
          </Field>
          <Field label="Cash receipt account">
            <select
              required
              value={cashAccount}
              onChange={(e) => setCashAccount(e.target.value)}
            >
              <option value="">Select cash account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Card receipt account">
            <select
              required={cardCents > 0}
              value={cardAccount}
              onChange={(e) => setCardAccount(e.target.value)}
            >
              <option value="">Select receiving bank account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          Use verified cash received instead of calculated cash
        </label>
        {verified && (
          <Field label="Verified cash received">
            <MoneyInput
              required
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
          </Field>
        )}
        <div className="totals-grid">
          <span>
            Services<strong>{formatMoney(service)}</strong>
          </span>
          <span>
            Total revenue<strong>{formatMoney(total)}</strong>
          </span>
          <span>
            Calculated cash<strong>{formatMoney(calculatedCash)}</strong>
          </span>
          <span>
            Commission earned<strong>{formatMoney(commission)}</strong>
          </span>
        </div>
        {previewError && <ErrorMessage message={previewError} />}{" "}
        {discrepancy && !previewError && (
          <div className="notice">
            Receipt reconciliation warning: receipts differ from revenue or
            calculated cash is negative. The entered values will be preserved.
            Calculated cash is an estimate, not verified cash received.
          </div>
        )}
        <Field label="Sales notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !shopId || !!previewError}>
            {busy ? "Saving…" : "Save daily sales"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
export function DailySalesPage() {
  const { scope, locationName, shops } = useApp();
  const data = useFinance();
  const [range, setRange] = useDateRange();
  const [editing, setEditing] = useState<DailySale | "new" | null>(null);
  const [deleting, setDeleting] = useState<DailySale | null>(null);
  const [page, setPage] = useState(0);
  const [historicalPage, setHistoricalPage] = useState(0);
  const [query, setQuery] = useState("");
  if (!data) return <LoadingState />;
  const rows = scoped(data.dailySales, scope)
    .filter(
      (s) =>
        !s.deletedAt &&
        inRange(s.businessDate, range.from, range.to) &&
        [s.businessDate, s.notes]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  const historical = recordedDailyHistory(data, scope, range.from, range.to);
  const historicalIndex = Math.max(
    0,
    Math.min(historicalPage, Math.ceil(historical.length / 25) - 1),
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <>
      <PageHeader
        eyebrow={locationName}
        title="Daily Sales"
        description="Record the day's sales, receipts, and stylist earnings together."
        action={
          <Button
            onClick={() => setEditing("new")}
            disabled={!shops.some((s) => s.status === "active")}
          >
            <Plus size={16} />
            Record Today's Sales
          </Button>
        }
      />
      {editing && (
        <SalesEntry
          key={editing === "new" ? `new-${scope}` : editing.id}
          record={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <DateRangeControls range={range} onChange={setRange} />
      {historical.length > 0 && (
        <details open={!rows.length}>
          <summary>Recorded historical daily totals</summary>
          <p>
            Daily totals are available from the original financial fields.
            Per-barber sales, the service/product split and card/cash receipt
            allocations were not supplied; historical commissions cannot be
            reconstructed from these totals.
          </p>
          <DataTable
            columns={[
              "Date",
              "Recorded Revenue",
              "Recorded Expenses",
              "Bank credits",
              "Bank deposits",
              "Bank withdrawals",
            ]}
            empty={false}
          >
            {historical
              .slice(historicalIndex * 25, (historicalIndex + 1) * 25)
              .map((day) => (
                <tr key={day.date}>
                  <td>{day.date}</td>
                  <td>{formatMoney(day.income)}</td>
                  <td>{formatMoney(day.expense)}</td>
                  <td>{formatMoney(day.bankCredit)}</td>
                  <td>{formatMoney(day.bankDeposit)}</td>
                  <td>{formatMoney(day.bankDebit)}</td>
                </tr>
              ))}
          </DataTable>
          <div className="table-footer">
            <Button
              variant="outline"
              disabled={historicalIndex === 0}
              onClick={() => setHistoricalPage(historicalIndex - 1)}
            >
              Previous historical days
            </Button>
            <span>Page {historicalIndex + 1}</span>
            <Button
              variant="outline"
              disabled={(historicalIndex + 1) * 25 >= historical.length}
              onClick={() => setHistoricalPage(historicalIndex + 1)}
            >
              Next historical days
            </Button>
          </div>
        </details>
      )}
      <Panel
        title="Daily sales history"
        subtitle="One active record per shop and date. Editing updates the linked posting."
      >
        <div className="inline-filter">
          <input
            aria-label="Search daily sales"
            placeholder="Search date or notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <DataTable
          columns={[
            "Date",
            "Shop",
            "Services / products",
            "Receipts",
            "Revenue",
            "Commission",
            "Actions",
          ]}
          empty={!rows.length}
          title="No daily sales in this period"
          description="Record a day or change the reporting dates."
        >
          {rows.slice(currentPage * 50, currentPage * 50 + 50).map((s) => (
            <tr key={s.id}>
              <td>
                {s.businessDate}
                <small className="cell-note">{s.notes}</small>
              </td>
              <td>{shops.find((p) => p.id === s.shopId)?.name}</td>
              <td>
                {formatMoney(s.serviceCents)} / {formatMoney(s.productCents)}
                <small className="cell-note">
                  {s.stylistAllocations
                    .map(
                      (a) =>
                        `${data.stylists.find((p) => p.id === a.stylistId)?.name}: ${formatMoney(a.serviceCents)}`,
                    )
                    .join(" · ")}
                </small>
              </td>
              <td>
                Cash {formatMoney(s.cashCents)}
                <small className="cell-note">
                  {s.cashVerified ? "Verified" : "Calculated"} · Card{" "}
                  {formatMoney(s.cardCents)}
                </small>
              </td>
              <td>
                {formatMoney(
                  s.linkedTransactionIds.length
                    ? addCents(s.serviceCents, s.productCents)
                    : (s.legacyTotalCents ??
                        addCents(s.serviceCents, s.productCents)),
                )}
                {!s.linkedTransactionIds.length && s.source && (
                  <small className="cell-note">
                    Legacy saved total · needs posting review
                  </small>
                )}
              </td>
              <td>
                {formatMoney(
                  addCents(
                    ...(s.commissionSnapshots ?? []).map(
                      (c) => c.commissionCents,
                    ),
                  ),
                )}
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit sales ${s.businessDate}`}
                  disabled={
                    shops.find((p) => p.id === s.shopId)?.status !== "active"
                  }
                  onClick={() => setEditing(s)}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete sales ${s.businessDate}`}
                  disabled={
                    shops.find((p) => p.id === s.shopId)?.status !== "active"
                  }
                  onClick={() => setDeleting(s)}
                >
                  <Trash2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
        <div className="table-footer">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous days
          </Button>
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next days
          </Button>
        </div>
      </Panel>
      {deleting && (
        <ConfirmDelete
          title={`Remove sales for ${deleting.businessDate}?`}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            financeService.deleteRecord(
              "dailySales",
              deleting.shopId,
              deleting.id,
              deleting.revision,
            )
          }
        />
      )}
    </>
  );
}
