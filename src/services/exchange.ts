import { ORIGINAL_LEGACY_APP } from "../config/original-business";
import { db, type FinanceDatabase } from "../database/db";
import {
  APP_ID,
  FORMAT_VERSION,
  collections,
  entityTables,
  emptyData,
  sortedData,
  sourceTotals,
  financialTotals,
  keyOf,
  type Collection,
  type DataSet,
  type Envelope,
  type Row,
} from "./exchange/schema";
import { canonical, digest, MAX_FILE_BYTES } from "./exchange/json";
import { prepareInWorker } from "./exchange/worker";
import {
  prepareDocument,
  type PrepareOptions,
  type PreparedDocument,
} from "./exchange/adapters";
import { validateData } from "./exchange/validate";
import { remapShops } from "./exchange/remap";
import {
  buildPlan,
  resolveCandidate,
  stateKey,
  type ImportPlan,
  type Resolutions,
} from "./exchange/plan";
export type { ImportPlan, Resolutions };
export interface PreviewOptions extends PrepareOptions {
  mode?: "merge" | "replace";
  mapping?: Record<string, string>;
  useWorker?: boolean;
}
export async function snapshot(database: FinanceDatabase): Promise<DataSet> {
  const data = emptyData();
  for (const table of collections) {
    if (table === "backupMetadata")
      data[table] = (await database.backups.toArray()).map(
        ({ payload, ...metadata }) => metadata,
      );
    else if (table === "settings")
      // The local chooser label is not business data and must not create restore/sync conflicts.
      data.settings = (await database.settings.toArray()).filter(
        (s) => s.key !== "businessProfileName",
      );
    else data[table] = await database.table(table).toArray();
  }
  return sortedData(data);
}
function envelope(
  data: DataSet,
  type: "shop" | "all" | "backup",
  shopIds: string[],
  requestedShopId?: string,
): Envelope {
  return {
    application: APP_ID,
    schemaVersion: FORMAT_VERSION,
    exportId: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    scope: { type, shopIds, ...(requestedShopId ? { requestedShopId } : {}) },
    data: sortedData(data),
  };
}
export function createExchangeService(database: FinanceDatabase) {
  const plans = new Map<string, ImportPlan>();
  async function exportData(
    scope: string | "all" = "all",
    type: "shop" | "all" | "backup" = scope === "all" ? "all" : "shop",
  ) {
    const all = await database.transaction("r", database.tables, () =>
      snapshot(database),
    );
    validateData(all);
    let selected = new Set(
      scope === "all" ? all.shops.map((s) => s.id) : [scope],
    );
    if (scope !== "all" && !all.shops.some((s) => s.id === scope))
      throw new Error("Select an existing shop.");
    // Preserve complete linked business events. Never produce a partial transfer or silently omit its other leg.
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const t of all.transactions) {
        const owners = new Set([
          t.shopId,
          ...(t.postings ?? []).map((p: Row) => p.shopId),
        ]);
        if ([...owners].some((id) => selected.has(id)))
          for (const id of owners)
            if (!selected.has(id)) {
              selected.add(id);
              expanded = true;
            }
      }
    }
    const ids = [...selected].sort();
    const data = emptyData();
    for (const table of collections) {
      if (table === "shops")
        data[table] = all[table].filter((r) => selected.has(r.id));
      else if (["importHistory", "backupMetadata"].includes(table))
        data[table] = all[table].filter((r) =>
          (r.shopIds ?? []).every((id: string) => selected.has(id)),
        );
      else if (table === "settings")
        data[table] = all.settings.filter((r) =>
          r.shopId ? selected.has(r.shopId) : scope === "all",
        );
      else data[table] = all[table].filter((r) => selected.has(r.shopId));
    }
    validateData(data);
    return envelope(data, type, ids, scope === "all" ? undefined : scope);
  }
  async function createBackup(reason = "Manual backup") {
    const content = await exportData("all", "backup");
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      reason,
      schemaVersion: FORMAT_VERSION,
      shopIds: content.scope.shopIds,
      payload: content,
    };
    await database.backups.add(record);
    return record;
  }
  async function previewText(
    text: string,
    options: PreviewOptions = {},
  ): Promise<ImportPlan> {
    const parsed =
      options.useWorker === false
        ? await prepareDocument(text, options)
        : await prepareInWorker(text, options);
    if (
      options.mode === "replace" &&
      parsed.format === "legacy-transactions" &&
      parsed.data.sourceDocuments.some((d) => {
        try {
          return JSON.parse(d.rawText).app === ORIGINAL_LEGACY_APP;
        } catch {
          return false;
        }
      })
    )
      throw new Error(
        "Use Merge for the original transaction-only backup to preserve saved barbers and newer daily sales. Replacement is available for complete business backups.",
      );
    const baseline = await database.transaction("r", database.tables, () =>
      snapshot(database),
    );
    if (parsed.format !== "modern") {
      const target = baseline.shops.find((s) => s.id === options.targetShopId);
      if (!target || target.status !== "active")
        throw new Error(
          "Select an active target shop before previewing legacy records.",
        );
    } else {
      validateData(parsed.data);
      const actual = new Set(parsed.data.shops.map((s) => s.id));
      if (
        parsed.shopIds.length !== actual.size ||
        parsed.shopIds.some((id) => !actual.has(id))
      )
        throw new Error("Export shop scope does not match its data.");
    }
    parsed.filename = options.filename;
    const effectiveMapping = { ...(options.mapping ?? {}) };
    const ambiguousMappingIds: string[] = [];
    if (parsed.format === "modern")
      for (const sourceId of parsed.shopIds)
        if (!Object.hasOwn(effectiveMapping, sourceId)) {
          const targets = [
            ...new Set(
              baseline.sourceMappings
                .filter(
                  (m) =>
                    m.format === "modern" &&
                    m.entityType === "shops" &&
                    m.namespace === sourceId &&
                    m.originalId === sourceId &&
                    baseline.shops.some((s) => s.id === m.canonicalId),
                )
                .map((m) => m.canonicalId),
            ),
          ];
          if (targets.length === 1) effectiveMapping[sourceId] = targets[0];
          if (targets.length > 1) ambiguousMappingIds.push(sourceId);
        }
    const prepared = await remapShops(parsed, effectiveMapping, baseline);
    prepared.appliedMapping = effectiveMapping;
    prepared.ambiguousMappingIds = ambiguousMappingIds;
    if (ambiguousMappingIds.length)
      prepared.warnings.push(
        "Several prior target mappings exist. Explicitly select a destination for each ambiguous source shop, then preview again.",
      );
    const plan = buildPlan(prepared, baseline, options.mode ?? "merge");
    const candidate = plan.conflicts.length
      ? undefined
      : resolveCandidate(plan, {});
    if (candidate) validateData(candidate);
    plans.clear();
    plans.set(plan.token, plan);
    return plan;
  }
  async function apply(
    token: string,
    resolutions: Resolutions = {},
    confirmation: {
      confirmed: boolean;
      replaceText?: string;
      mappingConfirmed?: boolean;
    } = { confirmed: false },
  ) {
    const plan = plans.get(token);
    if (!plan) throw new Error("Preview expired. Preview the file again.");
    if (plan.prepared.ambiguousMappingIds?.length)
      throw new Error(
        "Choose an explicit destination for ambiguous shop mappings, then preview again.",
      );
    if (!confirmation.confirmed)
      throw new Error("Confirm the preview before importing.");
    if (plan.mode === "replace" && confirmation.replaceText !== "REPLACE")
      throw new Error(
        "Type REPLACE to confirm the displayed replacement scope.",
      );
    if (
      plan.prepared.warnings.some((w) =>
        w.startsWith("Explicit shop mapping"),
      ) &&
      !confirmation.mappingConfirmed
    )
      throw new Error("Explicitly confirm the shop mapping.");
    const candidate = resolveCandidate(plan, resolutions);
    validateData(candidate);
    const expectedTotals = sourceTotals(candidate);
    const expectedFinancial = financialTotals(candidate);
    const backupId = crypto.randomUUID();
    const now = new Date().toISOString();
    // Phase 1 commits a durable recovery point only if business data still matches the preview.
    // Phase 2 rechecks the same baseline under the write lock. An apply rollback cannot roll back recovery.
    await database.transaction("rw", database.tables, async () => {
      const current = await snapshot(database);
      if (stateKey(current) !== plan.baselineKey)
        throw new Error("Local records changed after preview. Preview again.");
      await database.backups.add({
        id: backupId,
        createdAt: now,
        reason: `Before ${plan.mode} import: ${plan.prepared.format}`,
        schemaVersion: FORMAT_VERSION,
        shopIds: current.shops.map((s) => s.id),
        payload: envelope(
          current,
          "backup",
          current.shops.map((s) => s.id),
        ),
      });
    });
    const touched = new Set(plan.changes.map((c) => `${c.table}:${c.id}`));
    const counts = { added: 0, updated: 0, skipped: 0, deleted: 0 };
    for (const table of entityTables) {
      const before = new Map(plan.baseline[table].map((r) => [r.id, r]));
      for (const row of candidate[table]) {
        const old = before.get(row.id);
        if (!old) counts.added++;
        else if (canonical(old) === canonical(row)) {
          if (touched.has(`${table}:${row.id}`)) counts.skipped++;
        } else if (row.deletedAt && !old.deletedAt) counts.deleted++;
        else counts.updated++;
      }
    }
    const history = {
      id: crypto.randomUUID(),
      filename:
        plan.prepared.filename ??
        (plan.prepared.format === "modern"
          ? "Modern JSON export"
          : "Legacy JSON backup"),
      importedAt: now,
      shopIds: plan.prepared.shopIds,
      added: counts.added,
      updated: counts.updated,
      skipped: counts.skipped,
      deleted: counts.deleted,
      conflicts: plan.conflicts.length,
      errors: [] as string[],
      warnings: plan.warnings,
      result: "applied" as const,
      backupId,
      recoveryBackupId: backupId,
      digest: plan.prepared.digest,
      format: plan.prepared.format,
      mode: plan.mode,
    };
    try {
      await database.transaction("rw", database.tables, async () => {
        if (stateKey(await snapshot(database)) !== plan.baselineKey)
          throw new Error(
            "Local records changed before apply. Preview again; recovery backup retained.",
          );
        for (const table of collections) {
          if (["backupMetadata", "importHistory"].includes(table)) continue;
          const before = new Map(
            plan.baseline[table].map((r) => [keyOf(table, r), r]),
          );
          const changed = candidate[table].filter(
            (r) => canonical(before.get(keyOf(table, r))) !== canonical(r),
          );
          if (changed.length) await database.table(table).bulkPut(changed);
        }
        // Imported metadata never overwrites an existing local recovery payload.
        for (const row of candidate.backupMetadata)
          if (!(await database.backups.get(row.id)))
            await database.backups.add(row as any);
        for (const row of candidate.importHistory)
          if (!(await database.importHistory.get(row.id)))
            await database.importHistory.add(row as any);
        const actual = await snapshot(database);
        if (
          canonical(sourceTotals(actual)) !== canonical(expectedTotals) ||
          canonical(financialTotals(actual)) !== canonical(expectedFinancial) ||
          stateKey(actual) !== stateKey(candidate)
        )
          throw new Error(
            "Post-import reconciliation failed. All business changes were rolled back.",
          );
        await database.importHistory.add(history);
      });
      plans.delete(token);
      return { ...history, expectedTotals, actualTotals: expectedTotals };
    } catch (error) {
      const rejected = {
        ...history,
        added: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        result: "rejected" as const,
        errors: [error instanceof Error ? error.message : "Write failed"],
      };
      await database.importHistory.add(rejected);
      throw new Error(
        `${rejected.errors[0]} Recovery backup is retained in Backup & Restore.`,
      );
    }
  }
  return {
    previewText,
    async preview(file: File, options: PreviewOptions = {}) {
      if (file.size > MAX_FILE_BYTES)
        throw new Error("File exceeds the 25 MB import limit.");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.arrayBuffer(),
        );
      } catch {
        throw new Error(
          "Choose a valid UTF-8 JSON file. No changes were made.",
        );
      }
      const plan = await previewText(text, {
        ...options,
        filename: file.name,
      });
      (plan.prepared as PreparedDocument & { filename?: string }).filename =
        file.name;
      return plan;
    },
    apply,
    exportData,
    createBackup,
    async restorePreview(backupId: string, options: PreviewOptions = {}) {
      const backup = await database.backups.get(backupId);
      if (!backup?.payload)
        throw new Error(
          "This entry is metadata only. Choose the original downloaded backup file.",
        );
      return previewText(JSON.stringify(backup.payload), {
        ...options,
        mode: "replace",
      });
    },
    getPlan: (token: string) => plans.get(token),
  };
}
export const exchangeService = createExchangeService(db);
export async function downloadEnvelope(content: Envelope, label: string) {
  const text = JSON.stringify(content, null, 2);
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error(
      "Export exceeds the 25 MB file limit. Export smaller independent shop scopes.",
    );
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BigBoss_${label}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  try {
    await db.settings.put({
      key: "lastExport",
      value: {
        exportId: content.exportId,
        exportedAt: content.exportedAt,
        shopIds: content.scope.shopIds,
      },
    });
    return { trackingSaved: true };
  } catch {
    return { trackingSaved: false };
  }
}
