import { useState, useMemo, useEffect } from "react";
import { write, revised, remove } from "./store";
import {
  Entity,
  Day,
  rows,
  today,
  formatMoney as M,
  moneyInput as I,
  parseMoney as P,
  addCents as sum,
  earned,
  dayCommission,
  revenueTransactions,
  rateForDate,
  settings,
} from "./model";
import { Field, Table, Panel, Confirm, Common } from "./ui";
export function Daily({ db, all, run, notify, busy }: Common) {
  const [date, setDate] = useState(today()),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [card, setCard] = useState("0"),
    [notes, setNotes] = useState(""),
    [tips, setTips] = useState(""),
    [deposit, setDeposit] = useState("0"),
    [confirmed, setConfirmed] = useState(false),
    [resolution, setResolution] = useState<"ledger" | "daily" | "both">(
      "ledger",
    );
  const staff = rows(all, "staff").filter(
    (s) => s.value.active || !!draft[s.id],
  );
  const days = rows(all, "day").sort((a, b) =>
    b.value.date.localeCompare(a.value.date),
  );
  const saved = editing
    ? days.find((d) => d.id === editing)
    : days.find((d) => d.value.date === date);
  const sources = useMemo(() => revenueTransactions(all, date), [all, date]),
    recorded = sum(...sources.map((e) => e.value.income));
  const needsConfirmation = sources.length > 0 || !!saved?.value.revenueLink;
  const sourceFingerprint = sources
    .map((t) => t.id + ":" + t.revision)
    .join("|");
  useEffect(() => setConfirmed(false), [sourceFingerprint]);
  const [deleting, setDeleting] = useState<Entity | null>(null);
  function load(d: string) {
    setDate(d);
    const e = days.find((x) => x.value.date === d);
    setEditing(e?.id ?? null);
    setDraft(
      e
        ? Object.fromEntries([
            ...Object.entries(e.value.sales).map(([id, n]) => [id, I(n)]),
            ["product", I(e.value.product)],
          ])
        : {},
    );
    setCard(
      e
        ? I(e.value.card)
        : I(sum(...revenueTransactions(all, d).map((t) => t.value.bankCredit))),
    );
    setNotes(e?.value.notes ?? "");
    setTips(e?.value.tips === undefined ? "" : I(e.value.tips));
    setDeposit(
      I(
        e?.value.deposit ??
          sum(...revenueTransactions(all, d).map((t) => t.value.bankDeposit)),
      ),
    );
    setConfirmed(false);
    setResolution(
      e?.value.revenueLink?.resolution ?? settings(all).overlaps[d] ?? "ledger",
    );
  }
  let total = 0,
    commission = 0,
    cash = 0,
    valid = true;
  try {
    const sales = Object.fromEntries(
      staff.map((s) => [s.id, P(draft[s.id] || "0")]),
    );
    total = sum(...Object.values(sales), P(draft.product || "0"));
    commission = dayCommission({
      sales,
      rates: Object.fromEntries(
        staff.map((s) => [
          s.id,
          saved?.value.rates[s.id] ?? rateForDate(s.value, date),
        ]),
      ),
    } as Day);
    cash = sum(total, -P(card || "0"));
  } catch {
    valid = false;
  }
  return (
    <>
      <Panel title="Daily sales entry">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!valid) throw Error("Check the sales amounts");
              if (needsConfirmation && !confirmed)
                throw Error(
                  "Confirm how this breakdown relates to the recorded income before saving.",
                );
              if (
                saved?.value.revenueLink &&
                !sources.length &&
                resolution !== "both"
              )
                throw Error(
                  "Linked income is no longer on this date. Confirm that this is a separate sale, or correct the source date first.",
                );
              const sales = Object.fromEntries(
                staff.map((s) => [s.id, P(draft[s.id] || "0")]),
              );
              const d: Day = {
                date,
                sales,
                rates: Object.fromEntries(
                  staff.map((s) => [
                    s.id,
                    saved?.value.rates[s.id] ?? rateForDate(s.value, date),
                  ]),
                ),
                product: P(draft.product || "0"),
                total,
                card: P(card || "0"),
                deposit: P(deposit || "0"),
                ...(tips !== "" ? { tips: P(tips) } : {}),
                ...(sources.length
                  ? {
                      revenueLink: {
                        sources: sources.map((t) => ({
                          id: t.id,
                          revision: t.revision,
                        })),
                        resolution,
                        recordedTotal: recorded,
                      },
                    }
                  : {}),
                notes,
                ...(saved?.value.raw ? { raw: saved.value.raw } : {}),
              };
              await write(
                db,
                revised("day", saved?.id ?? crypto.randomUUID(), d, saved),
              );
              notify("Saved " + date);
              const n = new Date(date + "T12:00:00");
              n.setDate(n.getDate() + 1);
              load(today(n));
            });
          }}
        >
          <Field label="Sales date">
            <input
              type="date"
              value={date}
              required
              onChange={(e) => {
                if (editing) {
                  setDate(e.target.value);
                  setConfirmed(false);
                } else load(e.target.value);
              }}
            />
          </Field>
          {needsConfirmation && (
            <section
              className="income-link"
              aria-label="Recorded income for this date"
            >
              <h3>Recorded income for {date}</h3>
              <p>
                Existing revenue:{" "}
                <strong className="income">{M(recorded)}</strong> ·{" "}
                {sources.length} source transaction(s)
              </p>
              <details>
                <summary>View matching revenue records</summary>
                {sources.map((t) => (
                  <p key={t.id}>
                    {t.value.date} · {t.value.payee} · {M(t.value.income)}
                    <small className="muted"> · ID {t.id}</small>
                  </p>
                ))}
              </details>
              <p>
                Entered barber and product breakdown: {M(total)} · Difference:{" "}
                <strong className={total === recorded ? "income" : "expense"}>
                  {M(sum(total, -recorded))}
                </strong>
              </p>
              {total !== recorded && (
                <p>
                  The breakdown does not match recorded income. Saving a linked
                  breakdown keeps original transaction amounts unchanged.
                </p>
              )}
              <Field label="How this sale relates to recorded income">
                <select
                  value={resolution}
                  onChange={(e) => {
                    setResolution(e.target.value as typeof resolution);
                    setConfirmed(false);
                  }}
                >
                  <option value="ledger">
                    Breakdown of existing revenue · count recorded income once
                  </option>
                  <option value="daily">
                    Use this corrected daily total in summaries · keep source
                    amounts
                  </option>
                  <option value="both">
                    Separate additional sale · add this daily total
                  </option>
                </select>
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm this revenue link and any difference shown above
              </label>
            </section>
          )}
          <Table heads={["Stylist / item", "Service revenue", "Commission"]}>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.value.name}
                  {!s.value.active ? " (inactive)" : ""}
                </td>
                <td>
                  <input
                    aria-label={"Revenue for " + s.value.name}
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft[s.id] ?? "0"}
                    onChange={(e) =>
                      setDraft({ ...draft, [s.id]: e.target.value })
                    }
                  />
                </td>
                <td>
                  {M(
                    earned(
                      [
                        {
                          sales: { [s.id]: valid ? P(draft[s.id] || "0") : 0 },
                          rates: {
                            [s.id]:
                              saved?.value.rates[s.id] ??
                              rateForDate(s.value, date),
                          },
                        } as Day,
                      ],
                      s.id,
                    ),
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td>Sale Product</td>
              <td>
                <input
                  aria-label="Product sales"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.product ?? "0"}
                  onChange={(e) =>
                    setDraft({ ...draft, product: e.target.value })
                  }
                />
              </td>
              <td>No commission</td>
            </tr>
            <tr className="total">
              <td>Total</td>
              <td>{M(total)}</td>
              <td>{M(commission)}</td>
            </tr>
          </Table>
          {!staff.length && <p>Add your barbers in Commissions → Barbers.</p>}
          <div className="form-grid">
            <Field label="Total revenue">
              <output>{M(total)}</output>
            </Field>
            <Field label="Debit machine / card receipts">
              <input
                type="number"
                min="0"
                step="0.01"
                value={card}
                onChange={(e) => setCard(e.target.value)}
              />
            </Field>
            <Field label="Cash received (calculated)">
              <output>{M(cash)}</output>
            </Field>
          </div>
          {cash < 0 && (
            <p className="small muted">
              Card receipts exceed revenue; negative cash is allowed, as in the
              original application.
            </p>
          )}
          {saved &&
            sum(...Object.values(saved.value.sales), saved.value.product) !==
              saved.value.total && (
              <p className="small">
                This saved total differs from its sales rows. Saving replaces it
                with the displayed row total.
              </p>
            )}
          <p className="muted small">
            Cash is the original calculation: daily revenue minus card receipts.
            A receipt difference is not automatically tips or additional
            revenue.
          </p>
          <details>
            <summary>Deposits and explicitly recorded tips</summary>
            <Field label="Recorded sales deposit">
              <input
                type="number"
                min="0"
                step="0.01"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </Field>
            <Field label="Explicitly recorded tips (optional)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={tips}
                onChange={(e) => setTips(e.target.value)}
              />
            </Field>
            <p className="small muted">
              Only enter a tip amount you know. Tips are separate from salon
              revenue and barber service commission.
            </p>
          </details>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button
              className="primary"
              disabled={busy || !valid || (needsConfirmation && !confirmed)}
            >
              {saved ? "Save changes" : "Save day"}
            </button>
            {editing && (
              <button type="button" onClick={() => load(today())}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </Panel>
      <Panel title="Recent days">
        <Table heads={["Date", "Revenue", "Card", "Cash", "Actions"]}>
          {days.slice(0, 30).map((d) => (
            <tr key={d.id}>
              <td>{d.value.date}</td>
              <td>{M(d.value.total)}</td>
              <td>{M(d.value.card)}</td>
              <td>{M(sum(d.value.total, -d.value.card))}</td>
              <td>
                <button
                  aria-label={"Edit day " + d.value.date}
                  onClick={() => {
                    load(d.value.date);
                    window.scrollTo(0, 0);
                  }}
                >
                  Edit
                </button>
                <button
                  className="danger"
                  aria-label={"Delete day " + d.value.date}
                  onClick={() => setDeleting(d)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!days.length && <p className="empty">No saved days yet.</p>}
      </Panel>
      {deleting && (
        <Confirm
          title="Delete saved day?"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void run(async () => {
              await remove(db, deleting);
              setDeleting(null);
              load(today());
              notify(
                "Day deleted. Deletion is preserved for JSON synchronization.",
              );
            })
          }
        >
          <p>
            The day will be removed from reports. Its deletion is kept for
            synchronization.
          </p>
        </Confirm>
      )}
    </>
  );
}
