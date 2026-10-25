import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, Eye } from "lucide-react";
import { useApp } from "../app/context";
import { useFinance } from "../hooks/useFinance";
import { type Transaction, transactionKinds } from "../models";
import { scoped, inRange } from "../calculations/finance";
import { formatMoney } from "../calculations/money";
import { financeService } from "../services/finance";
import { TransactionForm } from "../components/forms/TransactionForm";
import {
  ConfirmDelete,
  DateRangeControls,
  useDateRange,
} from "../components/forms/FinancialShared";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import {
  PageHeader,
  Panel,
  DataTable,
  FilterBar,
  LoadingState,
} from "../components/ui/shared";
export function TransactionsPage() {
  const { scope, shops, locationName } = useApp();
  const data = useFinance();
  const [range, setRange] = useDateRange();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("Newest first");
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [detail, setDetail] = useState<Transaction | null>(null);
  if (!data) return <LoadingState />;
  const relevant = data.transactions.filter(
    (t) =>
      scope === "all" ||
      t.shopId === scope ||
      t.postings?.some((p) => p.shopId === scope),
  );
  const rows = relevant
    .filter(
      (t) =>
        !t.deletedAt &&
        inRange(t.businessDate, range.from, range.to) &&
        (!type || t.kind === type) &&
        (!category || t.category === category) &&
        (!account || t.postings?.some((p) => p.accountId === account)) &&
        [t.description, t.category, t.payee, t.notes]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Oldest first"
        ? a.businessDate.localeCompare(b.businessDate)
        : sort === "Amount: high to low"
          ? b.amountCents - a.amountCents
          : sort === "Amount: low to high"
            ? a.amountCents - b.amountCents
            : b.businessDate.localeCompare(a.businessDate),
    );
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  return (
    <>
      <PageHeader
        eyebrow={locationName}
        title="Transactions"
        description="Record each event once. Keep money movements separate from business income."
        action={
          <div className="heading-actions">
            <Button variant="outline" asChild>
              <Link to="/stylists">Pay Stylist</Link>
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} />
              Add Transaction
            </Button>
          </div>
        }
      />
      <DateRangeControls range={range} onChange={setRange} />
      <Panel
        title="Transaction history"
        subtitle={`${rows.length} records · ${range.from} through ${range.to}`}
      >
        <FilterBar>
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="Search transactions"
              placeholder="Search transactions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Transaction type filter"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {transactionKinds.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Category filter"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {[...new Set(relevant.map((t) => t.category))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Account filter"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">All accounts</option>
            {scoped(data.accounts, scope).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort transactions"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {[
              "Newest first",
              "Oldest first",
              "Amount: high to low",
              "Amount: low to high",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </FilterBar>
        <DataTable
          columns={[
            "Date",
            "Description / payee",
            "Location",
            "Category",
            "Type",
            "Amount",
            "Actions",
          ]}
          empty={!rows.length}
          title="No matching transactions"
          description="Record an expense, income, or movement, or adjust your filters."
        >
          {rows.slice(currentPage * 50, currentPage * 50 + 50).map((t) => (
            <tr key={t.id}>
              <td>{t.businessDate}</td>
              <td>
                <strong>{t.description}</strong>
                <small className="cell-note">
                  {t.payee}
                  {t.accountingStatus !== "classified"
                    ? " · Provisional history"
                    : ""}
                </small>
              </td>
              <td>
                {shops.find((s) => s.id === t.shopId)?.name}
                {t.destinationShopId && t.destinationShopId !== t.shopId && (
                  <small className="cell-note">
                    → {shops.find((s) => s.id === t.destinationShopId)?.name}
                  </small>
                )}
              </td>
              <td>{t.category}</td>
              <td>
                {t.legacyFields && t.accountingStatus !== "classified"
                  ? t.legacyFields.income
                    ? "Recorded revenue"
                    : t.legacyFields.expense
                      ? "Recorded expense"
                      : "Recorded bank movement"
                  : t.kind}
              </td>
              <td>
                {[
                  "Operating expense",
                  "Loan interest",
                  "Commission payment",
                  "Owner distribution",
                  "Bank withdrawal",
                ].includes(t.kind)
                  ? "−"
                  : ""}
                {formatMoney(
                  t.legacyFields && t.accountingStatus !== "classified"
                    ? t.legacyFields.income ||
                        t.legacyFields.expense ||
                        t.legacyFields.bankDebit ||
                        t.legacyFields.bankCredit ||
                        t.legacyFields.bankDeposit ||
                        0
                    : t.amountCents,
                )}
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Details ${t.description}`}
                  onClick={() => setDetail(t)}
                >
                  <Eye size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={
                    !!t.managedBy ||
                    (scope !== "all" && t.shopId !== scope) ||
                    shops.find((s) => s.id === t.shopId)?.status !== "active"
                  }
                  aria-label={`Edit ${t.description}`}
                  onClick={() => setEditing(t)}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={
                    !!t.managedBy ||
                    (scope !== "all" && t.shopId !== scope) ||
                    shops.find((s) => s.id === t.shopId)?.status !== "active"
                  }
                  aria-label={`Delete ${t.description}`}
                  onClick={() => setDeleting(t)}
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
            Previous transactions
          </Button>
          <span>
            Page {currentPage + 1} of {pageCount} · {rows.length} records
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next transactions
          </Button>
        </div>
      </Panel>
      {editing && (
        <TransactionForm
          record={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {deleting && (
        <ConfirmDelete
          title={`Remove ${deleting.description}?`}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            financeService.deleteRecord(
              "transactions",
              deleting.shopId,
              deleting.id,
              deleting.revision,
            )
          }
        />
      )}{" "}
      {detail && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v) setDetail(null);
          }}
          title="Transaction details"
          description={detail.description}
        >
          <div className="form-stack">
            <p>
              {detail.businessDate} · {detail.kind} ·{" "}
              {formatMoney(detail.amountCents)}
            </p>
            <p className="muted small">{detail.notes || "No notes"}</p>
            {detail.managedBy && (
              <p className="notice">
                Linked record: edit it in{" "}
                {detail.managedBy === "dailySales"
                  ? "Daily Sales"
                  : "Stylists & Commissions"}{" "}
                to keep all entries consistent.
              </p>
            )}
            <DataTable
              columns={["Account", "Movement"]}
              empty={!detail.postings?.length}
            >
              {detail.postings?.map((p) => (
                <tr key={p.accountId}>
                  <td>
                    {data.accounts.find((a) => a.id === p.accountId)?.name}
                  </td>
                  <td>{formatMoney(p.deltaCents)}</td>
                </tr>
              ))}
            </DataTable>
            <p className="muted small">
              ID: {detail.id}
              <br />
              Revision: {detail.revisionNumber ?? 1} · {detail.updatedAt}
              <br />
              Classification: {detail.accountingStatus ?? "review"}
            </p>
            {detail.source && (
              <>
                <p className="muted small">
                  Source format: {detail.source.format}
                  <br />
                  Original source ID: {detail.source.originalId}
                </p>
                <details>
                  <summary>Original record (unchanged)</summary>
                  <pre className="source-json">
                    {JSON.stringify(detail.source.raw, null, 2)}
                  </pre>
                </details>
              </>
            )}
            {detail.legacyFields && (
              <div className="source-fields">
                <strong>Independent source fields (CAD)</strong>
                {Object.entries(detail.legacyFields).map(([key, value]) => (
                  <p key={key}>
                    {key}: {formatMoney(value ?? 0)}
                  </p>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
