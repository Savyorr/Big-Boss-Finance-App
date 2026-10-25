import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../database/db";
import { useApp } from "../../app/context";
import {
  ORIGINAL_LEGACY_APP,
  ORIGINAL_BARBERS,
} from "../../config/original-business";
import { Button } from "../ui/button";
import { ErrorMessage } from "../ui/shared";
import { Link } from "react-router-dom";
export function LegacyMigrationCard({
  showCompleted = false,
}: { showCompleted?: boolean } = {}) {
  const { scope } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = useLiveQuery(async () => {
    const docs =
      scope === "all"
        ? await db.sourceDocuments.toArray()
        : await db.sourceDocuments.where("shopId").equals(scope).toArray();
    const originalDocs = docs.filter((d) => {
      try {
        return (
          d.format === "legacy-transactions" &&
          JSON.parse(d.rawText).app === ORIGINAL_LEGACY_APP
        );
      } catch {
        return false;
      }
    });
    const targets = [...new Set(originalDocs.map((d) => String(d.shopId)))];
    const target =
      scope === "all" ? (targets.length === 1 ? targets[0] : null) : scope;
    if (!target) return null;
    if (
      !docs.some((d) => {
        try {
          return (
            d.format === "legacy-transactions" &&
            JSON.parse(d.rawText).app === ORIGINAL_LEGACY_APP
          );
        } catch {
          return false;
        }
      })
    )
      return null;
    try {
      return {
        value: await (
          await import("../../services/legacy-migration")
        ).legacyMigration.preview(target),
        error: "",
      };
    } catch (e) {
      return {
        value: null,
        error:
          e instanceof Error
            ? e.message
            : "Could not prepare legacy migration.",
      };
    }
  }, [scope]);
  if (!plan) return null;
  if (plan.error)
    return (
      <section className="notice">
        <ErrorMessage message={plan.error} />
      </section>
    );
  if (!plan.value?.changed)
    return showCompleted && plan.value ? (
      <p className="notice" role="status">
        {plan.value.created + plan.value.matched} original barbers ready ·{" "}
        {plan.value.identifiable} historical barber records linked.{" "}
        <Link to="/stylists">View barbers & history</Link>
      </p>
    ) : null;
  const prepared = plan.value;
  return (
    <section
      className="legacy-overview"
      aria-label="Complete original business migration"
    >
      <h2>Restore your original barbers</h2>
      <p>
        {ORIGINAL_BARBERS.join(" · ")}. Restore the original 50% service
        commission defaults and link {prepared.identifiable} historical barber
        records. Existing rates and financial amounts are preserved.
      </p>
      <p>
        Your imported transactions stay in place. Missing daily barber sales
        will not be invented.
      </p>
      {error && <ErrorMessage message={error} />}
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await (
              await import("../../services/legacy-migration")
            ).legacyMigration.complete(prepared.shopId, prepared);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Migration could not complete.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Completing migration…" : "Complete Legacy Migration"}
      </Button>{" "}
      <Link to="/stylists">Barbers & commission history</Link>
    </section>
  );
}
