import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../database/db";
import { useApp } from "../../app/context";
import {
  defaultFinancialPreferences,
  financialPreferencesSchema,
  saveFinancialPreferences,
} from "../../services/preferences";
import { moneyInput, parseMoney } from "../../calculations/money";
import { Button } from "../ui/button";
import { Field, ErrorMessage, LoadingState } from "../ui/shared";
import { messageOf } from "./FinancialShared";
export function FinancialPreferencesForm() {
  const { scope } = useApp();
  const result = useLiveQuery(async () => {
    const saved = await db.settings.get(`financial:${scope}`);
    return (
      financialPreferencesSchema.safeParse(saved?.value).data ??
      defaultFinancialPreferences
    );
  }, [scope]);
  if (scope === "all")
    return (
      <p className="notice">
        Select an individual shop to configure its independent financial
        preferences.
      </p>
    );
  if (!result) return <LoadingState />;
  return (
    <PreferencesFields
      key={`${scope}-${JSON.stringify(result)}`}
      shopId={scope}
      value={result}
    />
  );
}
function PreferencesFields({
  shopId,
  value,
}: {
  shopId: string;
  value: typeof defaultFinancialPreferences;
}) {
  const [rate, setRate] = useState(
    moneyInput(value.defaultCommissionBasisPoints),
  );
  const [month, setMonth] = useState(String(value.fiscalStartMonth));
  const [categories, setCategories] = useState(value.categories.join("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveFinancialPreferences(shopId, {
        defaultCommissionBasisPoints: parseMoney(rate),
        fiscalStartMonth: Number(month),
        categories: [
          ...new Set(
            categories
              .split("\n")
              .map((c) => c.trim())
              .filter(Boolean),
          ),
        ],
      });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={save}>
      {error && <ErrorMessage message={error} />}
      <div className="form-grid">
        <Field
          label="Default commission percentage"
          hint="Used for new stylist profiles, never applied retroactively."
        >
          <input
            required
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="Financial year starts">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => (
              <option value={i + 1} key={i}>
                {new Date(2026, i, 1).toLocaleDateString("en-CA", {
                  month: "long",
                })}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Custom categories (one per line)"
        hint="Existing transaction categories are preserved even if removed from these suggestions."
      >
        <textarea
          rows={4}
          value={categories}
          onChange={(e) => setCategories(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save financial preferences"}
      </Button>
      <p className="muted small">
        Reporting basis: commissions earned plus recorded operating expenses.
        Choose a reporting year to apply this shop's financial-year start month.
        All Locations uses calendar-year defaults; custom ranges can compare
        different financial years.
      </p>
    </form>
  );
}
