import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../database/db";
import { financialPreferencesSchema } from "../../services/preferences";
import { useState, useEffect, type FormEvent } from "react";
import { useApp } from "../../app/context";
import { repository } from "../../database/repository";
import {
  type Shop,
  type Stylist,
  type Account,
  accountTypes,
} from "../../models";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Field, MoneyInput, DateInput, ErrorMessage } from "../ui/shared";
import { parseMoney, moneyInput } from "../../calculations/money";
import { today } from "../../utils/dates";
function errorText(e: unknown) {
  if (e && typeof e === "object" && "issues" in e)
    return (e.issues as { message: string }[]).map((i) => i.message).join(". ");
  return e instanceof Error
    ? e.message
    : "Could not save changes. Please try again.";
}
export function ProfileForm({
  kind,
  record,
  onClose,
}: {
  kind: "shop" | "stylist" | "account";
  record?: Shop | Stylist | Account;
  onClose: () => void;
}) {
  const { scope, shops } = useApp();
  const [shopId, setShopId] = useState(
    record && "shopId" in record ? record.shopId : scope === "all" ? "" : scope,
  );
  const [commissionDirty, setCommissionDirty] = useState(false);
  const [effectiveDateDirty, setEffectiveDateDirty] = useState(false);
  const preferences = useLiveQuery(
    () => db.settings.get(`financial:${shopId}`),
    [shopId],
  );
  useEffect(() => {
    if (!record && !commissionDirty)
      setCommission(
        moneyInput(
          financialPreferencesSchema.safeParse(preferences?.value).data
            ?.defaultCommissionBasisPoints ?? 5000,
        ),
      );
  }, [record, commissionDirty, preferences]);
  const [name, setName] = useState(record?.name ?? "");
  const [address, setAddress] = useState(
    record && "address" in record ? record.address : "",
  );
  const [contact, setContact] = useState(
    record && "contact" in record ? record.contact : "",
  );
  const [commission, setCommission] = useState(
    record && "commissionBasisPoints" in record
      ? moneyInput(record.commissionBasisPoints)
      : "",
  );
  const [type, setType] = useState<Account["type"]>(
    record && "type" in record ? record.type : "Chequing",
  );
  const [balance, setBalance] = useState(
    record && "openingBalanceCents" in record
      ? moneyInput(record.openingBalanceCents)
      : "",
  );
  const [date, setDate] = useState(
    record && "openingDate" in record ? record.openingDate : today(),
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    record ? today() : "0001-01-01",
  );
  const [status, setStatus] = useState(
    record && "status" in record ? record.status : "active",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (kind === "shop") {
        if (record)
          await repository.editShop(
            record.id,
            { name, address, contact },
            record.revision,
          );
        else await repository.createShop({ name, address, contact });
      } else {
        if (!shopId) throw new Error("Choose an individual shop.");
        if (kind === "stylist")
          await repository.saveStylist(
            shopId,
            {
              name,
              commissionBasisPoints: parseMoney(commission),
              status: status === "inactive" ? "inactive" : "active",
            },
            record?.id,
            record?.revision,
            !record ||
              effectiveDateDirty ||
              ("commissionBasisPoints" in record &&
                parseMoney(commission) !== record.commissionBasisPoints)
              ? effectiveFrom
              : undefined,
          );
        else
          await repository.saveAccount(
            shopId,
            {
              name,
              type,
              openingBalanceCents: parseMoney(balance),
              openingDate: date,
              status: status === "archived" ? "archived" : "active",
            },
            record?.id,
            record?.revision,
          );
      }
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={`${record ? "Edit" : "Add"} ${kind}`}
      description={
        kind === "shop"
          ? "Create a separate workspace for a business location."
          : "This profile belongs to one location. Financial history stays with that shop."
      }
    >
      <form onSubmit={submit} className="form-stack">
        {error && <ErrorMessage message={error} />}
        <Field
          label={`${kind === "shop" ? "Shop" : kind === "stylist" ? "Stylist" : "Account"} name`}
        >
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              kind === "shop"
                ? "e.g. Big Boss · Downtown"
                : kind === "stylist"
                  ? "Full name"
                  : "e.g. Main chequing"
            }
          />
        </Field>
        {kind !== "shop" && (
          <Field
            label="Shop"
            hint={
              record
                ? "Shop ownership cannot be changed after creation."
                : "Select the location that owns this profile."
            }
          >
            <select
              required
              value={shopId}
              disabled={Boolean(record)}
              onChange={(e) => setShopId(e.target.value)}
            >
              <option value="">Select a shop</option>
              {shops
                .filter((s) => s.status === "active" || s.id === shopId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {kind === "shop" && (
          <>
            <Field label="Address (optional)">
              <input
                maxLength={300}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
            <Field label="Contact details (optional)">
              <input
                maxLength={200}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </Field>
          </>
        )}
        {kind === "stylist" && (
          <>
            <Field
              label="Commission percentage"
              hint="Effective rates apply to new entries by sale date. Saved earnings retain their snapshots."
            >
              <input
                required
                inputMode="decimal"
                placeholder="e.g. 50.00"
                value={commission}
                onChange={(e) => {
                  setCommissionDirty(true);
                  setCommission(e.target.value);
                }}
              />
            </Field>
            <Field label="Rate effective from">
              <DateInput
                value={effectiveFrom}
                onChange={(e) => {
                  setEffectiveDateDirty(true);
                  setEffectiveFrom(e.target.value);
                }}
              />
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </>
        )}
        {kind === "account" && (
          <>
            <Field label="Account type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Account["type"])}
              >
                {accountTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field
                label="Opening balance"
                hint={
                  type === "Credit Card" || type === "Operating Line of Credit"
                    ? "Use a negative amount for debt owed (for example, -1000.00). Do not estimate."
                    : type === "Other"
                      ? "Enter a known signed balance. Custom Other accounts are excluded from cash/bank totals."
                      : "Enter the actual known balance, not an estimate."
                }
              >
                <MoneyInput
                  required
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </Field>
              <Field label="Opening balance date">
                <DateInput
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          </>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? "Saving…" : `Save ${kind}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
