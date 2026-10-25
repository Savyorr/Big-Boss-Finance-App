import {
  parseJson,
  moneyAt,
  canonical,
  digest,
  exactScaled,
} from "../services/exchange/json";
import {
  ORIGINAL_BARBERS,
  ORIGINAL_LEGACY_APP,
} from "../config/original-business";
import {
  envelopeSchema,
  type Envelope,
  type Entity,
  type Tx,
  type Day,
  rows,
  settings,
  addCents,
  today,
  validateRecords,
  moneyInput,
} from "./model";
import { exported, revised, type BusinessDB } from "./store";
const str = (x: unknown) => (x == null ? "" : String(x));
export async function readImport(
  text: string,
  current: Envelope,
): Promise<{ envelope: Envelope; format: string }> {
  const parsed = parseJson(text),
    j = parsed.value;
  if (j.app === "Big Boss Finance Faithful") {
    const envelope = envelopeSchema.parse(j);
    validateRecords(envelope.records);
    return { envelope, format: "Business JSON / backup" };
  }
  const original =
    j.app === ORIGINAL_LEGACY_APP && Array.isArray(j.transactions);
  const html = Array.isArray(j.days) && Array.isArray(j.tx);
  if (!original && !html)
    throw Error(
      "Supported files: original transaction JSON, original app backup (days/tx), or this application’s Export JSON.",
    );
  const all: Entity[] = [],
    existing = current.records;
  const staffMap = new Map<string, string>();
  const names = new Set<string>([
    ...(original ? ORIGINAL_BARBERS : []),
    ...(html ? (j.staff ?? ORIGINAL_BARBERS) : []),
    ...(html ? j.days.flatMap((d: any) => Object.keys(d.sales ?? {})) : []),
  ]);
  for (const name0 of names) {
    const name = str(name0).trim();
    if (!name || name === "Sale Product") continue;
    const matches = rows(existing, "staff").filter(
      (s) =>
        s.value.name.toLowerCase() === name.toLowerCase() ||
        s.value.originalName?.toLowerCase() === name.toLowerCase(),
    );
    if (matches.length > 1) throw Error("Duplicate barber name: " + name);
    const found = matches[0];
    const e =
      found ??
      (await initial("staff", "staff:" + name, {
        name,
        originalName: name,
        order: staffMap.size,
        active: true,
        rate: 5000,
      }));
    all.push(e);
    staffMap.set(name, e.id);
  }
  for (const s of rows(existing, "staff"))
    if (!staffMap.has(s.value.name)) staffMap.set(s.value.name, s.id);
  const m = (obj: any, key: string, path: string) =>
    obj[key] === undefined ? 0 : moneyAt(parsed, path + "/" + key, obj[key]);
  const source = original ? j.transactions : j.tx;
  for (let i = 0; i < source.length; i++) {
    const x = source[i],
      path = (original ? "/transactions/" : "/tx/") + i;
    if (!x.id || !x.date)
      throw Error("Every transaction needs its original ID and date");
    const payee = str(original ? x.payee : x.name),
      category = str(original ? x.category : x.cat);
    const staffId =
      category === "Contract Labour"
        ? [...staffMap].find(
            ([n]) => n.toLowerCase() === payee.trim().toLowerCase(),
          )?.[1]
        : undefined;
    const value: Tx = {
      date: x.date,
      type: str(original ? x.type : x.account),
      category,
      sub: str(x.sub),
      payee,
      details: str(x.details),
      income: m(x, "income", path),
      expense: m(x, "expense", path),
      bankCredit: m(x, original ? "bankCredit" : "credit", path),
      bankDeposit: m(x, original ? "bankDeposit" : "deposit", path),
      bankDebit: m(x, original ? "bankDebit" : "debit", path),
      notes: str(x.notes),
      ...(staffId ? { staffId } : {}),
      raw: x,
    };
    all.push(await initial("tx", str(x.id), value));
  }
  if (html) {
    for (let i = 0; i < j.days.length; i++) {
      const x = j.days[i],
        path = "/days/" + i,
        sales: Record<string, number> = {},
        rates: Record<string, number> = {};
      for (const [name, v] of Object.entries(x.sales ?? {})) {
        if (name === "Sale Product") continue;
        const id = staffMap.get(name);
        if (!id) throw Error("Missing barber " + name);
        sales[id] = moneyAt(
          parsed,
          path + "/sales/" + name.replace(/~/g, "~0").replace(/\//g, "~1"),
          v,
        );
        rates[id] = 5000;
      }
      const value: Day = {
        date: x.date,
        sales,
        rates,
        product:
          x.sales?.["Sale Product"] === undefined
            ? 0
            : moneyAt(
                parsed,
                path + "/sales/Sale Product",
                x.sales["Sale Product"],
              ),
        total: m(x, "total", path),
        card: m(x, "card", path),
        deposit: m(x, "deposit", path),
        notes: str(x.notes),
        raw: x,
      };
      all.push(await initial("day", "day:" + x.date, value));
    }
    for (let i = 0; i < (j.adj ?? []).length; i++) {
      const x = j.adj[i],
        staffId = staffMap.get(x.name);
      if (!staffId)
        throw Error("Adjustment references unknown barber " + str(x.name));
      all.push(
        await initial("adjustment", str(x.id ?? "adjustment:" + i), {
          date: x.date,
          staffId,
          amount: m(x, "amt", "/adj/" + i),
          notes: str(x.note),
          raw: x,
        }),
      );
    }
  }
  const old = current.records.find((e) => e.kind === "settings")!;
  if (old.kind !== "settings") throw Error("Missing settings");
  const data = settings(existing);
  const value = {
    ...data,
    historyIncomplete: original
      ? true
      : data.historyIncomplete ||
        all.some(
          (e) =>
            e.kind === "day" &&
            e.value.total !==
              addCents(...Object.values(e.value.sales), e.value.product),
        ) ||
        (!j.days.length &&
          source.some((x: any) => x.cat === "Contract Labour")),
    ...(html
      ? {
          opening: m(j, "open", ""),
          openingKnown: j.open !== undefined,
          asOf: j.bal?.asOf ?? today(),
          limit:
            j.bal?.limit === undefined ? 1500000 : m(j.bal, "limit", "/bal"),
          balances: (j.bal?.items ?? []).map((x: any, i: number) => ({
            name: str(x.n),
            amount: m(x, "v", "/bal/items/" + i),
          })),
          raw: { open: j.open, bal: j.bal },
        }
      : {}),
  };
  const sourceId = await digest(canonical(j));
  const knownSource = current.sources.some((s) => s.id === sourceId);
  const financial = (s: typeof data) =>
    canonical({
      opening: s.opening,
      openingKnown: s.openingKnown,
      asOf: s.asOf,
      limit: s.limit,
      balances: s.balances,
    });
  const unsafeSettingsChange =
    html &&
    financial(value) !== financial(data) &&
    (data.openingKnown ||
      current.records.some((e) => e.kind === "tx" || e.kind === "day") ||
      current.sources.length > 0);
  // Unversioned old backups cannot prove that their balances descend from local
  // edits. Repeat files leave settings alone; divergent balances require a choice.
  all.push(
    knownSource || canonical(value) === canonical(data)
      ? old
      : unsafeSettingsChange
        ? await initial("settings", "settings", value)
        : revised("settings", "settings", value, old),
  );
  const envelope: Envelope = {
    ...current,
    records: all,
    sources: [
      ...current.sources.filter((s) => s.id !== sourceId),
      {
        id: sourceId,
        format: original ? "Original transactions" : "Original HTML backup",
        raw: j,
      },
    ],
  };
  // Existing staff may be referenced by the incoming daily sales even when not in staff[].
  for (const id of new Set(
    all.flatMap((e) =>
      e.kind === "day"
        ? Object.keys(e.value.sales)
        : e.kind === "adjustment"
          ? [e.value.staffId]
          : [],
    ),
  ))
    if (!all.some((e) => e.kind === "staff" && e.id === id)) {
      const s = existing.find((e) => e.id === id);
      if (s) all.push(s);
    }
  validateRecords(all);
  return {
    envelope,
    format: original
      ? "Original transaction backup"
      : "Original HTML application backup",
  };
}
async function initial(
  kind: Entity["kind"],
  id: string,
  value: unknown,
): Promise<Entity> {
  const revision = await digest(canonical({ kind, id, value }));
  return { kind, id, value, revision, ancestors: [], deleted: false } as Entity;
}
export async function readWorkbook(buffer: ArrayBuffer, current: Envelope) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" }),
    days = new Map<string, any>(),
    tx: any[] = [],
    staff: string[] = [];
  const amount = (v: unknown) =>
    v == null || v === "" ? 0 : exactScaled(String(v), 2);
  const date = (v: unknown) => {
    if (typeof v === "number") {
      const d = XLSX.SSF.parse_date_code(v);
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    return /^\d{4}-\d\d-\d\d/.test(String(v)) ? String(v).slice(0, 10) : "";
  };
  const mk = (d: string) => {
    if (!days.has(d))
      days.set(d, {
        date: d,
        total: 0,
        card: 0,
        deposit: 0,
        sales: {},
        notes: "",
      });
    return days.get(d);
  };
  let count = 0;
  for (const name of wb.SheetNames) {
    if (!/^[A-Z][a-z]{2}-\d\d$/.test(name) && !/journal/i.test(name)) continue;
    const rs = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
    });
    const journal = /journal/i.test(name),
      at = rs.findIndex((r) =>
        r.some(
          (c) =>
            String(c).trim() === (journal ? "Total Amount" : "Account Name"),
        ),
      );
    if (at < 0) continue;
    const h: Record<string, number> = {};
    rs[at].forEach((c: any, i: number) => {
      if (c != null) h[String(c).trim()] = i;
    });
    for (let i = at + 1; i < rs.length; i++) {
      const r = rs[i],
        d = date(r[h.Date]);
      if (!d) continue;
      count++;
      if (journal) {
        const nm = String(r[h.Name] ?? "")
            .replace(/^\d+-/, "")
            .trim(),
          a = amount(r[h["Total Amount"]]);
        if (!nm || !a) continue;
        if (!staff.includes(nm)) staff.push(nm);
        const day = mk(d);
        day.sales[nm] = addCents(day.sales[nm] ?? 0, a);
      } else {
        const category = str(r[h["Account Name"]]),
          income = amount(r[h.Income]),
          credit = amount(r[h.Credits]),
          deposit = amount(r[h.Deposits]);
        if (category === "Revenue" && income > 0) {
          const day = mk(d);
          day.total = addCents(day.total, income);
          day.card = addCents(day.card, credit);
          day.deposit = addCents(day.deposit, deposit);
        } else
          tx.push({
            id: "workbook:" + name + ":" + i,
            date: d,
            account: str(r[h.Account]),
            cat: category,
            name: str(r[h.Name]),
            details: str(r[h.Details]),
            income: moneyInput(income),
            expense: moneyInput(amount(r[h.Expense])),
            credit: moneyInput(credit),
            deposit: moneyInput(deposit),
            debit: moneyInput(amount(r[h.Debits])),
          });
      }
    }
  }
  if (!count) throw Error("No monthly sheets or Journal found");
  for (const d of days.values()) {
    if (!d.total) d.total = addCents(...(Object.values(d.sales) as number[]));
    d.total = moneyInput(d.total);
    d.card = moneyInput(d.card);
    d.deposit = moneyInput(d.deposit);
    for (const n of Object.keys(d.sales)) d.sales[n] = moneyInput(d.sales[n]);
  }
  if (!staff.length) staff.push(...ORIGINAL_BARBERS);
  if (!staff.includes("Sale Product")) staff.push("Sale Product");
  const existing = settings(current.records);
  const result = await readImport(
    JSON.stringify({
      days: [...days.values()],
      tx,
      staff,
      adj: [],
      open: moneyInput(existing.opening),
      bal: {
        asOf: existing.asOf,
        limit: moneyInput(existing.limit),
        items: existing.balances.map((b) => ({
          n: b.name,
          v: moneyInput(b.amount),
        })),
      },
    }),
    current,
  );
  // Original workbook import replaced days/ledger, but retained adjustments and
  // balances. Keep referenced staff and their owner-edited configuration too.
  for (const e of current.records.filter(
    (e) => e.kind === "adjustment" || e.kind === "staff",
  ))
    if (!result.envelope.records.some((r) => r.id === e.id))
      result.envelope.records.push(e);
  const importedSettings = result.envelope.records.find(
    (e) => e.kind === "settings",
  )!;
  if (importedSettings.kind === "settings") {
    const ds = rows(result.envelope.records, "day");
    const incomplete =
      ds.some(
        (d) =>
          d.value.total !==
          addCents(...Object.values(d.value.sales), d.value.product),
      ) ||
      (!ds.length &&
        rows(result.envelope.records, "tx").some(
          (t) => t.value.category === "Contract Labour" && t.value.expense > 0,
        ));
    if (
      importedSettings.value.historyIncomplete !== incomplete ||
      importedSettings.value.openingKnown !== existing.openingKnown
    )
      result.envelope.records = result.envelope.records
        .filter((e) => e.id !== importedSettings.id)
        .concat(
          revised(
            "settings",
            importedSettings.id,
            {
              ...importedSettings.value,
              historyIncomplete: incomplete,
              openingKnown: existing.openingKnown,
            },
            importedSettings,
          ),
        );
  }
  validateRecords(result.envelope.records);
  return {
    ...result,
    format: "Original Excel workbook · replaces daily sales and ledger",
  };
}
export async function prepareFile(db: BusinessDB, file: File) {
  const current = await exported(db);
  if (file.size > 25 * 1024 * 1024) throw Error("Maximum file size is 25 MB");
  return /\.xls[xm]$/i.test(file.name)
    ? readWorkbook(await file.arrayBuffer(), current)
    : readImport(await file.text(), current);
}
