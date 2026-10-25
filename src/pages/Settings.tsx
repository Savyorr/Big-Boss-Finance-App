import { LocationSelector } from "../components/layout/ShopSelector";
import { FinancialPreferencesForm } from "../components/forms/FinancialPreferences";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  Store,
  Pencil,
  Archive,
  RotateCcw,
  Monitor,
  Sun,
  Moon,
  HardDrive,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../app/context";
import { db } from "../database/db";
import { repository } from "../database/repository";
import type { Shop } from "../models";
import { ProfileForm } from "../components/forms/ProfileForms";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import {
  PageHeader,
  Panel,
  Field,
  EmptyState,
  ErrorMessage,
  StageNotice,
} from "../components/ui/shared";
export function SettingsPage() {
  const { shops, theme, setTheme, dateFormat, setDateFormat } = useApp();
  const [editing, setEditing] = useState<Shop | "new" | null>(null);
  const [confirm, setConfirm] = useState<Shop | null>(null);
  const [error, setError] = useState("");
  const [storage, setStorage] = useState("");
  const [busy, setBusy] = useState(false);
  const count = useLiveQuery(() => db.shops.count(), []);
  const savePreference = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      setError("Could not save preference. Check available local storage.");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Settings"
        description="Make this workspace work for your business."
      />
      {error && <ErrorMessage message={error} />}
      <details className="legacy-location-controls">
        <summary>Advanced: saved locations in this profile</summary>
        <p>
          Separate businesses should use Switch profile. These controls preserve
          support for older backups that contain multiple locations within one
          business.
        </p>
        <LocationSelector />
        <Button onClick={() => setEditing("new")}>Add shop</Button>
      </details>
      <Panel
        title="Business details"
        subtitle="This profile has its own local financial database. Use Switch profile to open a different business."
      >
        {shops.length === 0 ? (
          <EmptyState
            title="Every business starts somewhere"
            description="Create your first shop to set up your local workspace."
            action={
              <Button variant="outline" onClick={() => setEditing("new")}>
                Create your first shop
              </Button>
            }
          />
        ) : (
          <div className="shop-grid">
            {shops.map((shop) => (
              <article className="shop-card" key={shop.id}>
                <span className="shop-card-icon">
                  <Store size={22} />
                </span>
                <div className="shop-card-info">
                  <h3>{shop.name}</h3>
                  <p>{shop.address || "No address added"}</p>
                  {shop.contact && <p>{shop.contact}</p>}
                  <span
                    className={`badge ${shop.status === "active" ? "badge-green" : ""}`}
                  >
                    {shop.status}
                  </span>
                </div>
                <div className="row-actions">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${shop.name}`}
                    onClick={() => setEditing(shop)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${shop.status === "active" ? "Archive" : "Restore"} ${shop.name}`}
                    onClick={() => setConfirm(shop)}
                  >
                    {shop.status === "active" ? (
                      <Archive size={16} />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      <div className="two-columns">
        <Panel title="General" subtitle="Personalize your everyday view.">
          <div className="form-stack">
            <Field label="Application name">
              <input value="Big Boss Finance" readOnly />
            </Field>
            <Field label="Currency">
              <input value="CAD · Canadian Dollar" readOnly />
            </Field>
            <Field label="Date formatting">
              <select
                value={dateFormat}
                onChange={(e) =>
                  savePreference(() => setDateFormat(e.target.value))
                }
              >
                <option value="en-CA">Canadian (2026-10-24)</option>
                <option value="en-GB">Day / month / year</option>
                <option value="en-US">Month / day / year</option>
              </select>
            </Field>
            <Field label="Appearance">
              <div className="segmented">
                {[
                  ["light", Sun],
                  ["dark", Moon],
                ].map(([value, Icon]) => {
                  const I = Icon as typeof Monitor;
                  return (
                    <button
                      type="button"
                      key={String(value)}
                      className={theme === value ? "selected" : ""}
                      onClick={() =>
                        savePreference(() => setTheme(String(value)))
                      }
                    >
                      <I size={16} />
                      {String(value)}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </Panel>
        <Panel
          title="Local data"
          subtitle="Private storage, right on this device."
        >
          <div className="storage-status">
            <HardDrive size={30} />
            <div>
              <strong>IndexedDB available</strong>
              <p>
                {count ?? "…"} shop profiles · Schema version {db.verno}
              </p>
            </div>
            <span className="status-dot" />
          </div>
          <div className="notice">
            <ShieldCheck size={19} />
            <span>
              Clearing browser data can permanently remove your records. Browser
              storage is not a long-term backup.
            </span>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              if (!navigator.storage?.estimate) {
                setStorage(
                  "Storage estimates are unavailable in this browser.",
                );
                return;
              }
              try {
                const s = await navigator.storage.estimate();
                setStorage(
                  `${((s.usage ?? 0) / 1024 / 1024).toFixed(2)} MB used of approximately ${((s.quota ?? 0) / 1024 / 1024).toFixed(0)} MB available for this origin.`,
                );
              } catch {
                setStorage("Could not estimate storage.");
              }
            }}
          >
            Check storage usage
          </Button>
          {storage && (
            <p className="muted small" role="status">
              {storage}
            </p>
          )}
          <p className="muted small">
            No automatic cloud synchronization. No database reset controls.
          </p>
        </Panel>
      </div>
      <Panel
        title="Financial preferences"
        subtitle="Shop-specific defaults and reporting preferences."
      >
        <FinancialPreferencesForm />
      </Panel>
      {editing && (
        <ProfileForm
          kind="shop"
          record={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {confirm && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setConfirm(null);
          }}
          title={`${confirm.status === "active" ? "Archive" : "Restore"} ${confirm.name}?`}
          description={
            confirm.status === "active"
              ? "The shop will leave the active selector. Its profiles and historical records will be preserved."
              : "The shop will return to the active location selector."
          }
        >
          <div className="dialog-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await repository.setShopStatus(
                    confirm.id,
                    confirm.status === "active" ? "archived" : "active",
                    confirm.revision,
                  );
                  setConfirm(null);
                } catch (e) {
                  setError((e as Error).message);
                  setConfirm(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
