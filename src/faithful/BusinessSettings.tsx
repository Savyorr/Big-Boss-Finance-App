import { useState } from "react";
import {
  profiles,
  removeBusiness,
  exported,
  download,
  write,
  revised,
  Profile,
} from "./store";
import { rows, settings, moneyInput as I, parseMoney as P } from "./model";
import { Field, Money, Table, Panel, text, cents, Common } from "./ui";
export function BusinessSettings({
  db,
  all,
  run,
  notify,
  busy,
  profile,
  exit,
}: Common & { profile: Profile; exit: () => void }) {
  const s = settings(all),
    [removeOpen, setRemoveOpen] = useState(false),
    [backedUp, setBackedUp] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [balances, setBalances] = useState(
      s.balances.map((b) => ({ name: b.name, amount: I(b.amount) })),
    );
  return (
    <>
      <Panel title="Business settings">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              const name = text(f, "name"),
                old = rows(all, "settings")[0];
              await write(
                db,
                revised(
                  "settings",
                  old.id,
                  {
                    ...s,
                    name,
                    opening: cents(f, "opening"),
                    openingKnown: f.get("openingKnown") === "on",
                    asOf: text(f, "asOf"),
                    limit: cents(f, "limit"),
                    balances: balances.map((b) => ({
                      name: b.name.trim(),
                      amount: P(b.amount),
                    })),
                  },
                  old,
                ),
              );
              await profiles.put({ ...profile, name });
              notify("Settings saved");
            });
          }}
        >
          <div className="form-grid">
            <Field label="Business name">
              <input
                name="name"
                defaultValue={s.name}
                required
                maxLength={100}
              />
            </Field>
            <Money
              label="Chequing opening balance"
              name="opening"
              signed
              value={I(s.opening)}
            />
            <Field label="Statement balances as of">
              <input name="asOf" type="date" required defaultValue={s.asOf} />
            </Field>
            <Money
              label="Operating Line credit limit"
              name="limit"
              value={I(s.limit)}
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              name="openingKnown"
              defaultChecked={s.openingKnown}
            />
            Opening balance is known
          </label>
          <p className="muted small">
            Chequing opening balance is the starting amount before all saved
            days and transactions. Statement balances below stay as entered;
            Operating Line updates with later Loan Credit and Loan Payment
            transfers.
          </p>
          <Table heads={["Account name", "Statement balance", "Actions"]}>
            {balances.map((b, i) => (
              <tr key={i}>
                <td>
                  <input
                    aria-label={"Account name " + (i + 1)}
                    value={b.name}
                    onChange={(e) =>
                      setBalances(
                        balances.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                    required
                  />
                </td>
                <td>
                  <input
                    aria-label={"Statement balance " + (i + 1)}
                    type="number"
                    step="0.01"
                    value={b.amount}
                    onChange={(e) =>
                      setBalances(
                        balances.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value } : x,
                        ),
                      )
                    }
                    required
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      setBalances(balances.filter((_, j) => j !== i))
                    }
                  >
                    Remove row
                  </button>
                </td>
              </tr>
            ))}
          </Table>
          <div className="actions">
            <button
              type="button"
              onClick={() =>
                setBalances([...balances, { name: "", amount: "0.00" }])
              }
            >
              Add account balance
            </button>
            <button className="primary" disabled={busy}>
              Save settings
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Remove this business">
        <p>
          Download a complete backup before removing a profile. Other businesses
          are unaffected.
        </p>
        <button
          className="danger"
          onClick={() => {
            setRemoveOpen(true);
            setBackedUp(false);
            setConfirmation("");
          }}
        >
          Remove Business
        </button>
      </Panel>
      {removeOpen && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Remove business"
          >
            <h2>Remove {s.name}?</h2>
            <p>
              This deletes this profile’s local records and recovery backups.
              Other businesses stay unchanged.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  download(await exported(db));
                  setBackedUp(true);
                })
              }
            >
              Download backup before removal
            </button>
            <Field label="Type business name to remove">
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <div className="actions">
              <button onClick={() => setRemoveOpen(false)}>Cancel</button>
              <button
                className="danger"
                disabled={busy || !backedUp || confirmation !== s.name}
                onClick={() =>
                  void run(async () => {
                    db.close();
                    await removeBusiness(profile);
                    exit();
                  })
                }
              >
                Permanently remove business
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
