import { envelopeSchema, type Envelope, type Entity } from "./model";
import { canonical } from "../services/exchange/json";
const key = (e: Entity) => canonical([e.kind, e.id, e.revision]);
// Only storage representation changes: every recovery snapshot remains restorable.
// Reuse unchanged rows and provenance instead of embedding the business N times.
export function packBackup(input: Envelope): Envelope {
  const current = envelopeSchema.parse(input);
  if (!current.recoveryBackups?.length) return current;
  const records = new Map(current.records.map((e) => [key(e), e])),
    sources = new Map(current.sources.map((e) => [e.id, e]));
  const extraRecords: Entity[] = [],
    extraSources: Envelope["sources"] = [];
  const snapshots = current.recoveryBackups.map((b) => {
    for (const r of b.envelope.records) {
      const k = key(r),
        old = records.get(k);
      if (old && canonical(old) !== canonical(r))
        throw Error("A recovery revision contains conflicting data");
      if (!old) {
        records.set(k, r);
        extraRecords.push(r);
      }
    }
    for (const s of b.envelope.sources) {
      const old = sources.get(s.id);
      if (old && canonical(old) !== canonical(s))
        throw Error("A recovery source contains conflicting data");
      if (!old) {
        sources.set(s.id, s);
        extraSources.push(s);
      }
    }
    return {
      id: b.id,
      created: b.created,
      app: b.envelope.app,
      version: b.envelope.version,
      businessId: b.envelope.businessId,
      exportedAt: b.envelope.exportedAt,
      recordRefs: b.envelope.records.map(key),
      sourceRefs: b.envelope.sources.map((s) => s.id),
    };
  });
  return envelopeSchema.parse({
    ...current,
    recoveryBackups: undefined,
    recoveryArchive: {
      records: extraRecords,
      sources: extraSources,
      snapshots,
    },
  });
}
export function unpackBackup(input: unknown): Envelope {
  const parsed = envelopeSchema.parse(input),
    archive = parsed.recoveryArchive;
  if (!archive) return parsed;
  if (parsed.recoveryBackups?.length)
    throw Error("Backup has two conflicting recovery encodings");
  const records = new Map<string, Entity>(),
    sources = new Map<string, Envelope["sources"][number]>();
  for (const r of [...parsed.records, ...archive.records]) {
    const k = key(r),
      old = records.get(k);
    if (old && canonical(old) !== canonical(r))
      throw Error("Conflicting recovery revision");
    records.set(k, r);
  }
  for (const s of [...parsed.sources, ...archive.sources]) {
    const old = sources.get(s.id);
    if (old && canonical(old) !== canonical(s))
      throw Error("Conflicting recovery source");
    sources.set(s.id, s);
  }
  const backups = archive.snapshots.map((s) => ({
    id: s.id,
    created: s.created,
    envelope: {
      app: s.app,
      version: s.version,
      businessId: s.businessId,
      exportedAt: s.exportedAt,
      records: s.recordRefs.map((k) => {
        const r = records.get(k);
        if (!r) throw Error("Backup is missing a recovery record");
        return r;
      }),
      sources: s.sourceRefs.map((k) => {
        const r = sources.get(k);
        if (!r) throw Error("Backup is missing recovery provenance");
        return r;
      }),
    },
  }));
  return envelopeSchema.parse({
    ...parsed,
    recoveryArchive: undefined,
    recoveryBackups: backups,
  });
}
