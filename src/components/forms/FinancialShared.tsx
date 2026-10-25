import { useApp } from "../../app/context";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../database/db";
import { financialPreferencesSchema } from "../../services/preferences";
import { useState } from "react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Field, DateInput, ErrorMessage } from "../ui/shared";
import { today, monthEnd } from "../../utils/dates";
export function messageOf(error: unknown) {
  if (error && typeof error === "object" && "issues" in error)
    return (error.issues as { message: string }[])
      .map((i) => i.message)
      .join(". ");
  return error instanceof Error
    ? error.message
    : "Could not save. Please try again.";
}
export function ConfirmDelete({
  title,
  onConfirm,
  onClose,
}: {
  title: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={title}
      description="This removes the record's effect on reports and balances. Its history and deletion information will be retained."
    >
      <p className="muted small">
        Linked postings and earnings will be updated together. This may
        invalidate a previous reconciliation.
      </p>
      {error && <ErrorMessage message={error} />}
      <div className="dialog-actions">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(messageOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Removing…" : "Confirm removal"}
        </Button>
      </div>
    </Dialog>
  );
}
export function useDateRange() {
  const date = today();
  return useState({
    from: `${date.slice(0, 4)}-01-01`,
    to: `${date.slice(0, 4)}-12-31`,
  });
}
export function DateRangeControls({
  range,
  onChange,
}: {
  range: { from: string; to: string };
  onChange: (range: { from: string; to: string }) => void;
}) {
  const { scope } = useApp();
  const preference = useLiveQuery(
    () => db.settings.get(`financial:${scope}`),
    [scope],
  );
  const fiscalMonth =
    financialPreferencesSchema.safeParse(preference?.value).data
      ?.fiscalStartMonth ?? 1;
  return (
    <div className="date-range-controls">
      <Field label="Reporting month">
        <input
          type="month"
          aria-label="Reporting month"
          onChange={(e) => {
            if (!/^\d{4}-\d{2}$/.test(e.target.value)) return;
            const m = e.target.value;
            onChange({
              from: `${m}-01`,
              to: monthEnd(m),
            });
          }}
        />
      </Field>
      <Field label="Financial year">
        <input
          type="number"
          min="1900"
          max="9999"
          placeholder="YYYY"
          onChange={(e) => {
            if (/^\d{4}$/.test(e.target.value)) {
              const year = Number(e.target.value),
                lastMonth = fiscalMonth === 1 ? 12 : fiscalMonth - 1,
                endYear = year + (fiscalMonth === 1 ? 0 : 1);
              if (endYear > 9999) return;
              onChange({
                from: `${year}-${String(fiscalMonth).padStart(2, "0")}-01`,
                to: monthEnd(
                  `${String(endYear).padStart(4, "0")}-${String(lastMonth).padStart(2, "0")}`,
                ),
              });
            }
          }}
        />
      </Field>
      <Field label="From">
        <DateInput
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
        />
      </Field>
      <Field label="To">
        <DateInput
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
        />
      </Field>
    </div>
  );
}
export const accountingBasis =
  "Operating view: sales and other recorded revenue, less recorded operating expenses and commissions earned. Commission payments settle earnings, not a second expense. Excludes unrecorded taxes, depreciation and other adjustments; this is not verified net profit.";
