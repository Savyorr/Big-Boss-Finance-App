import { canonical } from "./json";
import {
  collections,
  entityTables,
  canonicalTable,
  keyOf,
  emptyData,
  type Collection,
  type DataSet,
  type EntityTable,
  type Row,
  sourceTotals,
} from "./schema";
import type { PreparedDocument } from "./adapters";
export type Action = "add" | "update" | "unchanged" | "older" | "conflict";
export interface Change {
  table: Collection;
  id: string;
  group: string;
  action: Action;
  local?: Row;
  incoming: Row;
  fields: string[];
}
export interface Conflict {
  id: string;
  label: string;
  changes: Change[];
}
export interface ImportPlan {
  token: string;
  prepared: PreparedDocument;
  baseline: DataSet;
  baselineKey: string;
  changes: Change[];
  conflicts: Conflict[];
  mode: "merge" | "replace";
  replaceShopIds: string[];
  replacementRemovals: {
    table: EntityTable;
    id: string;
    shopId: string;
    label: string;
  }[];
  warnings: string[];
  sourceTotals: ReturnType<typeof sourceTotals>;
  destinationTotals: ReturnType<typeof sourceTotals>;
  counts: Record<Action, number>;
}
export function stateKey(data: DataSet) {
  return canonical(
    Object.fromEntries(
      collections
        .filter((k) => !["importHistory", "backupMetadata"].includes(k))
        .map((k) => [
          k,
          [...data[k]]
            .filter((r) => k !== "settings" || r.key !== "lastExport")
            .sort((a, b) => keyOf(k, a).localeCompare(keyOf(k, b))),
        ]),
    ),
  );
}
export function groupKey(table: Collection, row: Row) {
  if (table === "dailySales") return `dailySales:${row.id}`;
  if (table === "earnings") return `dailySales:${row.saleId}`;
  if (table === "transactions" && row.managedBy)
    return `${row.managedBy}:${row.linkedEventId}`;
  return `${table}:${keyOf(table, row)}`;
}
export function changedFields(a: Row, b: Row) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) =>
      canonical(a[k]) !== canonical(b[k]) &&
      !["updatedAt", "revision", "parentRevision", "revisionNumber"].includes(
        k,
      ),
  );
}
export function buildPlan(
  prepared: PreparedDocument,
  baseline: DataSet,
  mode: "merge" | "replace" = "merge",
): ImportPlan {
  const incoming = prepared.data;
  const histories = new Map<string, Row>();
  for (const row of [...baseline.revisions, ...incoming.revisions]) {
    const prior = histories.get(row.id);
    if (prior && canonical(prior) !== canonical(row))
      throw new Error(
        "A revision ID has different immutable payloads. Import rejected.",
      );
    histories.set(row.id, row);
  }
  const ancestor = (
    ancestorId: string,
    descendant: string,
    table: Collection,
    entityId: string,
  ) => {
    const queue = [descendant],
      seen = new Set<string>();
    while (queue.length) {
      const current = queue.pop()!;
      if (current === ancestorId) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      const r = histories.get(current);
      if (
        r &&
        canonicalTable(r.entityType) === table &&
        r.entityId === entityId
      )
        queue.push(...r.parents);
    }
    return false;
  };
  const changes: Change[] = [];
  for (const table of collections) {
    if (table === "revisions") continue;
    const existing = new Map(baseline[table].map((r) => [keyOf(table, r), r]));
    for (const row of incoming[table]) {
      const id = keyOf(table, row),
        local = existing.get(id);
      let action: Action = "add";
      if (local) {
        if (table === "sourceDocuments" && local.rawText !== row.rawText)
          throw new Error("Immutable source document identity collision.");
        if (table === "settings" && row.key === "lastExport") action = "older";
        else if (canonical(local) === canonical(row)) action = "unchanged";
        else if (
          table === "sourceDocuments" &&
          local.rawText === row.rawText &&
          local.shopId === row.shopId
        )
          action = "unchanged";
        else if (
          table === "sourceMappings" &&
          local.canonicalId === row.canonicalId &&
          local.originalId === row.originalId &&
          local.shopId === row.shopId
        )
          action = "unchanged";
        else if (
          entityTables.includes(table as EntityTable) &&
          local.revision === row.revision
        )
          throw new Error("Same record revision contains different values.");
        else if (
          entityTables.includes(table as EntityTable) &&
          ancestor(local.revision, row.revision, table, id)
        )
          action = "update";
        else if (
          entityTables.includes(table as EntityTable) &&
          ancestor(row.revision, local.revision, table, id)
        )
          action = "older";
        else action = "conflict";
      } else if (
        entityTables.includes(table as EntityTable) &&
        !row.deletedAt &&
        baseline.tombstones.some(
          (t) =>
            canonicalTable(t.entityType) === table && t.entityId === row.id,
        )
      )
        action = "older";
      if (
        mode === "replace" &&
        local &&
        entityTables.includes(table as EntityTable) &&
        canonical(local) !== canonical(row) &&
        (prepared.requestedShopId
          ? [prepared.requestedShopId]
          : prepared.shopIds
        ).includes(table === "shops" ? row.id : row.shopId)
      )
        action = "conflict";
      changes.push({
        table,
        id,
        group: groupKey(table, row),
        action,
        local,
        incoming: row,
        fields: local ? changedFields(local, row) : [],
      });
    }
  }
  for (const marker of incoming.tombstones) {
    const table = canonicalTable(marker.entityType);
    if (
      !table ||
      table === "shops" ||
      incoming[table].some((r) => r.id === marker.entityId)
    )
      continue;
    const local = baseline[table].find((r) => r.id === marker.entityId);
    if (local && !local.deletedAt) {
      const row = {
        ...local,
        deletedAt: marker.updatedAt,
        revision: marker.revision,
      };
      changes.push({
        table,
        id: local.id,
        group: groupKey(table, local),
        action: "conflict",
        local,
        incoming: row,
        fields: ["deletedAt"],
      });
    }
  }
  // A managed aggregate is one synchronization unit. An old anchor cannot reintroduce discarded children.
  const groups = new Map<string, Change[]>();
  for (const change of changes) {
    const list = groups.get(change.group) ?? [];
    list.push(change);
    groups.set(change.group, list);
  }
  for (const [group, list] of groups) {
    const table = group.slice(0, group.indexOf(":"));
    if (["dailySales", "commissionPayments", "adjustments"].includes(table)) {
      const anchor = list.find((c) => c.table === table);
      if (anchor?.action === "older") for (const c of list) c.action = "older";
      else if (list.some((c) => c.action === "conflict"))
        for (const c of list) c.action = "conflict";
    }
  }
  const conflicts = [...groups]
    .filter(([, list]) => list.some((c) => c.action === "conflict"))
    .map(([id, list]) => ({
      id,
      label:
        list.find(
          (c) => c.incoming.description || c.incoming.name || c.incoming.reason,
        )?.incoming.description ??
        list.find((c) => c.incoming.name)?.incoming.name ??
        `${list[0].table} · ${list[0].id}`,
      changes: list,
    }));
  const counts = { add: 0, update: 0, unchanged: 0, older: 0, conflict: 0 };
  for (const change of changes) counts[change.action]++;
  const warnings = [...prepared.warnings];
  if (
    prepared.format !== "modern" &&
    baseline.sourceDocuments.some(
      (d) =>
        prepared.shopIds.includes(d.shopId) && d.format !== prepared.format,
    )
  )
    warnings.push(
      "This shop already contains another legacy format. The files can overlap. No cross-format matching or automatic classification will be performed.",
    );
  const replaceShopIds = prepared.requestedShopId
    ? [prepared.requestedShopId]
    : prepared.shopIds;
  const replacementRemovals =
    mode === "replace"
      ? entityTables
          .filter((t) => t !== "shops")
          .flatMap((table) => {
            const ids = new Set(incoming[table].map((r) => r.id));
            return baseline[table]
              .filter(
                (r) =>
                  replaceShopIds.includes(r.shopId) &&
                  !r.deletedAt &&
                  !ids.has(r.id),
              )
              .map((r) => ({
                table,
                id: r.id,
                shopId: r.shopId,
                label: r.description ?? r.name ?? r.businessDate ?? r.id,
              }));
          })
      : [];
  return {
    replacementRemovals,
    token: crypto.randomUUID(),
    prepared,
    baseline,
    baselineKey: stateKey(baseline),
    changes,
    conflicts,
    mode,
    replaceShopIds,
    warnings,
    sourceTotals: sourceTotals(incoming),
    destinationTotals: sourceTotals(baseline, prepared.shopIds),
    counts,
  };
}
export type Resolutions = Record<string, "local" | "imported">;
export function resolveCandidate(plan: ImportPlan, resolutions: Resolutions) {
  for (const conflict of plan.conflicts)
    if (!resolutions[conflict.id])
      throw new Error("Resolve every conflict or cancel before importing.");
  const data = structuredClone(plan.baseline);
  const maps = new Map(
    collections.map((k) => [k, new Map(data[k].map((r) => [keyOf(k, r), r]))]),
  );
  const put = (table: Collection, row: Row) =>
    maps.get(table)!.set(keyOf(table, row), row);
  const revisions = new Map<string, Row>(
    [...plan.baseline.revisions, ...plan.prepared.data.revisions].map((r) => [
      r.id,
      r,
    ]),
  );
  function resolvedHead(
    table: EntityTable,
    chosen: Row,
    local: Row | undefined,
    incoming: Row | undefined,
    deleted = false,
  ) {
    const now = new Date().toISOString();
    const row: Row = {
      ...structuredClone(chosen),
      revision: crypto.randomUUID(),
      updatedAt: now,
      revisionNumber:
        Math.max(local?.revisionNumber ?? 1, incoming?.revisionNumber ?? 1) + 1,
      ...(local
        ? { parentRevision: local.revision }
        : incoming
          ? { parentRevision: incoming.revision }
          : {}),
      ...(deleted ? { deletedAt: now } : {}),
    };
    const parents = [
      ...new Set([local?.revision, incoming?.revision].filter(Boolean)),
    ];
    revisions.set(row.revision, {
      id: row.revision,
      entityType: table,
      entityId: row.id,
      shopId: table === "shops" ? row.id : row.shopId,
      parents,
      createdAt: now,
      payload: row,
    });
    return row;
  }
  for (const change of plan.changes) {
    if (change.action === "unchanged" || change.action === "older") continue;
    if (change.action === "conflict") {
      const useIncoming = resolutions[change.group] === "imported";
      if (entityTables.includes(change.table as EntityTable)) {
        const chosen = useIncoming
          ? change.incoming
          : (change.local ?? change.incoming);
        put(
          change.table,
          resolvedHead(
            change.table as EntityTable,
            chosen,
            change.local,
            change.incoming,
            !useIncoming && !change.local,
          ),
        );
      } else if (useIncoming)
        put(change.table, structuredClone(change.incoming));
    } else put(change.table, structuredClone(change.incoming));
  }
  // Resolve only the local rows of this aggregate, without scanning every record per conflict.
  const localGroups = new Map<string, { table: EntityTable; row: Row }[]>();
  for (const table of entityTables)
    for (const row of plan.baseline[table]) {
      const key = groupKey(table, row);
      const list = localGroups.get(key) ?? [];
      list.push({ table, row });
      localGroups.set(key, list);
    }
  const touched = new Set(plan.changes.map((c) => `${c.table}:${c.id}`));
  for (const conflict of plan.conflicts)
    if (resolutions[conflict.id] === "imported")
      for (const { table, row } of localGroups.get(conflict.id) ?? [])
        if (!touched.has(`${table}:${row.id}`) && !row.deletedAt)
          put(table, resolvedHead(table, row, row, undefined, true));
  if (plan.mode === "replace") {
    for (const table of entityTables) {
      if (table === "shops") continue;
      const incomingIds = new Set(plan.prepared.data[table].map((r) => r.id));
      for (const row of plan.baseline[table])
        if (
          plan.replaceShopIds.includes(row.shopId) &&
          !incomingIds.has(row.id) &&
          !row.deletedAt
        )
          put(table, resolvedHead(table, row, row, undefined, true));
    }
    // Scoped settings/mappings/documents omitted by the replacement are retained for forensic provenance;
    // global preferences and unrelated shops are never deleted by a scoped replacement.
  }
  for (const table of collections) data[table] = [...maps.get(table)!.values()];
  data.revisions = [...revisions.values()];
  const markers = new Set(
    data.tombstones.map((t) => `${canonicalTable(t.entityType)}:${t.entityId}`),
  );
  for (const table of entityTables)
    if (table !== "shops")
      for (const row of data[table])
        if (row.deletedAt && !markers.has(`${table}:${row.id}`)) {
          const now = new Date().toISOString();
          data.tombstones.push({
            id: crypto.randomUUID(),
            shopId: row.shopId,
            createdAt: now,
            updatedAt: now,
            revision: crypto.randomUUID(),
            entityType: table,
            entityId: row.id,
          });
          markers.add(`${table}:${row.id}`);
        }
  return data;
}
