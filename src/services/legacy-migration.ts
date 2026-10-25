import { db, type FinanceDatabase } from "../database/db";
import {
  ORIGINAL_BARBERS,
  ORIGINAL_COMMISSION_BASIS_POINTS,
  ORIGINAL_HTML_SHA256,
  ORIGINAL_LEGACY_APP,
  ROSTER_MIGRATION_VERSION,
} from "../config/original-business";
import { stableId, canonical } from "./exchange/json";
import { snapshot, createExchangeService } from "./exchange";
import { stateKey } from "./exchange/plan";
import {
  sourceTotals,
  collections,
  keyOf,
  type DataSet,
} from "./exchange/schema";
import { validateData } from "./exchange/validate";
import {
  stylistSchema,
  commissionRuleSchema,
  transactionSchema,
} from "../models";
import { newMeta } from "./finance";
import { historicalBarberEvidence } from "../calculations/historical-payments";
export function originalLegacyRows(data: DataSet, shopId: string) {
  const ids = new Set<string>();
  for (const doc of data.sourceDocuments.filter(
    (d) => d.shopId === shopId && d.format === "legacy-transactions",
  )) {
    let raw;
    try {
      raw = JSON.parse(doc.rawText);
    } catch {
      continue;
    }
    if (raw.app !== ORIGINAL_LEGACY_APP || !Array.isArray(raw.transactions))
      continue;
    const originals = new Set(
      raw.transactions.map((r: Record<string, unknown>) => String(r.id)),
    );
    for (const mapping of data.sourceMappings)
      if (
        mapping.shopId === shopId &&
        mapping.format === "legacy-transactions" &&
        mapping.namespace === doc.namespace &&
        mapping.entityType === "transactions" &&
        originals.has(mapping.originalId)
      )
        ids.add(mapping.canonicalId);
  }
  return data.transactions.filter(
    (t) => t.shopId === shopId && !t.deletedAt && ids.has(t.id),
  );
}
export async function prepareLegacyMigration(
  database: FinanceDatabase,
  shopId: string,
) {
  const baseline = await database.transaction("r", database.tables, () =>
    snapshot(database),
  );
  const shop = baseline.shops.find(
    (s) => s.id === shopId && !s.deletedAt && s.status === "active",
  );
  if (!shop)
    throw new Error(
      "Open the individual business before completing its migration.",
    );
  const original = originalLegacyRows(baseline, shopId);
  if (!original.length)
    throw new Error(
      "No original Big Boss transaction backup is saved in this business. Import it first.",
    );
  const data = structuredClone(baseline);
  const now = new Date().toISOString();
  let created = 0,
    matched = 0,
    linked = 0;
  const roster = new Map<string, string>();
  const appendRevision = (
    table: string,
    row: Record<string, any>,
    parents: string[],
  ) =>
    data.revisions.push({
      id: row.revision,
      shopId,
      entityType: table,
      entityId: row.id,
      parents,
      createdAt: row.updatedAt,
      payload: structuredClone(row),
    });
  for (const name of ORIGINAL_BARBERS) {
    const id = await stableId(`${ROSTER_MIGRATION_VERSION}|${shopId}|${name}`);
    const mappingId = `${ROSTER_MIGRATION_VERSION}:${shopId}:${name}`;
    const prior = data.sourceMappings.find((m) => m.id === mappingId);
    const candidates = data.stylists.filter(
      (s) =>
        s.shopId === shopId &&
        (s.id === prior?.canonicalId ||
          s.id === id ||
          s.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()),
    );
    if (candidates.length > 1)
      throw new Error(
        `More than one saved barber matches ${name}. Resolve the duplicate profiles before migration; nothing was changed.`,
      );
    let stylist = candidates[0];
    if (stylist?.deletedAt)
      throw new Error(
        `${name} was previously removed. Restore that profile explicitly before migration; it will not be silently recreated.`,
      );
    if (stylist) {
      matched++;
    } else {
      stylist = stylistSchema.parse({
        ...newMeta(),
        id,
        shopId,
        name,
        status: "active",
        commissionBasisPoints: ORIGINAL_COMMISSION_BASIS_POINTS,
        source: {
          format: ROSTER_MIGRATION_VERSION,
          originalId: name,
          raw: {
            name,
            historicalCommissionBasisPoints: ORIGINAL_COMMISSION_BASIS_POINTS,
            htmlSha256: ORIGINAL_HTML_SHA256,
          },
        },
      });
      data.stylists.push(stylist);
      appendRevision("stylists", stylist, []);
      created++;
    }
    roster.set(name, stylist.id);
    if (
      !data.commissionRules.some(
        (r) => r.shopId === shopId && r.stylistId === stylist.id,
      )
    ) {
      const rule = commissionRuleSchema.parse({
        ...newMeta(),
        id: await stableId(`${ROSTER_MIGRATION_VERSION}|rule|${stylist.id}`),
        shopId,
        stylistId: stylist.id,
        effectiveFrom: "0001-01-01",
        rateBasisPoints: stylist.commissionBasisPoints,
        basis: "eligible-service-revenue",
        rounding: "half-up",
        source: {
          format: ROSTER_MIGRATION_VERSION,
          originalId: name,
          raw: { htmlSha256: ORIGINAL_HTML_SHA256 },
        },
      });
      data.commissionRules.push(rule);
      appendRevision("commissionRules", rule, []);
    }
    if (!prior)
      data.sourceMappings.push({
        id: mappingId,
        shopId,
        format: ROSTER_MIGRATION_VERSION,
        namespace: ORIGINAL_HTML_SHA256,
        entityType: "stylists",
        originalId: name,
        canonicalId: stylist.id,
      });
  }
  let identifiable = 0,
    supported = 0,
    review = 0;
  for (const originalRow of original) {
    const raw = originalRow.source?.raw;
    if (
      String(raw?.category ?? originalRow.category).trim() !== "Contract Labour"
    )
      continue;
    const name = String(raw?.payee ?? originalRow.payee).trim();
    const expectedName = ORIGINAL_BARBERS.find(
      (n) => n.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!expectedName) continue;
    const stylistId = roster.get(expectedName)!;
    identifiable++;
    if (originalRow.stylistId && originalRow.stylistId !== stylistId)
      throw new Error(
        "A historical record is already linked to a different barber. Review the association before completing migration.",
      );
    if (!originalRow.stylistId) {
      const row = transactionSchema.parse({
        ...originalRow,
        stylistId,
        parentRevision: originalRow.revision,
        revision: crypto.randomUUID(),
        revisionNumber: (originalRow.revisionNumber ?? 1) + 1,
        updatedAt: now,
      });
      data.transactions[data.transactions.findIndex((t) => t.id === row.id)] =
        row;
      appendRevision("transactions", row, [originalRow.revision]);
      linked++;
    }
    const evidence = historicalBarberEvidence(
      transactionSchema.parse(originalRow),
    );
    if (evidence && !evidence.needsReview) supported++;
    else review++;
  }
  validateData(data);
  if (
    canonical(sourceTotals(data)) !== canonical(sourceTotals(baseline)) ||
    data.transactions.length !== baseline.transactions.length
  )
    throw new Error(
      "Migration integrity check failed. No source amounts or transactions may change.",
    );
  return {
    baseline,
    data,
    baselineKey: stateKey(baseline),
    shopId,
    created,
    matched,
    linked,
    identifiable,
    supported,
    review,
    originalCount: original.length,
    changed: stateKey(data) !== stateKey(baseline),
  };
}
export async function completeLegacyMigration(
  database: FinanceDatabase,
  shopId: string,
  prepared?: Awaited<ReturnType<typeof prepareLegacyMigration>>,
) {
  const plan = prepared ?? (await prepareLegacyMigration(database, shopId));
  if (plan.shopId !== shopId)
    throw new Error("Migration preview belongs to another business.");
  if (!plan.changed) return { ...plan, backupId: undefined };
  // Recovery commits separately, so a failed migration cannot roll it back.
  const backup = await createExchangeService(database).createBackup(
    "Before Complete Legacy Migration",
  );
  await database.transaction("rw", database.tables, async () => {
    if (stateKey(await snapshot(database)) !== plan.baselineKey)
      throw new Error(
        "Business records changed. Prepare migration again. Recovery backup retained.",
      );
    for (const table of collections) {
      if (["backupMetadata", "importHistory"].includes(table)) continue;
      const before = new Map(
        plan.baseline[table].map((row) => [keyOf(table, row), row]),
      );
      const changed = plan.data[table].filter(
        (row) => canonical(before.get(keyOf(table, row))) !== canonical(row),
      );
      if (changed.length) await database.table(table).bulkPut(changed);
    }
    const actual = await snapshot(database);
    validateData(actual);
    if (
      stateKey(actual) !== stateKey(plan.data) ||
      canonical(sourceTotals(actual)) !== canonical(sourceTotals(plan.baseline))
    )
      throw new Error(
        "Migration verification failed. Business changes rolled back; recovery backup retained.",
      );
    await database.importHistory.add({
      id: crypto.randomUUID(),
      filename: "Complete Legacy Migration",
      importedAt: new Date().toISOString(),
      shopIds: [shopId],
      added: plan.created,
      updated: plan.linked,
      skipped: plan.identifiable - plan.linked,
      deleted: 0,
      conflicts: 0,
      errors: [],
      warnings: [
        "Historical daily barber sales and opening commission liabilities were not supplied; no earnings or account assignments were fabricated.",
      ],
      result: "applied",
      backupId: backup.id,
      recoveryBackupId: backup.id,
      digest: ROSTER_MIGRATION_VERSION,
      format: ROSTER_MIGRATION_VERSION,
      mode: "merge",
    });
  });
  return { ...plan, backupId: backup.id };
}
export const legacyMigration = {
  preview: (shopId: string) => prepareLegacyMigration(db, shopId),
  complete: (
    shopId: string,
    plan?: Awaited<ReturnType<typeof prepareLegacyMigration>>,
  ) => completeLegacyMigration(db, shopId, plan),
};
