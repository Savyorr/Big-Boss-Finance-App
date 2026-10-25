import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Store, Plus } from "lucide-react";
import {
  listBusinessProfiles,
  createBusinessProfile,
  openBusinessProfile,
  selectedDatabase,
  type BusinessProfile,
} from "../services/business-profiles";
import { Button } from "../components/ui/button";
import { ErrorMessage, Field } from "../components/ui/shared";
export function BusinessProfileGate({ children }: { children: ReactNode }) {
  const [selected] = useState(selectedDatabase);
  const [profiles, setProfiles] = useState<BusinessProfile[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!selected)
      listBusinessProfiles()
        .then(setProfiles)
        .catch(() =>
          setError(
            "Could not read your business profiles. Allow local browser storage; do not clear existing data.",
          ),
        );
  }, [selected]);
  if (selected) return children;
  async function create(e: FormEvent, empty = false) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = await createBusinessProfile(name, empty);
      openBusinessProfile(profile.database, empty ? "/data" : "/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create profile.");
      setBusy(false);
      listBusinessProfiles()
        .then(setProfiles)
        .catch(() => {});
    }
  }
  return (
    <main className="business-profile-home">
      <div className="business-profile-heading">
        <Store size={32} />
        <p className="eyebrow">BIG BOSS FINANCE</p>
        <h1>Choose your business</h1>
        <p>
          Each profile has its own sales, barbers, accounts, imports and
          backups.
        </p>
      </div>
      {error && <ErrorMessage message={error} />}
      {!profiles && !error && <p role="status">Reading your saved profiles…</p>}
      <div className="business-profile-grid">
        {profiles?.map((p) => (
          <button
            key={p.database}
            className="business-profile-card"
            onClick={() => {
              try {
                openBusinessProfile(p.database);
              } catch {
                setError(
                  "Browser session storage is unavailable. Allow local storage and try again.",
                );
              }
            }}
          >
            <Store size={24} />
            <strong>{p.name}</strong>
            <span>Open business profile</span>
            {p.shops > 1 && (
              <small>
                Existing workspace · {p.shops} saved locations preserved
              </small>
            )}
          </button>
        ))}
      </div>
      <section className="panel business-profile-create">
        <h2>
          <Plus size={20} /> Create a separate business profile
        </h2>
        <p>Start a new, empty business. Your other profiles stay unchanged.</p>
        <form className="form-stack" onSubmit={(e) => create(e)}>
          <Field label="Business name">
            <input
              autoComplete="organization"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Big Boss"
            />
          </Field>
          <Button disabled={busy || !profiles} type="submit">
            {busy ? "Creating profile…" : "Create business profile"}
          </Button>
          <details>
            <summary>Restore a full app backup instead</summary>
            <p>
              For a modern full backup containing business profiles, create an
              empty destination, then review and restore the file. For the
              original transaction-only JSON, use Create business profile above.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !profiles || !name.trim()}
              onClick={(e) => create(e, true)}
            >
              Create empty profile for full backup
            </Button>
          </details>
        </form>
      </section>
      <p className="muted">
        Profiles are separate local workspaces on this browser. They are not
        online logins or password protection. Keep downloaded backups for each
        business.
      </p>
    </main>
  );
}
