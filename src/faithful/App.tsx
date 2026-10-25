import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { profiles, BusinessDB, createBusiness, Profile } from "./store";
import { settings } from "./model";
import { Field, Panel, text } from "./ui";
import {
  Crown,
  LayoutDashboard,
  CalendarDays,
  ArrowLeftRight,
  Users,
  FileText,
  Download,
  Settings as SettingsIcon,
  Sun,
  Moon,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { Dashboard } from "./Dashboard";
import { Daily } from "./DailySales";
import { Ledger } from "./Ledger";
import { Commissions } from "./Commissions";
import { Reports } from "./Reports";
import { DataPage } from "./DataBackup";
import { BusinessSettings } from "./BusinessSettings";
const sections = [
  ["Dashboard", LayoutDashboard],
  ["Daily Sales", CalendarDays],
  ["Expenses & Bank", ArrowLeftRight],
  ["Commissions", Users],
  ["Reports", FileText],
  ["Data & Backup", Download],
  ["Settings", SettingsIcon],
] as const;
export function App() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [page, setPage] = useState("Dashboard"),
    [theme, setTheme] = useState(
      () => localStorage.getItem("bigboss-faithful-theme") ?? "light",
    ),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const list = useLiveQuery(() => profiles.toArray(), []) ?? [];
  useEffect(() => {
    let dialog: HTMLElement | null = null,
      previous: HTMLElement | null = null;
    const focusables = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
            ),
          ).filter((e) => e.getClientRects().length)
        : [];
    const observer = new MutationObserver(() => {
      const next = document.querySelector<HTMLElement>('[role="dialog"]');
      if (next !== dialog) {
        if (next) {
          previous = document.activeElement as HTMLElement;
          dialog = next;
          focusables()[0]?.focus();
        } else {
          dialog = null;
          previous?.focus();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const key = (e: KeyboardEvent) => {
      if (!dialog) return;
      const items = focusables(),
        at = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Tab" && items.length) {
        if (e.shiftKey && at <= 0) {
          e.preventDefault();
          items.at(-1)!.focus();
        } else if (!e.shiftKey && (at === items.length - 1 || at < 0)) {
          e.preventDefault();
          items[0].focus();
        }
      }
      if (e.key === "Escape") {
        Array.from(dialog.querySelectorAll("button"))
          .find((b) => b.textContent?.trim() === "Cancel")
          ?.click();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("bigboss-faithful-theme", theme);
  }, [theme]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save. Your data has not been reset.",
      );
    } finally {
      setBusy(false);
    }
  }
  const select = (p: Profile | null) => {
    setProfile(p);
    setPage("Dashboard");
    setMessage("");
    setError("");
  };
  return (
    <div className="faithful-app" aria-busy={busy}>
      <div className="global-theme">
        <button
          aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      {!profile ? (
        <main className="chooser">
          <div className="brand">
            <Crown />
            <span>BIG BOSS FINANCE</span>
          </div>
          <h1>Choose a Business</h1>
          <p className="muted">
            Each business has its own sales, barbers, transactions and backups.
          </p>
          <div className="profile-grid">
            {list.map((p) => (
              <button
                className="profile-card"
                key={p.id}
                onClick={() => select(p)}
              >
                <Crown />
                <strong>{p.name}</strong>
                <span>Open business →</span>
              </button>
            ))}
          </div>
          <Panel title="Create New Business">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () =>
                  select(
                    await createBusiness(
                      text(f, "name"),
                      f.get("original") === "on",
                    ),
                  ),
                );
              }}
            >
              <Field label="Business name">
                <input
                  name="name"
                  placeholder="e.g. Big Boss Hair Salon"
                  required
                  maxLength={100}
                />
              </Field>
              <label className="check">
                <input type="checkbox" name="original" defaultChecked={false} />
                Original Big Boss Hair Salon — include its four barbers
              </label>
              <button className="primary" disabled={busy}>
                <Plus size={17} />
                Create Business
              </button>
            </form>
          </Panel>
          <p className="muted small">
            Local profiles on this device. No registration or cloud account
            required.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </main>
      ) : (
        <Workspace
          key={profile.id}
          profile={profile}
          page={page}
          setPage={(p) => {
            setPage(p);
            setMessage("");
            setError("");
            window.scrollTo(0, 0);
          }}
          exit={() => select(null)}
          run={run}
          message={message}
          setMessage={setMessage}
          error={error}
          busy={busy}
        />
      )}
    </div>
  );
}
type WorkProps = {
  profile: Profile;
  page: string;
  setPage: (p: string) => void;
  exit: () => void;
  run: (fn: () => Promise<void>) => Promise<void>;
  message: string;
  setMessage: (s: string) => void;
  error: string;
  busy: boolean;
};
function Workspace(p: WorkProps) {
  const [db] = useState(() => new BusinessDB(p.profile.id));
  useEffect(() => {
    void db.open().catch(() => {});
    return () => db.close();
  }, [db]);
  const all = useLiveQuery(() => db.records.toArray(), [db]);
  if (!all) return <p role="status">Opening your business…</p>;
  const s = settings(all);
  const common = { db, all, run: p.run, notify: p.setMessage, busy: p.busy };
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <Crown />
          <span>
            BIG BOSS
            <br />
            <small>F I N A N C E</small>
          </span>
        </div>
        <nav aria-label="Main navigation">
          {sections.map(([name, Icon]) => (
            <button
              key={name}
              className={p.page === name ? "active" : ""}
              onClick={() => p.setPage(name)}
            >
              <Icon size={19} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          Your business. Your device.
          <br />
          <small>Local & offline · v1.0</small>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>{s.name}</span>
          <button onClick={p.exit}>
            <ArrowLeft size={16} />
            Switch Business
          </button>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{s.name}</p>
              <h1>{p.page}</h1>
            </div>
          </div>
          {p.message && (
            <p role="status" className="success">
              {p.message}
            </p>
          )}
          {p.error && (
            <p role="alert" className="error">
              {p.error}
            </p>
          )}
          {p.page === "Dashboard" ? (
            <Dashboard all={all} />
          ) : p.page === "Daily Sales" ? (
            <Daily {...common} />
          ) : p.page === "Expenses & Bank" ? (
            <Ledger {...common} />
          ) : p.page === "Commissions" ? (
            <Commissions {...common} />
          ) : p.page === "Reports" ? (
            <Reports {...common} />
          ) : p.page === "Data & Backup" ? (
            <DataPage {...common} />
          ) : (
            <BusinessSettings {...common} profile={p.profile} exit={p.exit} />
          )}
        </main>
      </div>
    </>
  );
}
