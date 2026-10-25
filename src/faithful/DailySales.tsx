import { useState } from "react";
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
} from "./model";
import { Field, Table, Panel, Confirm, Common } from "./ui";
export function Daily({ db, all, run, notify, busy }: Common) {
  const [date, setDate] = useState(today()),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [card, setCard] = useState("0"),
    [notes, setNotes] = useState("");
  const staff = rows(all, "staff").filter(
    (s) => s.value.active || !!draft[s.id],
  );
  const days = rows(all, "day").sort((a, b) =>
    b.value.date.localeCompare(a.value.date),
  );
  const saved = editing
    ? days.find((d) => d.id === editing)
    : days.find((d) => d.value.date === date);
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
    setCard(e ? I(e.value.card) : "0");
    setNotes(e?.value.notes ?? "");
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
        staff.map((s) => [s.id, saved?.value.rates[s.id] ?? s.value.rate]),
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
              const sales = Object.fromEntries(
                staff.map((s) => [s.id, P(draft[s.id] || "0")]),
              );
              const d: Day = {
                date,
                sales,
                rates: Object.fromEntries(
                  staff.map((s) => [
                    s.id,
                    saved?.value.rates[s.id] ?? s.value.rate,
                  ]),
                ),
                product: P(draft.product || "0"),
                total,
                card: P(card || "0"),
                deposit: saved?.value.deposit ?? 0,
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
                if (editing) setDate(e.target.value);
                else load(e.target.value);
              }}
            />
          </Field>
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
                            [s.id]: saved?.value.rates[s.id] ?? s.value.rate,
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
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button className="primary" disabled={busy || !valid}>
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
