import { useState } from "react";
import { write, revised, remove } from "./store";
import {
  Of,
  rows,
  settings,
  commissionIncomplete,
  rateForDate,
  today,
  formatMoney as M,
  moneyInput as I,
  parseMoney as P,
  addCents as sum,
  earned,
  period,
  periodEnd,
  periodLabel,
} from "./model";
import { Field, Money, Table, Panel, Confirm, text, cents, Common } from "./ui";
import { TransactionForm } from "./TransactionForm";
export function Commissions({ db, all, run, notify, busy }: Common) {
  const staff = rows(all, "staff"),
    [tab, setTab] = useState("Summary"),
    [through, setThrough] = useState(() => {
      const payments = rows(all, "tx")
        .filter(
          (t) => t.value.category === "Contract Labour" && t.value.expense > 0,
        )
        .map((t) => periodEnd(period(t.value.date, true)))
        .sort();
      return payments.at(-1) ?? today();
    }),
    [editingStaff, setEditingStaff] = useState<Of<"staff"> | "new" | null>(
      null,
    ),
    [payment, setPayment] = useState<Of<"tx"> | { payee: string } | null>(null),
    [adj, setAdj] = useState<
      | Of<"adjustment">
      | { staffId: string; amount: number; date: string; notes: string }
      | null
    >(null),
    [deleting, setDeleting] = useState<Of<"adjustment"> | null>(null);
  const days = rows(all, "day")
      .filter((d) => d.value.date <= through)
      .map((d) => d.value),
    payments = rows(all, "tx").filter(
      (t) =>
        t.value.category === "Contract Labour" &&
        periodEnd(period(t.value.date, true)) <= through,
    ),
    adjustments = rows(all, "adjustment").filter(
      (a) => periodEnd(period(a.value.date, true)) <= through,
    );
  const incomplete = commissionIncomplete(all, through);
  const periods = [
    ...new Set([
      ...days.map((d) => period(d.date)),
      ...payments.map((t) => period(t.value.date, true)),
      ...adjustments.map((a) => period(a.value.date, true)),
    ]),
  ]
    .sort()
    .reverse();
  return (
    <>
      <div className="tabs" role="group" aria-label="Commission views">
        {["Summary", "Payments", "Adjustments", "Barbers"].map((t) => (
          <button
            key={t}
            className={t === tab ? "primary" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Barbers" ? (
        <Panel title="Barbers">
          <button className="primary" onClick={() => setEditingStaff("new")}>
            Add barber
          </button>
          {editingStaff && (
            <form
              key={typeof editingStaff === "string" ? "new" : editingStaff.id}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const old = editingStaff === "new" ? undefined : editingStaff,
                    name = text(f, "name");
                  if (
                    staff.some(
                      (s) =>
                        s.id !== old?.id &&
                        s.value.name.toLowerCase() === name.toLowerCase(),
                    )
                  )
                    throw Error("A barber with that name already exists");
                  if (name.toLowerCase() === "sale product")
                    throw Error(
                      "Sale Product belongs in Daily Sales, not the barber roster",
                    );
                  await write(
                    db,
                    revised(
                      "staff",
                      old?.id ?? crypto.randomUUID(),
                      {
                        name,
                        originalName: old?.value.originalName,
                        order: old?.value.order ?? staff.length,
                        active: text(f, "active") === "true",
                        rate: P(text(f, "rate")),
                        rateHistory: [
                          ...(old?.value.rateHistory ?? []),
                          ...(old && old.value.rate !== P(text(f, "rate"))
                            ? [
                                {
                                  effectiveDate: text(f, "effectiveDate"),
                                  from: rateForDate(
                                    old.value,
                                    text(f, "effectiveDate"),
                                  ),
                                  to: P(text(f, "rate")),
                                  changedAt: new Date().toISOString(),
                                },
                              ]
                            : []),
                        ],
                        ...(old?.value.raw ? { raw: old.value.raw } : {}),
                      },
                      old,
                    ),
                  );
                  setEditingStaff(null);
                  notify("Barber saved");
                });
              }}
            >
              <div className="form-grid">
                <Field label="Barber name">
                  <input
                    name="name"
                    defaultValue={
                      editingStaff === "new" ? "" : editingStaff.value.name
                    }
                    required
                    maxLength={100}
                  />
                </Field>
                <Money
                  label="Commission percent"
                  name="rate"
                  value={
                    editingStaff === "new" ? "50" : I(editingStaff.value.rate)
                  }
                />
                <Field label="Rate effective from">
                  <input
                    name="effectiveDate"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </Field>
                <Field label="Status">
                  <select
                    name="active"
                    defaultValue={
                      editingStaff === "new"
                        ? "true"
                        : String(editingStaff.value.active)
                    }
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </Field>
              </div>
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Save barber
                </button>
                <button type="button" onClick={() => setEditingStaff(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          <Table heads={["Barber", "Commission", "Status", "Actions"]}>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.value.name}</td>
                <td>{I(s.value.rate)}%</td>
                <td>{s.value.active ? "Active" : "Inactive"}</td>
                <td>
                  <button
                    aria-label={"Edit barber " + s.value.name}
                    onClick={() => setEditingStaff(s)}
                  >
                    Edit
                  </button>
                  <button
                    aria-label={"Pay " + s.value.name}
                    onClick={() => setPayment({ payee: s.value.name })}
                  >
                    Payment
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      ) : (
        <>
          <div className="actions">
            <Field label="Through date">
              <input
                type="date"
                value={through}
                onChange={(e) => setThrough(e.target.value)}
                required
              />
            </Field>
            <button
              onClick={() => {
                const ds = rows(all, "tx")
                  .filter(
                    (t) =>
                      t.value.category === "Contract Labour" &&
                      t.value.expense > 0,
                  )
                  .map((t) => periodEnd(period(t.value.date, true)))
                  .sort();
                setThrough(ds.at(-1) ?? today());
              }}
            >
              Use latest payment period
            </button>
            <button
              className="primary"
              onClick={() => setPayment({ payee: "" })}
            >
              Add stylist payment
            </button>
          </div>
          {tab === "Summary" && (
            <>
              <Panel title="Stylist commissions">
                {incomplete && (
                  <p className="muted small">
                    The original transaction backup includes recorded payments,
                    but not the daily barber sales. Historical earnings and
                    differences are unavailable; service figures cover saved
                    daily sales only.
                  </p>
                )}
                <Table
                  heads={[
                    "Stylist",
                    "Service revenue",
                    "Commission",
                    "Paid",
                    "Adjustments",
                    "Difference",
                  ]}
                >
                  {staff.map((s) => {
                    const paid = sum(
                        ...payments
                          .filter((t) => t.value.staffId === s.id)
                          .map((t) => t.value.expense),
                      ),
                      a = sum(
                        ...adjustments
                          .filter((x) => x.value.staffId === s.id)
                          .map((x) => x.value.amount),
                      ),
                      rev = sum(...days.map((d) => d.sales[s.id] ?? 0)),
                      e = earned(days, s.id);
                    return (
                      <tr key={s.id}>
                        <td>{s.value.name}</td>
                        <td>
                          {incomplete && !days.length ? "Unavailable" : M(rev)}
                        </td>
                        <td>
                          {incomplete && !days.length ? "Unavailable" : M(e)}
                        </td>
                        <td className="expense">{M(paid)}</td>
                        <td>{M(a)}</td>
                        <td>
                          {incomplete ? "Unavailable" : M(sum(e, -paid, -a))}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <p className="muted small">
                  Difference = commission − Contract Labour expenses −
                  adjustments. Positive adjustments count as settled; negative
                  adjustments remove an amount from paid.
                </p>
              </Panel>
              <Panel title="By pay period">
                <details>
                  <summary>View periods and corrections</summary>
                  <Table
                    heads={[
                      "Pay period",
                      "Stylist",
                      "Earned",
                      "Paid",
                      "Adjustments",
                      "Difference",
                      "Actions",
                    ]}
                  >
                    {periods.flatMap((k) =>
                      staff.map((s) => {
                        const dd = days.filter((d) => period(d.date) === k),
                          pp = payments.filter(
                            (t) =>
                              t.value.staffId === s.id &&
                              period(t.value.date, true) === k,
                          ),
                          aa = adjustments.filter(
                            (a) =>
                              a.value.staffId === s.id &&
                              period(a.value.date, true) === k,
                          );
                        const e = earned(dd, s.id),
                          p = sum(...pp.map((t) => t.value.expense)),
                          a = sum(...aa.map((a) => a.value.amount)),
                          diff = sum(e, -p, -a);
                        if (!e && !p && !a) return null;
                        return (
                          <tr key={k + s.id}>
                            <td>{periodLabel(k)}</td>
                            <td>{s.value.name}</td>
                            <td>
                              {incomplete && !days.length
                                ? "Unavailable"
                                : M(e)}
                            </td>
                            <td>{M(p)}</td>
                            <td>{M(a)}</td>
                            <td>{incomplete ? "Unavailable" : M(diff)}</td>
                            <td>
                              {!incomplete && diff !== 0 && (
                                <button
                                  onClick={() =>
                                    setAdj({
                                      staffId: s.id,
                                      amount: diff,
                                      date:
                                        pp
                                          .map((t) => t.value.date)
                                          .sort()
                                          .at(-1) ?? through,
                                      notes: "Reconcile " + periodLabel(k),
                                    })
                                  }
                                >
                                  Fix with adjustment
                                </button>
                              )}
                              {pp.map((t) => (
                                <button
                                  key={t.id}
                                  aria-label={"Edit payment " + t.id}
                                  onClick={() => setPayment(t)}
                                >
                                  Edit {t.value.date}
                                </button>
                              ))}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </Table>
                </details>
              </Panel>
            </>
          )}
          {tab === "Payments" && (
            <Panel title="Recorded Contract Labour payments">
              <Table
                heads={[
                  "Date",
                  "Barber",
                  "Details",
                  "Recorded paid",
                  "Bank debit",
                  "Pay period",
                  "Actions",
                ]}
              >
                {payments
                  .sort((a, b) => b.value.date.localeCompare(a.value.date))
                  .map((t) => (
                    <tr key={t.id}>
                      <td>{t.value.date}</td>
                      <td>
                        {staff.find((s) => s.id === t.value.staffId)?.value
                          .name ?? t.value.payee}
                      </td>
                      <td>{t.value.details}</td>
                      <td>{M(t.value.expense)}</td>
                      <td>{M(t.value.bankDebit)}</td>
                      <td>{periodLabel(period(t.value.date, true))}</td>
                      <td>
                        <button
                          aria-label={"Edit payment " + t.id}
                          onClick={() => setPayment(t)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
              </Table>
              <p className="muted small">
                Recorded paid follows the original Contract Labour expense
                field; bank debits are shown separately and are not assumed to
                establish commission liability.
              </p>
            </Panel>
          )}
          {tab === "Adjustments" && (
            <Panel title="Adjustments">
              <button
                className="primary"
                disabled={!staff.length}
                onClick={() =>
                  setAdj({
                    staffId: staff[0]?.id ?? "",
                    amount: 0,
                    date: through,
                    notes: "",
                  })
                }
              >
                Add adjustment
              </button>
              <Table heads={["Date", "Stylist", "Amount", "Note", "Actions"]}>
                {rows(all, "adjustment").map((a) => (
                  <tr key={a.id}>
                    <td>{a.value.date}</td>
                    <td>
                      {staff.find((s) => s.id === a.value.staffId)?.value.name}
                    </td>
                    <td>{M(a.value.amount)}</td>
                    <td>{a.value.notes}</td>
                    <td>
                      <button
                        aria-label={"Edit adjustment " + a.id}
                        onClick={() => setAdj(a)}
                      >
                        Edit
                      </button>
                      <button
                        className="danger"
                        aria-label={"Delete adjustment " + a.id}
                        onClick={() => setDeleting(a)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </Panel>
          )}
        </>
      )}
      {payment && (
        <div className="modal-backdrop">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-label="Stylist payment"
          >
            <h2>Stylist payment</h2>
            <TransactionForm
              key={"id" in payment ? payment.id : payment.payee}
              all={all}
              old={"id" in payment ? payment : undefined}
              preset={{
                category: "Contract Labour",
                payee: "id" in payment ? payment.value.payee : payment.payee,
              }}
              busy={busy}
              onCancel={() => setPayment(null)}
              onSave={(v) =>
                run(async () => {
                  const old = "id" in payment ? payment : undefined;
                  await write(
                    db,
                    revised("tx", old?.id ?? crypto.randomUUID(), v, old),
                  );
                  setPayment(null);
                  notify("Payment saved");
                })
              }
            />
          </section>
        </div>
      )}
      {adj && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Commission adjustment"
          >
            <h2>Commission adjustment</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const amount = cents(f, "amount");
                  if (!amount) throw Error("Enter a nonzero adjustment");
                  const old = "id" in adj ? adj : undefined;
                  await write(
                    db,
                    revised(
                      "adjustment",
                      old?.id ?? crypto.randomUUID(),
                      {
                        date: text(f, "date"),
                        staffId: text(f, "staff"),
                        amount,
                        notes: text(f, "notes"),
                        ...(old?.value.raw ? { raw: old.value.raw } : {}),
                      },
                      old,
                    ),
                  );
                  setAdj(null);
                  notify("Adjustment saved");
                });
              }}
            >
              <Field label="Adjustment date">
                <input
                  name="date"
                  type="date"
                  defaultValue={"id" in adj ? adj.value.date : adj.date}
                  required
                />
              </Field>
              <Field label="Stylist">
                <select
                  name="staff"
                  defaultValue={"id" in adj ? adj.value.staffId : adj.staffId}
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.value.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Money
                label="Adjustment amount (+ or −)"
                name="amount"
                value={I("id" in adj ? adj.value.amount : adj.amount)}
                signed
              />
              <Field label="Adjustment note">
                <input
                  name="notes"
                  defaultValue={"id" in adj ? adj.value.notes : adj.notes}
                />
              </Field>
              <div className="actions">
                <button className="primary" disabled={busy}>
                  Save adjustment
                </button>
                <button type="button" onClick={() => setAdj(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {deleting && (
        <Confirm
          title="Delete adjustment?"
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            void run(async () => {
              await remove(db, deleting);
              setDeleting(null);
            })
          }
        >
          <p>
            {M(deleting.value.amount)} · {deleting.value.notes}
          </p>
        </Confirm>
      )}
    </>
  );
}
