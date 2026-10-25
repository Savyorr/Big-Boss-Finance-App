import { useFinance } from "../hooks/useFinance";
import { accountBalance, commissionSummary } from "../calculations/finance";
import { today } from "../utils/dates";
import { CommissionWorkspace } from "../components/forms/CommissionWorkspace";
import { BankingWorkspace } from "../components/forms/BankingWorkspace";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Pencil, Search, Landmark, Users } from "lucide-react";
import { useApp } from "../app/context";
import { db } from "../database/db";
import { type Stylist, type Account } from "../models";
import { ProfileForm } from "../components/forms/ProfileForms";
import { Button } from "../components/ui/button";
import {
  PageHeader,
  Panel,
  FilterBar,
  DataTable,
  StageNotice,
} from "../components/ui/shared";
import { formatMoney } from "../calculations/money";
export function ProfilesPage({ kind }: { kind: "stylist" | "account" }) {
  const { scope, shops, locationName } = useApp();
  const data = useFinance();
  const rules = useLiveQuery(() => db.commissionRules.toArray(), []);
  const [editing, setEditing] = useState<Stylist | Account | "new" | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tab, setTab] = useState("Profiles");
  const records = useLiveQuery(async () => {
    const table = db.table<Stylist | Account>(
      kind === "stylist" ? "stylists" : "accounts",
    );
    return (
      scope === "all"
        ? await table.toArray()
        : await table.where("shopId").equals(scope).toArray()
    ).filter((r) => !r.deletedAt);
  }, [scope, kind]);
  const filtered = (records ?? []).filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" || r.status === status),
  );
  const isStylist = kind === "stylist";
  return (
    <>
      <PageHeader
        eyebrow={locationName}
        title={isStylist ? "Stylists & Commissions" : "Banking"}
        description={
          isStylist
            ? "Your team, their profiles, and a clear view of what comes next."
            : "Organize the accounts that keep your business moving."
        }
        action={
          <Button
            disabled={!shops.some((s) => s.status === "active")}
            onClick={() => setEditing("new")}
          >
            <Plus size={17} />
            {isStylist ? "Add stylist" : "Add account"}
          </Button>
        }
      />
      {data &&
        data.transactions.some(
          (t) =>
            !t.deletedAt &&
            (scope === "all" || t.shopId === scope) &&
            t.accountingStatus !== "classified",
        ) && (
          <p className="notice">
            Unclassified imported records need review in Transactions before
            account balances or profit can include them. No bank assignment or
            commission payment has been guessed.
          </p>
        )}
      {data &&
        data.dailySales.some(
          (d) =>
            !d.deletedAt &&
            (scope === "all" || d.shopId === scope) &&
            !d.linkedTransactionIds.length,
        ) && (
          <p className="notice">
            Imported legacy daily records need posting and historical commission
            review. Source totals and stylist allocations are preserved; no
            missing earnings or receiving account has been invented.
          </p>
        )}
      <div className="tabs" role="group" aria-label="Profile sections">
        {(isStylist
          ? ["Profiles", "Commission history", "Payment history"]
          : ["Profiles", "Transaction history", "Reconciliation"]
        ).map((t) => (
          <button
            type="button"
            aria-pressed={tab === t}
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Profiles" ? (
        <Panel
          title={isStylist ? "Stylist directory" : "Financial accounts"}
          subtitle={`${locationName} · ${filtered.length} ${isStylist ? "stylists" : "accounts"}`}
        >
          <FilterBar>
            <div className="search-input">
              <Search size={16} />
              <input
                aria-label={`Search ${kind}s`}
                placeholder={`Search ${kind}s…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Profile status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value={isStylist ? "inactive" : "archived"}>
                {isStylist ? "Inactive" : "Archived"}
              </option>
            </select>
          </FilterBar>
          <DataTable
            empty={filtered.length === 0}
            columns={
              isStylist
                ? [
                    "Stylist",
                    "Location",
                    "Commission rate today",
                    "Earned / paid / outstanding",
                    "Status",
                    "Actions",
                  ]
                : [
                    "Account",
                    "Location",
                    "Type",
                    "Opening balance",
                    "Current balance",
                    "Status",
                    "Actions",
                  ]
            }
            title={
              query
                ? "No matching profiles"
                : isStylist
                  ? "Build your team"
                  : "Give your money a home"
            }
            description={
              isStylist
                ? "Add a stylist and their profile commission rate. Earnings are calculated from saved daily sales."
                : "Add your real accounts and known opening balances. Balances use opening balances and recorded movements."
            }
          >
            {filtered.map((record) => (
              <tr key={record.id}>
                <td>
                  <span className="table-person">
                    <span className="mini-icon">
                      {isStylist ? <Users size={16} /> : <Landmark size={16} />}
                    </span>
                    <strong>{record.name}</strong>
                  </span>
                </td>
                <td>
                  {shops.find((s) => s.id === record.shopId)?.name ??
                    "Unknown shop"}
                </td>
                {"commissionBasisPoints" in record ? (
                  <>
                    <td>
                      {(() => {
                        if (!rules) return "Loading…";
                        const own = rules.filter(
                          (r) =>
                            r.stylistId === record.id &&
                            r.shopId === record.shopId,
                        );
                        const applicable = own
                          .filter(
                            (r) =>
                              !r.deletedAt &&
                              r.effectiveFrom <= today() &&
                              (!r.effectiveTo || r.effectiveTo >= today()),
                          )
                          .sort((a, b) =>
                            b.effectiveFrom.localeCompare(a.effectiveFrom),
                          )[0];
                        const rate =
                          applicable?.rateBasisPoints ??
                          (own.length
                            ? undefined
                            : record.commissionBasisPoints);
                        const upcoming = own
                          .filter(
                            (r) => !r.deletedAt && r.effectiveFrom > today(),
                          )
                          .sort((a, b) =>
                            a.effectiveFrom.localeCompare(b.effectiveFrom),
                          )[0];
                        return (
                          <>
                            {rate === undefined
                              ? "Needs effective rate"
                              : `${(rate / 100).toFixed(2)}%`}
                            {upcoming && (
                              <small className="muted">
                                {" "}
                                · {(upcoming.rateBasisPoints / 100).toFixed(2)}%
                                from {upcoming.effectiveFrom}
                              </small>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td>
                      {data
                        ? (() => {
                            const c = commissionSummary(
                              data,
                              record.id,
                              "0001-01-01",
                              today(),
                            );
                            return `${formatMoney(c.earnedCents)} / ${formatMoney(c.paidCents)} / ${formatMoney(c.outstandingCents)}`;
                          })()
                        : "Loading…"}
                    </td>
                  </>
                ) : (
                  <>
                    <td>{record.type}</td>
                    <td>
                      {formatMoney(record.openingBalanceCents)}
                      <small className="cell-note">
                        As of {record.openingDate}
                      </small>
                    </td>
                    <td>
                      {data
                        ? (() => {
                            const balance = accountBalance(
                              data,
                              record,
                              today(),
                            );
                            return balance === null
                              ? "Before opening date"
                              : formatMoney(balance);
                          })()
                        : "Loading…"}
                    </td>
                  </>
                )}
                <td>
                  <span
                    className={`badge ${record.status === "active" ? "badge-green" : ""}`}
                  >
                    {record.status}
                  </span>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={
                      shops.find((s) => s.id === record.shopId)?.status !==
                      "active"
                    }
                    onClick={() => setEditing(record)}
                    aria-label={`Edit ${record.name}`}
                  >
                    <Pencil size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      ) : isStylist ? (
        <CommissionWorkspace tab={tab} />
      ) : (
        <BankingWorkspace tab={tab} />
      )}
      {editing && (
        <ProfileForm
          kind={kind}
          record={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
