import Dexie, { type Table } from "dexie";
import {
  entitySchema,
  type Entity,
  type Kind,
  type Envelope,
  envelopeSchema,
  validateRecords,
  today,
} from "./model";
import { canonical } from "../services/exchange/json";
import { ORIGINAL_BARBERS } from "../config/original-business";
export type Profile = { id: string; name: string };
const registry = new Dexie("bigboss-faithful-profiles");
registry.version(1).stores({ profiles: "id,name" });
export const profiles = registry.table<Profile>("profiles");
export class BusinessDB extends Dexie {
  records!: Table<Entity, string>;
  meta!: Table<{ key: string; value: string }, string>;
  backups!: Table<{ id: string; created: string; envelope: Envelope }, string>;
  sources!: Table<Envelope["sources"][number], string>;
  constructor(id: string) {
    super("bigboss-faithful-" + id);
    this.version(1).stores({
      records: "id,kind",
      meta: "key",
      backups: "id,created",
      sources: "id",
    });
  }
}
export function revised<K extends Kind>(
  kind: K,
  id: string,
  value: Extract<Entity, { kind: K }>["value"],
  old?: Entity,
): Entity {
  return entitySchema.parse({
    kind,
    id,
    value,
    revision: crypto.randomUUID(),
    ancestors: old ? [...new Set([...old.ancestors, old.revision])] : [],
    deleted: false,
  });
}
export async function createBusiness(name: string, original = false) {
  name = name.trim();
  original ||= /^big[ -]*boss(?: hair salon)?(?: ltd\.?)?$/i.test(name);
  if (!name) throw Error("Enter a business name");
  const p = { id: crypto.randomUUID(), name };
  const db = new BusinessDB(p.id);
  try {
    await db.transaction("rw", [db.records, db.meta], async () => {
      await db.meta.put({ key: "businessId", value: crypto.randomUUID() });
      await db.records.put(
        revised("settings", "settings", {
          name,
          opening: 0,
          openingKnown: false,
          asOf: today(),
          limit: 1500000,
          balances: [],
          overlaps: {},
          historyIncomplete: false,
        }),
      );
      if (original)
        for (const n of ORIGINAL_BARBERS)
          await db.records.put(
            revised("staff", "staff:" + n, {
              name: n,
              originalName: n,
              order: ORIGINAL_BARBERS.indexOf(n),
              active: true,
              rate: 5000,
            }),
          );
    });
    await profiles.add(p);
    return p;
  } finally {
    db.close();
  }
}
export async function write(db: BusinessDB, e: Entity) {
  await db.transaction("rw", db.records, async () => {
    const current = await db.records.get(e.id);
    if (current && !e.ancestors.includes(current.revision))
      throw Error(
        "This record changed in another window. Reload before saving.",
      );
    const all = await db.records.toArray();
    const candidate = all.filter((x) => x.id !== e.id).concat(e);
    validateRecords(candidate);
    await db.records.put(e);
  });
}
export async function remove(db: BusinessDB, e: Entity) {
  if (e.kind === "settings" || e.kind === "staff")
    throw Error("Deactivate barbers to preserve history");
  await write(db, {
    ...e,
    deleted: true,
    revision: crypto.randomUUID(),
    ancestors: [...e.ancestors, e.revision],
  });
}
export async function exported(db: BusinessDB): Promise<Envelope> {
  return db.transaction("r", [db.records, db.meta, db.sources], async () =>
    envelopeSchema.parse({
      app: "Big Boss Finance Faithful",
      version: 1,
      businessId: (await db.meta.get("businessId"))!.value,
      exportedAt: new Date().toISOString(),
      records: await db.records.toArray(),
      sources: await db.sources.toArray(),
    }),
  );
}
export function download(value: unknown, name = "BigBoss_Backup") {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name + "_" + today() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function recovery(db: BusinessDB) {
  const envelope = await exported(db),
    id = crypto.randomUUID();
  await db.backups.add({ id, created: new Date().toISOString(), envelope });
  return id;
}
export type Conflict = { id: string; local: Entity; incoming: Entity };
export type Plan = {
  baseline: string;
  incoming: Envelope;
  records: Entity[];
  conflicts: Conflict[];
  added: number;
  updated: number;
  unchanged: number;
  adopt: boolean;
};
export function mergeRecords(local: Entity[], incoming: Entity[]) {
  const map = new Map(local.map((e) => [e.id, e]));
  const conflicts: Conflict[] = [];
  let added = 0,
    updated = 0,
    unchanged = 0;
  for (const e of incoming) {
    const old = map.get(e.id);
    if (!old) {
      map.set(e.id, e);
      added++;
    } else if (old.revision === e.revision) {
      if (canonical(old) !== canonical(e))
        throw Error("Identical revision contains different data");
      unchanged++;
    } else if (old.ancestors.includes(e.revision)) {
      unchanged++;
    } else if (e.ancestors.includes(old.revision)) {
      map.set(e.id, e);
      updated++;
    } else conflicts.push({ id: e.id, local: old, incoming: e });
  }
  return { records: [...map.values()], conflicts, added, updated, unchanged };
}
export async function planImport(
  db: BusinessDB,
  incoming: Envelope,
): Promise<Plan> {
  envelopeSchema.parse(incoming);
  validateRecords(incoming.records);
  const current = await exported(db);
  // An untouched original roster is a first-run convenience, not an existing
  // owner's financial database. Allow full restore over those defaults too.
  const empty =
    current.sources.length === 0 &&
    current.records.every((e) =>
      e.kind === "settings"
        ? !e.value.openingKnown &&
          e.value.balances.length === 0 &&
          e.ancestors.length === 0
        : e.kind === "staff" &&
          e.id === "staff:" + e.value.name &&
          ORIGINAL_BARBERS.some((n) => n === e.value.name) &&
          e.value.active &&
          e.value.rate === 5000 &&
          e.ancestors.length === 0,
    );
  const mismatch = current.businessId !== incoming.businessId;
  if (mismatch && !empty)
    throw Error(
      "This JSON belongs to a different business. Create an empty profile and import it there.",
    );
  const merge = mergeRecords(mismatch ? [] : current.records, incoming.records);
  return {
    ...merge,
    incoming,
    baseline: canonical(current.records),
    adopt: mismatch,
  };
}
export async function applyPlan(
  db: BusinessDB,
  plan: Plan,
  choices: Record<string, "local" | "incoming">,
  replace = false,
) {
  await recovery(db);
  await db.transaction("rw", [db.records, db.meta, db.sources], async () => {
    const current = await db.records.toArray();
    if (canonical(current) !== plan.baseline)
      throw Error(
        "Business data changed after preview. Select the file again.",
      );
    let candidate = replace ? [...plan.incoming.records] : [...plan.records];
    if (!replace)
      for (const c of plan.conflicts) {
        const choice = choices[c.id];
        if (!choice) throw Error("Choose a version for every conflict");
        const selected = choice === "local" ? c.local : c.incoming;
        const merged = {
          ...selected,
          revision: crypto.randomUUID(),
          ancestors: [
            ...new Set([
              ...c.local.ancestors,
              c.local.revision,
              ...c.incoming.ancestors,
              c.incoming.revision,
            ]),
          ],
        };
        candidate = candidate.filter((e) => e.id !== c.id).concat(merged);
      }
    validateRecords(candidate);
    await db.records.clear();
    await db.records.bulkPut(candidate);
    await db.meta.put({ key: "businessId", value: plan.incoming.businessId });
    if (replace) await db.sources.clear();
    await db.sources.bulkPut(plan.incoming.sources);
  });
}
export async function renameBusiness(p: Profile, name: string) {
  const db = new BusinessDB(p.id);
  try {
    const old = (await db.records.get("settings"))!;
    if (old.kind !== "settings") throw Error("Missing settings");
    await write(
      db,
      revised("settings", old.id, { ...old.value, name: name.trim() }, old),
    );
    await profiles.put({ ...p, name: name.trim() });
  } finally {
    db.close();
  }
}
export async function removeBusiness(p: Profile) {
  await Dexie.delete("bigboss-faithful-" + p.id);
  await profiles.delete(p.id);
}
