import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { exported, download, planImport, applyPlan, Plan } from "./store";
import { rows, settings, sourceTotals, formatMoney as M } from "./model";
import { Field, Table, Panel, Common } from "./ui";
import { prepareFile } from "./import";
export function DataPage({ db, all, run, notify, busy }: Common) {
  const [plan, setPlan] = useState<Plan | null>(null),
    [format, setFormat] = useState(""),
    [filename, setFilename] = useState(""),
    [choices, setChoices] = useState<Record<string, "local" | "incoming">>({}),
    [replace, setReplace] = useState(false),
    [confirm, setConfirm] = useState(""),
    [paste, setPaste] = useState("");
  const backups =
    useLiveQuery(
      () => db.backups.orderBy("created").reverse().toArray(),
      [db],
    ) ?? [];
  const totals = sourceTotals(all);
  async function preview(file: File, restore = false) {
    setPlan(null);
    setChoices({});
    setReplace(false);
    setConfirm("");
    const result = await prepareFile(db, file);
    const p = await planImport(db, result.envelope);
    setFormat(result.format);
    setFilename(file.name);
    setPlan(p);
    if (restore || /\.xls[xm]$/i.test(file.name)) setReplace(true);
  }
  return (
    <>
      <div className="data-grid">
        <Panel title="Import JSON">
          <p className="muted">
            Choose a file, check the preview, then confirm.
          </p>
          <Field label="Import JSON file">
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void run(() => preview(f));
              }}
            />
          </Field>
          {plan && (
            <div className="import-preview">
              <h3>Review Changes</h3>
              <p>
                {filename} · {format}
              </p>
              <p>
                <strong>
                  Business:{" "}
                  {rows(plan.incoming.records, "settings")[0]?.value.name ??
                    settings(all).name}
                </strong>
                {plan.adopt ? " — restore into this empty profile" : ""}
              </p>
              <div className="preview-counts">
                <span>
                  <b>{plan.added}</b>New
                </span>
                <span>
                  <b>{plan.updated}</b>Updated
                </span>
                <span>
                  <b>{plan.unchanged}</b>Unchanged
                </span>
                <span>
                  <b>{plan.conflicts.length}</b>Conflicts
                </span>
              </div>
              <p>
                {rows(plan.incoming.records, "tx").length} transactions ·{" "}
                {rows(plan.incoming.records, "staff").length} barbers ·{" "}
                {rows(plan.incoming.records, "day").length} daily sales
              </p>
              {plan.conflicts.map((c) => (
                <section key={c.id} className="conflict">
                  <h3>
                    Conflicting {c.local.kind}:{" "}
                    {c.local.kind === "tx"
                      ? c.local.value.date + " · " + c.local.value.payee
                      : c.local.kind === "staff"
                        ? c.local.value.name
                        : c.id}
                  </h3>
                  <div className="conflict-versions">
                    {(["local", "incoming"] as const).map((side) => (
                      <div key={side}>
                        <strong>
                          {side === "local"
                            ? "On this device"
                            : "In imported file"}
                          {c[side].deleted ? " — deleted" : ""}
                        </strong>
                        <dl>
                          {Object.entries(c[side].value)
                            .filter(
                              ([k]) =>
                                k !== "raw" &&
                                JSON.stringify(
                                  (c.local.value as Record<string, unknown>)[k],
                                ) !==
                                  JSON.stringify(
                                    (
                                      c.incoming.value as Record<
                                        string,
                                        unknown
                                      >
                                    )[k],
                                  ),
                            )
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>
                                  {(
                                    {
                                      bankCredit: "Bank credits",
                                      bankDeposit: "Bank deposits",
                                      bankDebit: "Bank debits",
                                      income: "Income",
                                      expense: "Expense",
                                      amount: "Amount",
                                      sales: "Service sales",
                                      rates: "Commission rates",
                                      total: "Total revenue",
                                      product: "Product sales",
                                      card: "Card receipts",
                                      deposit: "Sales deposits",
                                      staffId: "Barber",
                                      opening: "Opening balance",
                                      openingKnown: "Opening balance supplied",
                                      asOf: "Statement date",
                                      limit: "Operating Line limit",
                                    } as Record<string, string>
                                  )[k] ??
                                    k.charAt(0).toUpperCase() + k.slice(1)}
                                </dt>
                                <dd>
                                  {typeof v === "number" &&
                                  [
                                    "income",
                                    "expense",
                                    "bankCredit",
                                    "bankDeposit",
                                    "bankDebit",
                                    "amount",
                                    "total",
                                    "card",
                                    "deposit",
                                    "product",
                                    "opening",
                                    "limit",
                                  ].includes(k)
                                    ? M(v)
                                    : k === "staffId"
                                      ? (rows(all, "staff").find(
                                          (s) => s.id === v,
                                        )?.value.name ?? String(v))
                                      : k === "sales" || k === "rates"
                                        ? Object.entries(
                                            v as Record<string, number>,
                                          ).map(([id, n]) => (
                                            <div key={id}>
                                              {rows(all, "staff").find(
                                                (s) => s.id === id,
                                              )?.value.name ?? "Barber"}
                                              :{" "}
                                              {k === "sales"
                                                ? M(n)
                                                : n / 100 + "%"}
                                            </div>
                                          ))
                                        : typeof v === "object"
                                          ? JSON.stringify(v)
                                          : String(v)}
                                </dd>
                              </div>
                            ))}
                        </dl>
                        <label className="check">
                          <input
                            type="radio"
                            name={c.id}
                            checked={choices[c.id] === side}
                            onChange={() =>
                              setChoices({ ...choices, [c.id]: side })
                            }
                          />
                          Use {side === "local" ? "this device’s" : "imported"}{" "}
                          version
                        </label>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              <details open={replace || undefined}>
                <summary>Replace instead of merge</summary>
                <p>
                  Only use replacement to restore a complete backup. A
                  recoverable local backup is saved first.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  Replace all data in this business
                </label>
                {replace && (
                  <Field label="Type REPLACE">
                    <input
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </Field>
                )}
              </details>
              <div className="actions">
                <button
                  className="primary"
                  disabled={
                    busy ||
                    (replace
                      ? confirm !== "REPLACE"
                      : plan.conflicts.some((c) => !choices[c.id]))
                  }
                  onClick={() =>
                    void run(async () => {
                      await applyPlan(db, plan, choices, replace);
                      setPlan(null);
                      notify(
                        "Import complete. " +
                          rows(await db.records.toArray(), "tx").length +
                          " transactions saved. Import finished safely.",
                      );
                    })
                  }
                >
                  Confirm Import
                </button>
                <button onClick={() => setPlan(null)}>Cancel preview</button>
              </div>
            </div>
          )}
        </Panel>
        <div>
          <Panel title="Export & backup">
            <p className="muted">Complete data for this business only.</p>
            <div className="stack">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    download(await exported(db), "BigBoss_Export");
                    notify("Full backup downloaded. Store it somewhere safe.");
                  })
                }
              >
                Export Full Backup
              </button>
              <Field label="Restore Full Backup">
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void run(() => preview(f, true));
                  }}
                />
              </Field>
              <p className="muted small">
                Restore a complete JSON backup. Review Changes and type REPLACE
                before confirming. A recovery copy is saved first.
              </p>
            </div>
            <p className="muted small">
              Send the JSON yourself by USB, email or WhatsApp. Clearing browser
              storage deletes local data; keep downloaded backups.
            </p>
          </Panel>
          <Panel title="Preserved transaction totals">
            <p>
              {rows(all, "tx").length} transactions ·{" "}
              {rows(all, "staff").length} barbers
            </p>
            <details>
              <summary>Show five recorded totals</summary>
              <Table heads={["Original field", "CAD"]}>
                {Object.entries(totals).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{M(v)}</td>
                  </tr>
                ))}
              </Table>
            </details>
          </Panel>
          <Panel title="Recovery backups">
            <details>
              <summary>{backups.length} local recovery backups</summary>
              {backups.map((b) => (
                <div className="backup-row" key={b.id}>
                  <span>{new Date(b.created).toLocaleString()}</span>
                  <button
                    onClick={() => download(b.envelope, "BigBoss_Recovery")}
                  >
                    Download
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const p = await planImport(db, b.envelope);
                        setPlan(p);
                        setChoices({});
                        setReplace(true);
                        setConfirm("");
                        setFormat("Recovery backup");
                        setFilename("Saved recovery snapshot");
                      })
                    }
                  >
                    Preview restore
                  </button>
                </div>
              ))}
            </details>
          </Panel>
        </div>
      </div>
      <details className="panel advanced-migration">
        <summary>Advanced migration utilities</summary>
        <p className="muted">
          Only for recovery from the original application. For everyday backups
          use Import JSON or Restore Full Backup above.
        </p>{" "}
        <details>
          <summary>Restore original backup text</summary>
          <Field label="Original backup text">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={4}
            />
          </Field>
          <button
            disabled={busy || !paste}
            onClick={() =>
              void run(() =>
                preview(
                  new File([paste], "original-backup.json", {
                    type: "application/json",
                  }),
                ),
              )
            }
          >
            Preview backup text
          </button>
        </details>
        <details>
          <summary>Import original Excel workbook</summary>
          <Field label="Original Excel workbook">
            <input
              type="file"
              accept=".xlsx,.xlsm"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void run(() => preview(f));
              }}
            />
          </Field>
          <p className="muted small">
            Monthly ledger sheets and Journal, matching the original
            application. Check your opening balance in Settings after import.
          </p>
        </details>
      </details>
    </>
  );
}
