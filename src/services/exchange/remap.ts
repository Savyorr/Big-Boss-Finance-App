import { type PreparedDocument } from "./adapters";
import { canonical, stableId } from "./json";
import {
  entityTables,
  canonicalTable,
  emptyData,
  type DataSet,
  type Row,
  type EntityTable,
} from "./schema";
export async function remapShops(
  prepared: PreparedDocument,
  mapping: Record<string, string>,
  local: DataSet,
): Promise<PreparedDocument> {
  const changed = prepared.shopIds.filter(
    (id) => mapping[id] && mapping[id] !== id,
  );
  if (!changed.length) return prepared;
  if (prepared.format !== "modern")
    throw new Error("Legacy files use the explicit target shop selector.");
  const targets = prepared.shopIds.map((id) => mapping[id] ?? id);
  if (new Set(targets).size !== targets.length)
    throw new Error(
      "Different source shops cannot be mapped into the same shop in one import.",
    );
  const mapShop = (id: string) => mapping[id] ?? id;
  const data = emptyData();
  const idMap = new Map<string, string>();
  const revMap = new Map<string, string>();
  const rows = prepared.data;
  const reverseIds = new Map<string, string>();
  const reverseRevisions = new Map<string, string>();
  for (const remembered of rows.sourceMappings)
    if (
      remembered.format === "modern" &&
      changed.includes(remembered.shopId) &&
      mapShop(remembered.shopId) === remembered.namespace
    ) {
      const key = `${canonicalTable(remembered.entityType)}:${remembered.canonicalId}`;
      const prior = reverseIds.get(key);
      if (prior && prior !== remembered.originalId)
        throw new Error("Ambiguous remembered source identity.");
      reverseIds.set(key, remembered.originalId);
      for (const pair of remembered.revisionPairs ?? []) {
        const prior = reverseRevisions.get(pair.canonical);
        if (prior && prior !== pair.original)
          throw new Error("Ambiguous remembered revision identity.");
        reverseRevisions.set(pair.canonical, pair.original);
      }
    }
  for (const table of entityTables)
    for (const row of rows[table]) {
      const owner = table === "shops" ? row.id : row.shopId;
      idMap.set(
        `${table}:${row.id}`,
        table === "shops"
          ? mapShop(row.id)
          : changed.includes(owner)
            ? (reverseIds.get(`${table}:${row.id}`) ??
              (await stableId(
                `map:${owner}:${mapShop(owner)}:${table}:${row.id}`,
              )))
            : row.id,
      );
      if (row.revision)
        revMap.set(
          row.revision,
          changed.includes(owner)
            ? (reverseRevisions.get(row.revision) ??
                (await stableId(
                  `revision:${owner}:${mapShop(owner)}:${row.revision}`,
                )))
            : row.revision,
        );
      if (row.parentRevision && !revMap.has(row.parentRevision))
        revMap.set(
          row.parentRevision,
          changed.includes(owner)
            ? (reverseRevisions.get(row.parentRevision) ??
                (await stableId(
                  `revision:${owner}:${mapShop(owner)}:${row.parentRevision}`,
                )))
            : row.parentRevision,
        );
    }
  for (const r of rows.revisions) {
    revMap.set(
      r.id,
      changed.includes(r.shopId)
        ? (reverseRevisions.get(r.id) ??
            (await stableId(
              `revision:${r.shopId}:${mapShop(r.shopId)}:${r.id}`,
            )))
        : r.id,
    );
    for (const parent of r.parents)
      if (!revMap.has(parent))
        revMap.set(
          parent,
          changed.includes(r.shopId)
            ? (reverseRevisions.get(parent) ??
                (await stableId(
                  `revision:${r.shopId}:${mapShop(r.shopId)}:${parent}`,
                )))
            : parent,
        );
  }
  const id = (table: string, value: string) =>
    idMap.get(`${table}:${value}`) ?? value;
  const rev = (value: string) => revMap.get(value) ?? value;
  function transform(table: EntityTable, row: Row): Row {
    const out = structuredClone(row);
    out.id = id(table, row.id);
    if (row.shopId) out.shopId = mapShop(row.shopId);
    if (row.revision) out.revision = rev(row.revision);
    if (row.parentRevision) out.parentRevision = rev(row.parentRevision);
    for (const [field, target] of Object.entries({
      stylistId: "stylists",
      accountId: "accounts",
      cashAccountId: "accounts",
      cardAccountId: "accounts",
      destinationAccountId: "accounts",
      saleId: "dailySales",
      transactionId: "transactions",
    }))
      if (row[field]) out[field] = id(target, row[field]);
    if (row.destinationShopId)
      out.destinationShopId = mapShop(row.destinationShopId);
    if (row.linkedEventId)
      out.linkedEventId = id(row.managedBy ?? "dailySales", row.linkedEventId);
    if (row.linkedTransactionIds)
      out.linkedTransactionIds = row.linkedTransactionIds.map((v: string) =>
        id("transactions", v),
      );
    for (const field of ["stylistAllocations", "commissionSnapshots"])
      if (row[field])
        out[field] = row[field].map((a: Row) => ({
          ...a,
          stylistId: id("stylists", a.stylistId),
        }));
    if (row.postings)
      out.postings = row.postings.map((p: Row) => ({
        ...p,
        accountId: id("accounts", p.accountId),
        shopId: mapShop(p.shopId),
      }));
    if (row.accountRevision) out.accountRevision = rev(row.accountRevision);
    const cleared = (key: string) => {
      const [tx, account] = key.split(":");
      return `${id("transactions", tx)}:${id("accounts", account)}`;
    };
    if (row.clearedKeys) out.clearedKeys = row.clearedKeys.map(cleared);
    if (row.eventRevisions)
      out.eventRevisions = Object.fromEntries(
        Object.entries(row.eventRevisions).map(([key, value]) => [
          cleared(key),
          rev(String(value)),
        ]),
      );
    return out;
  }
  for (const table of entityTables)
    for (const row of rows[table]) {
      if (table === "shops" && changed.includes(row.id)) {
        const target = local.shops.find((s) => s.id === mapShop(row.id));
        if (!target)
          throw new Error(
            "Map unfamiliar shops only to an existing local profile, or keep their original identity.",
          );
        data.shops.push(structuredClone(target));
      } else data[table].push(transform(table, row));
    }
  for (const r of rows.revisions) {
    const table = canonicalTable(r.entityType)!;
    if (table === "shops" && changed.includes(r.entityId)) continue;
    data.revisions.push({
      ...r,
      id: rev(r.id),
      shopId: mapShop(r.shopId),
      entityId: id(table, r.entityId),
      parents: r.parents.map(rev),
      payload: transform(table, r.payload),
    });
  }
  for (const t of rows.tombstones)
    data.tombstones.push({
      ...t,
      id: await stableId(`mapped-tombstone:${mapShop(t.shopId)}:${t.id}`),
      shopId: mapShop(t.shopId),
      entityId: id(canonicalTable(t.entityType)!, t.entityId),
      revision: rev(t.revision),
      ...(t.parentRevision ? { parentRevision: rev(t.parentRevision) } : {}),
    });
  for (const s of rows.settings) {
    const out = structuredClone(s);
    if (s.shopId) {
      out.shopId = mapShop(s.shopId);
      out.key = s.key.replace(s.shopId, out.shopId);
    }
    if (s.key === "activeShop" && typeof s.value === "string")
      out.value = mapShop(s.value);
    data.settings.push(out);
  }
  for (const table of ["sourceMappings", "sourceDocuments"] as const)
    for (const row of rows[table])
      data[table].push({
        ...row,
        id: changed.includes(row.shopId)
          ? await stableId(`mapped:${row.id}:${mapShop(row.shopId)}`)
          : row.id,
        shopId: mapShop(row.shopId),
        ...(table === "sourceMappings"
          ? {
              canonicalId: id(
                canonicalTable(row.entityType) ?? row.entityType,
                row.canonicalId,
              ),
            }
          : {}),
      });
  data.importHistory = rows.importHistory.map((r) => ({
    ...r,
    shopIds: r.shopIds.map(mapShop),
  }));
  data.backupMetadata = rows.backupMetadata.map((r) => ({
    ...r,
    shopIds: r.shopIds.map(mapShop),
  }));
  for (const table of entityTables)
    for (const row of rows[table]) {
      const owner = table === "shops" ? row.id : row.shopId;
      if (changed.includes(owner))
        data.sourceMappings.push({
          id: `modern-map:${owner}:${mapShop(owner)}:${table}:${row.id}:${row.revision}`,
          shopId: mapShop(owner),
          format: "modern",
          namespace: owner,
          entityType: table,
          originalId: row.id,
          canonicalId: id(table, row.id),
          originalRevision: row.revision,
          originalRecord: row,
          revisionPairs: [
            ...new Set([
              row.revision,
              ...rows.revisions
                .filter(
                  (r) =>
                    canonicalTable(r.entityType) === table &&
                    r.entityId === row.id,
                )
                .map((r) => r.id),
            ]),
          ].map((original) => ({ original, canonical: rev(original) })),
          ...(table === "shops"
            ? {
                originalHistory: rows.revisions.filter(
                  (r) =>
                    canonicalTable(r.entityType) === "shops" &&
                    r.entityId === row.id,
                ),
              }
            : {}),
        });
    }
  return {
    ...prepared,
    data,
    shopIds: targets,
    requestedShopId: prepared.requestedShopId
      ? mapShop(prepared.requestedShopId)
      : undefined,
    warnings: [
      ...prepared.warnings,
      "Explicit shop mapping changes canonical IDs and revision IDs deterministically. Local shop names/details are kept; original identity mappings are retained.",
    ],
  };
}
