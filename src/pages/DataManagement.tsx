import { Link } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Upload, Download, ShieldCheck, FileJson, History } from "lucide-react";
import { useApp } from "../app/context";
import { db } from "../database/db";
import {
  exchangeService,
  downloadEnvelope,
  type ImportPlan,
  type Resolutions,
} from "../services/exchange";
import {
  sourceTotals,
  normalizedTotals,
  entityTables,
  type Envelope,
} from "../services/exchange/schema";
import { validateData } from "../services/exchange/validate";
import { resolveCandidate } from "../services/exchange/plan";
import { MAX_FILE_BYTES } from "../services/exchange/json";
import { formatMoney } from "../calculations/money";
import { messageOf } from "../components/forms/FinancialShared";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import {
  PageHeader,
  Panel,
  Field,
  DataTable,
  ErrorMessage,
} from "../components/ui/shared";
function TotalTable({ values }: { values: Record<string, number> }) {
  return (
    <DataTable
      columns={["Source field (not accounting profit)", "CAD cents preserved"]}
      empty={false}
    >
      {Object.entries(values).map(([key, v]) => (
        <tr key={key}>
          <td>{key}</td>
          <td>{formatMoney(v)}</td>
        </tr>
      ))}
    </DataTable>
  );
}
const fieldLabels: Record<string, string> = {
  amountCents: "Amount",
  openingBalanceCents: "Opening balance",
  serviceCents: "Service revenue",
  productCents: "Product sales",
  cashCents: "Cash receipts",
  cardCents: "Card receipts",
  revenueCents: "Recognized revenue",
  operatingExpenseCents: "Operating expenses",
  commissionExpenseCents: "Commissions",
  businessDate: "Date",
  name: "Name",
  description: "Description",
  category: "Category",
  payee: "Payee",
  notes: "Notes",
  status: "Status",
  commissionBasisPoints: "Commission rate",
  rateBasisPoints: "Applied commission rate",
};
function readableDifferences(conflict: ImportPlan["conflicts"][number]) {
  const rows: { label: string; local: string; imported: string }[] = [];
  for (const change of conflict.changes) {
    const a = change.local,
      b = change.incoming;
    rows.push({
      label: `${change.table} · record status`,
      local: !a ? "Not present" : a.deletedAt ? "Deleted" : "Present",
      imported: b.deletedAt ? "Deleted" : "Present",
    });
    for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b)])) {
      if (
        (a?.[key] === undefined && b[key] === undefined) ||
        JSON.stringify(a?.[key]) === JSON.stringify(b[key])
      )
        continue;
      if (key.endsWith("Cents"))
        rows.push({
          label: fieldLabels[key] ?? key.replace(/Cents$/, " amount"),
          local: a?.[key] === undefined ? "—" : formatMoney(a[key]),
          imported: b[key] === undefined ? "—" : formatMoney(b[key]),
        });
      else if (key.endsWith("BasisPoints"))
        rows.push({
          label: fieldLabels[key] ?? "Commission rate",
          local: a?.[key] === undefined ? "—" : `${(a[key] / 100).toFixed(2)}%`,
          imported:
            b[key] === undefined ? "—" : `${(b[key] / 100).toFixed(2)}%`,
        });
      else if (fieldLabels[key])
        rows.push({
          label: fieldLabels[key],
          local: String(a?.[key] ?? "—"),
          imported: String(b[key] ?? "—"),
        });
    }
    for (const key of [
      "income",
      "expense",
      "bankCredit",
      "bankDeposit",
      "bankDebit",
    ])
      if (a?.legacyFields?.[key] !== b.legacyFields?.[key])
        rows.push({
          label: `Original ${key}`,
          local:
            a?.legacyFields?.[key] === undefined
              ? "—"
              : formatMoney(a.legacyFields[key]),
          imported:
            b.legacyFields?.[key] === undefined
              ? "—"
              : formatMoney(b.legacyFields[key]),
        });
  }
  return rows;
}
export function DataManagementPage() {
  const { shops, scope } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(scope === "all" ? "" : scope);
  useEffect(() => {
    if (!target && scope !== "all") setTarget(scope);
  }, [scope, target]);
  const [namespace, setNamespace] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [resolutions, setResolutions] = useState<Resolutions>({});
  const [mappingDirty, setMappingDirty] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [replaceText, setReplaceText] = useState("");
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [replacementPage, setReplacementPage] = useState(0);
  const [conflictPage, setConflictPage] = useState(0);
  const [download, setDownload] = useState<Envelope | null>(null);
  const [backupPage, setBackupPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const history = useLiveQuery(
    () => db.importHistory.orderBy("importedAt").reverse().toArray(),
    [],
  );
  const backups = useLiveQuery(
    () => db.backups.orderBy("createdAt").reverse().toArray(),
    [],
  );
  const legacySettings = useLiveQuery(
    async () =>
      (await db.settings.toArray()).filter(
        (s) =>
          s.key.startsWith("legacy:") && s.value && typeof s.value === "object",
      ),
    [],
  );
  const lastExport = useLiveQuery(() => db.settings.get("lastExport"), []);
  const docs = useLiveQuery(() => db.sourceDocuments.toArray(), []);
  function reset() {
    setPlan(null);
    setResolutions({});
    setConfirmation(false);
    setReplaceText("");
    setConflictPage(0);
    setMappingConfirmed(false);
    setMappingDirty(false);
  }
  function choose(next?: File) {
    if (!next) return;
    reset();
    setStatus("");
    if (!next.name.toLowerCase().endsWith(".json")) {
      setError("Choose a .json file. Nothing was imported.");
      setFile(null);
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      setError("File exceeds the 25 MB import limit.");
      setFile(null);
      return;
    }
    setError("");
    setFile(next);
    setMapping({});
    void preview(next);
  }
  async function preview(selectedFile: File | null = file) {
    if (!selectedFile) return;
    setBusy("Reading and validating locally…");
    setError("");
    reset();
    try {
      const next = await exchangeService.preview(selectedFile, {
        targetShopId: target || undefined,
        namespace: namespace || undefined,
        mode,
        mapping: selectedFile === file ? mapping : {},
      });
      setPlan(next);
      setStatus("Preview ready. No business records have changed.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy("");
    }
  }
  async function exportScope(
    exportScope: string | "all",
    type: "shop" | "all" | "backup",
  ) {
    setBusy("Preparing export…");
    setError("");
    try {
      setDownload(await exchangeService.exportData(exportScope, type));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy("");
    }
  }
  async function confirmImport() {
    if (!plan) return;
    setBusy("Saving recovery backup and applying import atomically…");
    setError("");
    try {
      const result = await exchangeService.apply(plan.token, resolutions, {
        confirmed: true,
        replaceText,
        mappingConfirmed,
      });
      setStatus(
        `Import complete: ${result.added} business records added, ${result.updated} updated, ${result.skipped} unchanged/older, ${result.deleted} deleted; ${result.conflicts} conflicts resolved. Source totals reconciled exactly. Recovery backup retained.`,
      );
      setConfirmation(false);
      setPlan(null);
    } catch (e) {
      setError(messageOf(e));
      setConfirmation(false);
    } finally {
      setBusy("");
    }
  }
  async function backup() {
    setBusy("Creating local recovery backup…");
    setError("");
    try {
      const record = await exchangeService.createBackup();
      setDownload(record.payload);
      setStatus(
        "Recovery backup saved in this browser. Download and retain the JSON file separately.",
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy("");
    }
  }
  let proposedFinancial: Record<string, number> | undefined;
  let proposed: Record<string, number> | undefined,
    proposedError = "";
  if (plan && plan.conflicts.every((c) => resolutions[c.id])) {
    try {
      const candidate = resolveCandidate(plan, resolutions);
      validateData(candidate);
      proposed = sourceTotals(candidate, plan.prepared.shopIds);
      proposedFinancial = normalizedTotals(candidate, plan.prepared.shopIds);
    } catch (e) {
      proposedError = messageOf(e);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="YOUR DATA, IN YOUR HANDS"
        title="Data Management"
        description="Share JSON files manually. Review every import before it changes your books."
      />
      {error && <ErrorMessage message={error} />}
      <p className="notice">
        <ShieldCheck size={18} />
        Everything is processed on this device. Retain downloaded backups
        outside this browser; clearing browser storage also clears local
        recovery points.
      </p>
      {(busy || status) && (
        <p role="status" className="notice">
          {busy || status}
        </p>
      )}
      {status.startsWith("Import complete") && (
        <section className="legacy-overview">
          <h2>Your imported history is ready</h2>
          <p>
            The original transaction-only JSON does not include barber/stylist
            profiles. If you imported that file, your financial transactions are
            saved, but you must add your barbers or import a full backup that
            includes staff.
          </p>
          <Button asChild>
            <Link to="/">See imported financial history</Link>
          </Button>{" "}
          <Button asChild variant="outline">
            <Link to="/stylists">Add your barbers</Link>
          </Button>
        </section>
      )}
      <div className="two-columns">
        <Panel
          title="Import Data"
          subtitle="Legacy transactions, original HTML state backups, and modern Big Boss exports."
        >
          <div
            className="drop-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) choose(e.dataTransfer.files[0]);
            }}
          >
            <span className="empty-icon">
              <Upload size={25} />
            </span>
            <h3>Choose a JSON backup</h3>
            <p>Drop a file here · maximum 25 MB</p>
            <input
              ref={input}
              disabled={!!busy}
              aria-label="Select JSON file"
              type="file"
              accept=".json,application/json"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => input.current?.click()}
            >
              Browse Files
            </Button>
            {file && (
              <p className="file-name">
                <FileJson size={16} />
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
          <div className="form-stack">
            <p className="notice">
              Import into this business:{" "}
              <strong>
                {shops.find((s) => s.id === target)?.name ??
                  "Choose a destination below"}
              </strong>
              . Choosing a file prepares a preview; nothing is saved until you
              confirm.
            </p>
            <details>
              <summary>Advanced import options</summary>
              <Field label="Target shop for legacy records">
                <select
                  disabled={!!busy}
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    reset();
                  }}
                >
                  <option value="">Choose a target for legacy files</option>
                  {shops
                    .filter((s) => s.status === "active")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Legacy dataset label (optional)"
                hint="Keep this label consistent for files from the same originating dataset. Different datasets with reused IDs need different labels."
              >
                <input
                  value={namespace}
                  disabled={!!busy}
                  onChange={(e) => {
                    setNamespace(e.target.value);
                    reset();
                  }}
                  placeholder="Defaults to the legacy application's identity"
                />
              </Field>
              <Field label="Import mode">
                <select
                  value={mode}
                  disabled={!!busy}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    reset();
                  }}
                >
                  <option value="merge">Merge · recommended</option>
                  <option value="replace">
                    Replace selected imported shop scope · advanced
                  </option>
                </select>
              </Field>
            </details>
            <Button disabled={!file || !!busy} onClick={() => preview()}>
              <Upload size={16} />
              Preview import
            </Button>
            {plan && (
              <>
                <div className="preview-placeholder">
                  <strong>
                    {plan.prepared.format} · schema{" "}
                    {plan.prepared.schemaVersion}
                  </strong>
                  <p>
                    File: {file?.name ?? "Local recovery backup"}
                    <br />
                    Exported:{" "}
                    {plan.prepared.exportedAt ?? "Not present in legacy file"}
                    <br />
                    Source transactions: {plan.prepared.sourceCount}
                    <br />
                    <strong>
                      Destination:{" "}
                      {plan.prepared.shopIds
                        .map(
                          (id) =>
                            shops.find((s) => s.id === id)?.name ??
                            plan.prepared.data.shops.find((s) => s.id === id)
                              ?.name ??
                            id,
                        )
                        .join(", ")}
                    </strong>
                  </p>
                </div>
                {plan.prepared.format === "modern" && (
                  <div className="form-stack">
                    <strong>Source shop identity mapping</strong>
                    <p className="muted small">
                      Matching names never merges shops. Keep source IDs, or
                      explicitly map to a local shop and preview again.
                    </p>
                    {(
                      plan.prepared.sourceShops ?? plan.prepared.data.shops
                    ).map((s) => (
                      <Field key={s.id} label={`Map ${s.name}`}>
                        <select
                          value={
                            mapping[s.id] ??
                            plan.prepared.appliedMapping?.[s.id] ??
                            s.id
                          }
                          onChange={(e) => {
                            setMapping({ ...mapping, [s.id]: e.target.value });
                            setStatus(
                              "Shop mapping changed. Preview again before importing.",
                            );
                            setPlan(null);
                          }}
                        >
                          {plan.prepared.ambiguousMappingIds?.includes(
                            s.id,
                          ) && (
                            <option value="" disabled>
                              Choose an explicit destination
                            </option>
                          )}
                          <option value={s.id}>
                            Keep source shop · {s.name}
                          </option>
                          {shops
                            .filter((local) => local.id !== s.id)
                            .map((local) => (
                              <option value={local.id} key={local.id}>
                                Map to {local.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                )}
                {plan.warnings.map((w, i) => (
                  <p className="notice" key={i}>
                    {w}
                  </p>
                ))}
                <div className="totals-grid">
                  <span>
                    New
                    <strong>
                      {
                        plan.changes.filter(
                          (c) =>
                            entityTables.includes(c.table as any) &&
                            c.action === "add",
                        ).length
                      }
                    </strong>
                  </span>
                  <span>
                    Updates
                    <strong>
                      {
                        plan.changes.filter(
                          (c) =>
                            entityTables.includes(c.table as any) &&
                            c.action === "update",
                        ).length
                      }
                    </strong>
                  </span>
                  <span>
                    Unchanged / older
                    <strong>{plan.counts.unchanged + plan.counts.older}</strong>
                  </span>
                  <span>
                    Conflict groups<strong>{plan.conflicts.length}</strong>
                  </span>
                </div>
                {plan.mode === "replace" && (
                  <details>
                    <summary>
                      Records removed by replacement (
                      {plan.replacementRemovals.length})
                    </summary>
                    <DataTable
                      columns={["Type", "Record", "Shop"]}
                      empty={!plan.replacementRemovals.length}
                      title="No extra active records to remove"
                    >
                      {plan.replacementRemovals
                        .slice(replacementPage * 20, replacementPage * 20 + 20)
                        .map((r) => (
                          <tr key={`${r.table}:${r.id}`}>
                            <td>{r.table}</td>
                            <td>
                              {r.label}
                              <small className="cell-note">{r.id}</small>
                            </td>
                            <td>
                              {shops.find((s) => s.id === r.shopId)?.name ??
                                r.shopId}
                            </td>
                          </tr>
                        ))}
                    </DataTable>
                    <div className="heading-actions">
                      <Button
                        variant="outline"
                        disabled={replacementPage === 0}
                        onClick={() => setReplacementPage((p) => p - 1)}
                      >
                        Previous removals
                      </Button>
                      <Button
                        variant="outline"
                        disabled={
                          (replacementPage + 1) * 20 >=
                          plan.replacementRemovals.length
                        }
                        onClick={() => setReplacementPage((p) => p + 1)}
                      >
                        Next removals
                      </Button>
                    </div>
                  </details>
                )}
                <details>
                  <summary>Source totals</summary>
                  <TotalTable values={plan.sourceTotals} />
                </details>
                <details>
                  <summary>Current destination totals</summary>
                  <TotalTable values={plan.destinationTotals} />
                </details>
                <details>
                  <summary>Expected destination totals after import</summary>
                  {proposed ? (
                    <TotalTable values={proposed} />
                  ) : (
                    <p className="muted small">
                      Resolve conflicts to calculate expected totals.
                    </p>
                  )}
                </details>
                <details>
                  <summary>
                    Classified financial amounts · source / destination /
                    expected
                  </summary>
                  <p className="muted small">
                    All dates in the selected dataset. These totals are separate
                    from the five original source fields. Unclassified entries
                    do not become recognized profit or balances.
                  </p>
                  <DataTable
                    columns={[
                      "Measure",
                      "Source",
                      "Destination before",
                      "Expected after",
                    ]}
                    empty={false}
                  >
                    {Object.keys(normalizedTotals(plan.prepared.data)).map(
                      (key) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>
                            {formatMoney(
                              normalizedTotals(plan.prepared.data)[
                                key as keyof ReturnType<typeof normalizedTotals>
                              ],
                            )}
                          </td>
                          <td>
                            {formatMoney(
                              normalizedTotals(
                                plan.baseline,
                                plan.prepared.shopIds,
                              )[
                                key as keyof ReturnType<typeof normalizedTotals>
                              ],
                            )}
                          </td>
                          <td>
                            {proposedFinancial
                              ? formatMoney(proposedFinancial[key])
                              : "Resolve conflicts first"}
                          </td>
                        </tr>
                      ),
                    )}
                  </DataTable>
                </details>
                {proposedError && <ErrorMessage message={proposedError} />}
                <Button
                  disabled={
                    !!busy ||
                    plan.conflicts.some((c) => !resolutions[c.id]) ||
                    !!proposedError ||
                    mappingDirty ||
                    !!plan.prepared.ambiguousMappingIds?.length
                  }
                  onClick={() => setConfirmation(true)}
                >
                  Confirm Import
                </Button>
              </>
            )}
          </div>
        </Panel>
        <div className="stack">
          <Panel
            title="Export Data"
            subtitle="Send downloaded JSON using email, WhatsApp, or USB."
          >
            <div className="export-options">
              {shops.length > 1 && (
                <div>
                  <Download size={20} />
                  <div>
                    <strong>Current shop</strong>
                    <p>Includes all required records and revision history.</p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={scope === "all" || !!busy}
                    onClick={() => exportScope(scope, "shop")}
                  >
                    Export Current Shop
                  </Button>
                </div>
              )}
              <div>
                <Download size={20} />
                <div>
                  <strong>This business profile</strong>
                  <p>
                    All records, settings and history in this business only.
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => exportScope("all", "all")}
                >
                  Export business JSON
                </Button>
              </div>
              <div>
                <Download size={20} />
                <div>
                  <strong>Full business backup</strong>
                  <p>Restorable into a fresh installation.</p>
                </div>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => exportScope("all", "backup")}
                >
                  Download Full Backup
                </Button>
              </div>
            </div>
            <p className="muted small">
              Last download initiated:{" "}
              {lastExport
                ? String((lastExport.value as any)?.exportedAt ?? "Unknown")
                : "None"}
              .
            </p>
            <p className="muted small">
              A shop linked by transfers requires its connected locations to
              keep both sides complete. The download confirmation lists every
              included shop.
            </p>
          </Panel>
          <Panel
            title="Backup & Restore"
            subtitle="Local recovery points plus independent downloaded files."
          >
            <div className="form-stack">
              <Button onClick={backup} disabled={!!busy}>
                Create Backup
              </Button>
              <Button
                variant="outline"
                onClick={() => input.current?.click()}
                disabled={!!busy}
              >
                Restore Backup from File
              </Button>
              <p className="muted small">
                Choose a backup, preview its contents, then use Replace to
                rewind its displayed shop scope. Other shops remain untouched.
                Local recovery snapshots survive a failed apply; they cannot
                survive cleared browser storage.
              </p>
              <p className="muted small">
                {docs?.length ?? 0} source documents retained for provenance.
                Legacy bank snapshots and unsupported fields remain available in
                exports and the integrity summary.
              </p>
            </div>
          </Panel>
        </div>
      </div>
      {plan && plan.conflicts.length > 0 && (
        <Panel
          title="Resolve conflicting versions"
          subtitle="Linked financial records are one group. No version is selected automatically."
        >
          <div className="form-stack">
            <div className="heading-actions">
              <Button
                variant="outline"
                onClick={() =>
                  setResolutions(
                    Object.fromEntries(
                      plan.conflicts.map((c) => [c.id, "local"]),
                    ),
                  )
                }
              >
                Keep Local for all conflicts
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setResolutions(
                    Object.fromEntries(
                      plan.conflicts.map((c) => [c.id, "imported"]),
                    ),
                  )
                }
              >
                Use Imported for all conflicts
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  setStatus("Import cancelled. No records changed.");
                }}
              >
                Cancel import
              </Button>
            </div>
            {plan.conflicts
              .slice(conflictPage * 10, conflictPage * 10 + 10)
              .map((c) => (
                <section className="conflict-card" key={c.id}>
                  <h3>{c.label}</h3>
                  <p className="muted small">
                    {c.changes
                      .map(
                        (ch) =>
                          `${ch.table}: ${ch.fields.join(", ") || "new linked record"}`,
                      )
                      .join(" · ")}
                  </p>
                  <DataTable
                    columns={[
                      "Changed record / field",
                      "Local version",
                      "Imported version",
                    ]}
                    empty={false}
                  >
                    {readableDifferences(c).map((row, i) => (
                      <tr key={i}>
                        <td>{row.label}</td>
                        <td>{row.local}</td>
                        <td>{row.imported}</td>
                      </tr>
                    ))}
                  </DataTable>
                  <details>
                    <summary>Full record details</summary>
                    <div className="two-columns">
                      <div>
                        <strong>Local version</strong>
                        <pre>
                          {JSON.stringify(
                            c.changes.map((ch) => ({
                              table: ch.table,
                              record: ch.local ?? "Not present",
                            })),
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                      <div>
                        <strong>Imported version</strong>
                        <pre>
                          {JSON.stringify(
                            c.changes.map((ch) => ({
                              table: ch.table,
                              record: ch.incoming,
                            })),
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    </div>
                  </details>
                  <div className="segmented">
                    <button
                      className={
                        resolutions[c.id] === "local" ? "selected" : ""
                      }
                      onClick={() =>
                        setResolutions({ ...resolutions, [c.id]: "local" })
                      }
                    >
                      Keep Local
                    </button>
                    <button
                      className={
                        resolutions[c.id] === "imported" ? "selected" : ""
                      }
                      onClick={() =>
                        setResolutions({ ...resolutions, [c.id]: "imported" })
                      }
                    >
                      Use Imported
                    </button>
                  </div>
                </section>
              ))}
            <div className="heading-actions">
              <Button
                variant="outline"
                disabled={conflictPage === 0}
                onClick={() => setConflictPage((p) => p - 1)}
              >
                Previous conflicts
              </Button>
              <span className="small">Page {conflictPage + 1}</span>
              <Button
                variant="outline"
                disabled={(conflictPage + 1) * 10 >= plan.conflicts.length}
                onClick={() => setConflictPage((p) => p + 1)}
              >
                Next conflicts
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {!!legacySettings?.length && (
        <Panel
          title="Legacy information requiring review"
          subtitle="These original snapshots are references, not verified current balances. No opening date, account mapping, or financial classification was invented."
        >
          <div className="form-stack">
            {legacySettings.map((s) => {
              const value = s.value as any;
              return (
                <section key={s.key}>
                  <h3>
                    {shops.find((shop) => shop.id === s.shopId)?.name ??
                      s.shopId}
                  </h3>
                  <p className="muted small">
                    Original opening bank value:{" "}
                    {Number.isSafeInteger(value.openCents)
                      ? formatMoney(value.openCents)
                      : String(value.open ?? "Not supplied")}{" "}
                    CAD · Snapshot date:{" "}
                    {String(value.bal?.asOf ?? "Not supplied")}
                  </p>
                  <DataTable
                    columns={[
                      "Original account/item label",
                      "Source snapshot (CAD)",
                    ]}
                    empty={
                      !Array.isArray(value.bal?.items) ||
                      !value.bal.items.length
                    }
                  >
                    {Array.isArray(value.bal?.items) &&
                      value.bal.items.map((item: any, i: number) => (
                        <tr key={i}>
                          <td>{String(item?.n ?? "Unlabelled")}</td>
                          <td>{String(item?.v ?? "Not supplied")}</td>
                        </tr>
                      ))}
                  </DataTable>
                </section>
              );
            })}
          </div>
        </Panel>
      )}
      <details>
        <summary>Import history & recovery backups</summary>
        <Panel title="Backup history" action={<History size={18} />}>
          <DataTable
            columns={["Created", "Locations", "Reason", "Recovery", "Actions"]}
            empty={!backups?.length}
            title="No local backups yet"
            description="Create a backup and retain a downloaded copy."
          >
            {backups?.slice(backupPage * 25, backupPage * 25 + 25).map((b) => (
              <tr key={b.id}>
                <td>{b.createdAt}</td>
                <td>{b.shopIds.length}</td>
                <td>{b.reason}</td>
                <td>
                  {b.payload
                    ? "Recovery available"
                    : "Metadata only · use original file"}
                </td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!b.payload || !!busy}
                    onClick={() => setDownload(b.payload as Envelope)}
                  >
                    Download backup
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!b.payload || !!busy}
                    onClick={async () => {
                      setBusy("Preparing restore preview…");
                      setError("");
                      reset();
                      try {
                        setMode("replace");
                        setPlan(await exchangeService.restorePreview(b.id));
                        setStatus(
                          "Restore preview ready. Resolve differences and confirm replacement.",
                        );
                      } catch (e) {
                        setError(messageOf(e));
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Restore Backup
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
          <div className="table-footer">
            <Button
              variant="outline"
              size="sm"
              disabled={backupPage === 0}
              onClick={() => setBackupPage((p) => p - 1)}
            >
              Previous backups
            </Button>
            <span>Page {backupPage + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={(backupPage + 1) * 25 >= (backups?.length ?? 0)}
              onClick={() => setBackupPage((p) => p + 1)}
            >
              Next backups
            </Button>
          </div>
        </Panel>
        <Panel title="Import history">
          <DataTable
            columns={[
              "Filename / format",
              "Imported",
              "Destination",
              "Added",
              "Updated",
              "Skipped",
              "Deleted",
              "Conflicts",
              "Errors / result",
            ]}
            empty={!history?.length}
            title="No imports performed"
          >
            {history
              ?.slice(historyPage * 25, historyPage * 25 + 25)
              .map((h) => (
                <tr key={h.id}>
                  <td>
                    {h.filename}
                    <small className="cell-note">
                      {h.format} · {h.mode}
                    </small>
                  </td>
                  <td>{h.importedAt}</td>
                  <td>
                    {h.shopIds
                      .map((id) => shops.find((s) => s.id === id)?.name ?? id)
                      .join(", ")}
                  </td>
                  <td>{h.added}</td>
                  <td>{h.updated}</td>
                  <td>{h.skipped ?? 0}</td>
                  <td>{h.deleted ?? 0}</td>
                  <td>{h.conflicts}</td>
                  <td>
                    {h.result}
                    <small className="cell-note">{h.errors?.join(" · ")}</small>
                  </td>
                </tr>
              ))}
          </DataTable>
          <div className="table-footer">
            <Button
              variant="outline"
              size="sm"
              disabled={historyPage === 0}
              onClick={() => setHistoryPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>Page {historyPage + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={(historyPage + 1) * 25 >= (history?.length ?? 0)}
              onClick={() => setHistoryPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </Panel>
      </details>
      {confirmation && plan && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!busy) setConfirmation(open);
          }}
          title={
            plan.mode === "replace"
              ? "Confirm scoped replacement"
              : "Confirm import"
          }
          description="A recoverable snapshot is saved before applying changes. Validation or write failure rolls back the business changes."
        >
          <div className="form-stack">
            <p>
              Destination:{" "}
              <strong>
                {plan.prepared.shopIds
                  .map(
                    (id) =>
                      shops.find((s) => s.id === id)?.name ??
                      plan.prepared.data.shops.find((s) => s.id === id)?.name ??
                      id,
                  )
                  .join(", ")}
              </strong>
            </p>
            {plan.mode === "replace" && (
              <>
                <p className="notice">
                  Replacement removes active business records missing from the
                  file in the selected scope only:{" "}
                  {plan.replaceShopIds
                    .map((id) => shops.find((s) => s.id === id)?.name ?? id)
                    .join(", ")}
                  . Unrelated shops are preserved. History and provenance remain
                  auditable.
                </p>
                <Field label="Type REPLACE to confirm">
                  <input
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                  />
                </Field>
              </>
            )}
            {plan.prepared.warnings.some((w) =>
              w.startsWith("Explicit shop mapping"),
            ) && (
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={mappingConfirmed}
                  onChange={(e) => setMappingConfirmed(e.target.checked)}
                />
                I confirm the source-to-local shop mapping.
              </label>
            )}
            <Button
              disabled={
                !!busy ||
                (plan.mode === "replace" && replaceText !== "REPLACE") ||
                (plan.prepared.warnings.some((w) =>
                  w.startsWith("Explicit shop mapping"),
                ) &&
                  !mappingConfirmed)
              }
              onClick={confirmImport}
            >
              Apply {plan.mode === "replace" ? "replacement" : "merge"}
            </Button>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => setConfirmation(false)}
            >
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
      {download && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDownload(null);
          }}
          title="Download JSON file"
          description="Review which shops the file contains before sharing it."
        >
          <div className="form-stack">
            <p>
              Included locations:{" "}
              {download.data.shops.map((s) => s.name).join(", ") ||
                "No shops yet"}
            </p>
            {download.scope.requestedShopId &&
              download.scope.shopIds.length > 1 && (
                <p className="notice">
                  This file also contains connected locations because of
                  inter-shop transfers. Share it only with an owner authorized
                  to see all listed locations.
                </p>
              )}
            <p className="muted small">
              The browser initiates the download. Confirm it finished in your
              Downloads folder and keep an independent copy. Generating a file
              does not guarantee it was saved.
            </p>
            <Button
              onClick={async () => {
                try {
                  const initiated = await downloadEnvelope(
                    download,
                    download.scope.type === "backup"
                      ? "FullBackup"
                      : download.scope.type === "shop"
                        ? "ShopExport"
                        : "AllLocations",
                  );
                  setStatus(
                    initiated.trackingSaved
                      ? "JSON download initiated. Confirm completion in your browser and retain the file."
                      : "Download initiated, but the local last-export note could not be saved. Confirm the file in your Downloads folder.",
                  );
                  setDownload(null);
                } catch (e) {
                  setError(messageOf(e));
                }
              }}
            >
              Download JSON
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
