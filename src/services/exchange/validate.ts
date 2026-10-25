import { z } from "zod";
import { financialPreferencesSchema } from "../preferences";
import { exactScaled } from "./json";
import {
  entitySchemas,
  extraSchemas,
  entityTables,
  collections,
  keyOf,
  canonicalTable,
  type DataSet,
  type Row,
  type EntityTable,
} from "./schema";
import { canonical } from "./json";
import { addCents, commissionCents } from "../../calculations/money";
import { isCashAccount, isLiability } from "../../calculations/finance";
export function validateData(data: DataSet) {
  const maps = new Map<string, Map<string, Row>>();
  for (const table of collections) {
    const map = new Map<string, Row>();
    for (const row of data[table]) {
      const schema =
        table in entitySchemas
          ? entitySchemas[table as EntityTable]
          : extraSchemas[table as keyof typeof extraSchemas];
      const result = schema.strict().parse(row);
      if (canonical(row) !== canonical(result))
        throw new Error(
          `Unsupported nested fields in ${table}; no fields were discarded.`,
        );
      const key = keyOf(table, row);
      if (map.has(key)) throw new Error(`Duplicate identity in ${table}.`);
      map.set(key, row);
    }
    maps.set(table, map);
  }
  const find = (table: string, id: string | undefined, shopId?: string) => {
    const value = maps.get(table)?.get(id ?? "");
    if (!value || (shopId && value.shopId !== shopId))
      throw new Error(`Invalid or cross-shop ${table} reference.`);
    return value;
  };
  const own = (row: Row) => find("shops", row.shopId);
  const active = (r: Row) => !r.deletedAt;
  for (const table of entityTables)
    if (table !== "shops") for (const row of data[table]) own(row);
  for (const t of data.transactions) {
    if (t.accountId) find("accounts", t.accountId, t.shopId);
    if (t.destinationAccountId)
      find("accounts", t.destinationAccountId, t.destinationShopId ?? t.shopId);
    if (t.stylistId) find("stylists", t.stylistId, t.shopId);
    for (const p of t.postings ?? []) find("accounts", p.accountId, p.shopId);
    if (
      new Set((t.postings ?? []).map((p: Row) => p.accountId)).size !==
      (t.postings ?? []).length
    )
      throw new Error("Duplicate account postings in a transaction.");
    if (!active(t)) continue;
    if (
      t.accountingStatus === "classified" &&
      (t.postings ?? []).some(
        (p: Row) => find("accounts", p.accountId, p.shopId).deletedAt,
      )
    )
      throw new Error(
        "An active financial movement references a deleted account. Restore or resolve its account before importing.",
      );
    if (t.accountingStatus !== "classified") {
      if (
        (t.postings ?? []).length ||
        t.revenueCents ||
        t.operatingExpenseCents ||
        t.commissionExpenseCents
      )
        throw new Error(
          "Unclassified records cannot contain recognized postings or profit.",
        );
      continue;
    }
    if (t.kind === "Revenue" && t.managedBy === "dailySales") {
      const day = find("dailySales", t.linkedEventId, t.shopId);
      if (!active(day))
        throw new Error("Active sale event points to a deleted day.");
      const total = addCents(day.serviceCents, day.productCents);
      if (
        t.revenueCents !== total ||
        t.amountCents !== total ||
        t.operatingExpenseCents !== 0 ||
        t.commissionExpenseCents !==
          addCents(
            ...(day.commissionSnapshots ?? []).map(
              (s: Row) => s.commissionCents,
            ),
          )
      )
        throw new Error("Daily sales financial totals do not reconcile.");
      const expected = new Map<string, number>();
      for (const [id, amount] of [
        [day.cashAccountId, day.cashCents],
        [day.cardAccountId, day.cardCents],
      ] as [string, number][])
        expected.set(id, addCents(expected.get(id) ?? 0, amount));
      if (
        canonical([...expected].sort()) !==
        canonical(
          (t.postings ?? [])
            .map((p: Row) => [p.accountId, p.deltaCents])
            .sort(),
        )
      )
        throw new Error("Daily receipt postings do not reconcile.");
      continue;
    }
    const expected: Row[] = [];
    let revenue = 0,
      expense = 0;
    const amount = t.amountCents;
    if (t.kind === "Adjustment" && t.managedBy === "adjustments") {
      const a = find("adjustments", t.linkedEventId, t.shopId);
      if (
        !active(a) ||
        a.transactionId !== t.id ||
        a.amountCents !== amount ||
        a.businessDate !== t.businessDate
      )
        throw new Error("Adjustment linkage mismatch.");
    } else {
      if (amount <= 0)
        throw new Error("Classified transaction amount must be positive.");
      const source = find("accounts", t.accountId, t.shopId);
      if (t.kind === "Revenue") revenue = amount;
      else if (["Operating expense", "Loan interest"].includes(t.kind))
        expense = amount;
      else if (
        ![
          "Bank deposit",
          "Bank withdrawal",
          "Transfer",
          "Loan advance",
          "Loan principal repayment",
          "Credit card payment",
          "Owner distribution",
          "Commission payment",
        ].includes(t.kind)
      )
        throw new Error("Unsupported classified transaction type.");
      const paired = [
        "Transfer",
        "Loan advance",
        "Loan principal repayment",
        "Credit card payment",
      ].includes(t.kind);
      expected.push({
        accountId: source.id,
        shopId: source.shopId,
        deltaCents: ["Revenue", "Bank deposit"].includes(t.kind)
          ? amount
          : -amount,
      });
      if (paired) {
        const dest = find(
          "accounts",
          t.destinationAccountId,
          t.destinationShopId ?? t.shopId,
        );
        if (dest.id === source.id)
          throw new Error("A transfer cannot use the same account twice.");
        if (dest.shopId !== source.shopId && t.kind !== "Transfer")
          throw new Error("Unsupported cross-shop financing.");
        if (
          t.kind === "Transfer" &&
          (!isCashAccount(source as any) || !isCashAccount(dest as any))
        )
          throw new Error("Invalid transfer account types.");
        if (
          t.kind === "Loan advance" &&
          (!isLiability(source as any) || !isCashAccount(dest as any))
        )
          throw new Error("Invalid loan advance accounts.");
        if (
          t.kind === "Loan principal repayment" &&
          (!isCashAccount(source as any) ||
            dest.type !== "Operating Line of Credit")
        )
          throw new Error("Invalid principal repayment accounts.");
        if (
          t.kind === "Credit card payment" &&
          (!isCashAccount(source as any) || dest.type !== "Credit Card")
        )
          throw new Error("Invalid credit-card settlement accounts.");
        expected.push({
          accountId: dest.id,
          shopId: dest.shopId,
          deltaCents: amount,
        });
      }
    }
    if (
      t.revenueCents !== revenue ||
      t.operatingExpenseCents !== expense ||
      t.commissionExpenseCents !== 0 ||
      canonical(expected) !== canonical(t.postings ?? [])
    )
      throw new Error(
        "Transaction accounting values do not match its classified event.",
      );
    if (t.managedBy === "commissionPayments") {
      const p = find("commissionPayments", t.linkedEventId, t.shopId);
      if (
        !active(p) ||
        p.transactionId !== t.id ||
        p.amountCents !== t.amountCents ||
        p.accountId !== t.accountId ||
        p.businessDate !== t.businessDate
      )
        throw new Error("Commission payment linkage mismatch.");
    }
  }
  const dayKeys = new Set<string>();
  const earningsBySale = new Map<string, Row[]>();
  for (const e of data.earnings)
    if (!e.deletedAt) {
      const key = `${e.saleId}:${e.stylistId}`;
      const list = earningsBySale.get(key) ?? [];
      list.push(e);
      earningsBySale.set(key, list);
    }
  for (const day of data.dailySales) {
    for (const a of day.stylistAllocations)
      find("stylists", a.stylistId, day.shopId);
    if (day.cashAccountId) find("accounts", day.cashAccountId, day.shopId);
    if (day.cardAccountId) find("accounts", day.cardAccountId, day.shopId);
    if (!active(day)) continue;
    const key = `${day.shopId}:${day.businessDate}`;
    if (dayKeys.has(key))
      throw new Error(
        "Two active daily records share a shop and date. Review these records before merging.",
      );
    dayKeys.add(key);
    if (day.linkedTransactionIds.length) {
      if (day.linkedTransactionIds.length !== 1)
        throw new Error("A daily sale must have one canonical event.");
      const event = find(
        "transactions",
        day.linkedTransactionIds[0],
        day.shopId,
      );
      if (
        !active(event) ||
        event.managedBy !== "dailySales" ||
        event.linkedEventId !== day.id ||
        event.businessDate !== day.businessDate
      )
        throw new Error("Daily sale linkage mismatch.");
      if (
        new Set(day.stylistAllocations.map((a: Row) => a.stylistId)).size !==
          day.stylistAllocations.length ||
        day.serviceCents !==
          addCents(...day.stylistAllocations.map((a: Row) => a.serviceCents))
      )
        throw new Error(
          "Stylist allocations do not match daily service revenue.",
        );
      for (const a of day.stylistAllocations) {
        const snapshot = day.commissionSnapshots?.find(
          (s: Row) => s.stylistId === a.stylistId,
        );
        const earned = earningsBySale.get(`${day.id}:${a.stylistId}`) ?? [];
        if (
          !snapshot ||
          earned.length !== 1 ||
          earned[0].amountCents !== snapshot.commissionCents ||
          earned[0].serviceCents !== a.serviceCents ||
          earned[0].rateBasisPoints !== snapshot.rateBasisPoints ||
          snapshot.commissionCents !==
            commissionCents(a.serviceCents, snapshot.rateBasisPoints)
        )
          throw new Error(
            "Commission earnings and snapshots do not reconcile.",
          );
      }
    }
  }
  for (const e of data.earnings) {
    const day = find("dailySales", e.saleId, e.shopId);
    find("stylists", e.stylistId, e.shopId);
    if (
      active(e) &&
      (day.deletedAt ||
        day.businessDate !== e.businessDate ||
        !day.stylistAllocations.some((a: Row) => a.stylistId === e.stylistId))
    )
      throw new Error("Orphan commission earning.");
  }
  for (const p of data.commissionPayments) {
    find("stylists", p.stylistId, p.shopId);
    find("accounts", p.accountId, p.shopId);
    const t = find("transactions", p.transactionId, p.shopId);
    if (
      active(p) &&
      (!active(t) ||
        t.managedBy !== "commissionPayments" ||
        t.linkedEventId !== p.id)
    )
      throw new Error("Orphan commission payment.");
  }
  for (const a of data.adjustments) {
    if (a.stylistId) find("stylists", a.stylistId, a.shopId);
    if (a.transactionId) {
      const t = find("transactions", a.transactionId, a.shopId);
      if (
        active(a) &&
        (!active(t) ||
          t.managedBy !== "adjustments" ||
          t.linkedEventId !== a.id)
      )
        throw new Error("Orphan adjustment event.");
    }
  }
  for (const r of data.commissionRules) find("stylists", r.stylistId, r.shopId);
  for (const b of data.openingBalances) find("accounts", b.accountId, b.shopId);
  const historical = (table: EntityTable, id: string, revision: string) => {
    const head = maps.get(table)?.get(id);
    if (head?.revision === revision) return head;
    const old = data.revisions.find(
      (r) =>
        r.id === revision &&
        canonicalTable(r.entityType) === table &&
        r.entityId === id,
    );
    return old?.payload as Row | undefined;
  };
  for (const r of data.reconciliations) {
    find("accounts", r.accountId, r.shopId);
    const keys = Object.keys(r.eventRevisions);
    if (
      new Set(r.clearedKeys).size !== r.clearedKeys.length ||
      keys.length !== r.clearedKeys.length ||
      keys.some((k) => !r.clearedKeys.includes(k))
    )
      throw new Error("Invalid reconciliation cleared-record references.");
    const account = historical("accounts", r.accountId, r.accountRevision);
    let known = !!account;
    let cleared = account?.openingBalanceCents ?? 0;
    for (const key of keys) {
      const [eventId, accountId, ...extra] = key.split(":");
      if (extra.length || accountId !== r.accountId)
        throw new Error("Invalid reconciliation movement key.");
      z.uuid().parse(eventId);
      z.uuid().parse(r.eventRevisions[key]);
      const t = historical("transactions", eventId, r.eventRevisions[key]);
      if (!t) {
        known = false;
        continue;
      }
      const p = t.postings?.find(
        (p: Row) => p.accountId === accountId && p.shopId === r.shopId,
      );
      if (
        !p ||
        t.deletedAt ||
        t.accountingStatus !== "classified" ||
        t.businessDate > r.statementDate ||
        (account && t.businessDate < account.openingDate)
      )
        throw new Error("Invalid reconciliation movement snapshot.");
      cleared = addCents(cleared, p.deltaCents);
    }
    if (
      known &&
      (r.statementDate < account!.openingDate ||
        cleared !== r.clearedBalanceCents ||
        addCents(cleared, -r.statementBalanceCents) !== r.differenceCents)
    )
      throw new Error(
        "Stored reconciliation balance does not match its account and cleared movements.",
      );
    if (r.status === "completed" && r.differenceCents !== 0)
      throw new Error("A completed reconciliation must have zero difference.");
  }
  for (const r of data.revisions) {
    const table = canonicalTable(r.entityType);
    if (!table) throw new Error("Unsupported revision entity type.");
    const payload: Row = entitySchemas[table].strict().parse(r.payload);
    if (
      canonical(payload) !== canonical(r.payload) ||
      payload.id !== r.entityId ||
      payload.revision !== r.id ||
      (table === "shops" ? payload.id : payload.shopId) !== r.shopId
    )
      throw new Error("Revision payload identity mismatch.");
    const head = maps.get(table)?.get(r.entityId);
    if (head?.revision === r.id && canonical(head) !== canonical(payload))
      throw new Error("Same revision contains different payloads.");
  }
  const revisionIds = new Map(data.revisions.map((r) => [r.id, r]));
  for (const r of data.revisions) {
    for (const parent of r.parents) {
      const p = revisionIds.get(parent);
      if (
        p &&
        (canonicalTable(p.entityType) !== canonicalTable(r.entityType) ||
          p.entityId !== r.entityId ||
          p.shopId !== r.shopId)
      )
        throw new Error("Revision ancestry crosses record identity.");
    }
    if (
      r.payload.parentRevision &&
      !r.parents.includes(r.payload.parentRevision)
    )
      throw new Error("Record parent revision disagrees with its history.");
  }
  const graph = new Map(
    data.revisions.map((r) => [r.id, r.parents as string[]]),
  );
  const degree = new Map([...graph.keys()].map((id) => [id, 0]));
  const children = new Map<string, string[]>();
  for (const [id, parents] of graph)
    for (const parent of parents)
      if (graph.has(parent)) {
        degree.set(id, degree.get(id)! + 1);
        children.set(parent, [...(children.get(parent) ?? []), id]);
      }
  const queue = [...degree].filter(([, n]) => n === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.pop()!;
    visited++;
    for (const child of children.get(id) ?? []) {
      degree.set(child, degree.get(child)! - 1);
      if (degree.get(child) === 0) queue.push(child);
    }
  }
  if (visited !== graph.size)
    throw new Error("Revision ancestry contains a cycle.");
  for (const t of data.tombstones) {
    own(t);
    const table = canonicalTable(t.entityType);
    if (!table) throw new Error("Unsupported deletion entity type.");
    const target = maps.get(table)?.get(t.entityId);
    if (target && (table === "shops" ? target.id : target.shopId) !== t.shopId)
      throw new Error("Deletion marker crosses shop ownership.");
  }
  for (const s of data.settings) {
    if (s.shopId) own(s);
    if (s.key === "theme") z.enum(["light", "dark"]).parse(s.value);
    if (s.key === "dateFormat")
      z.enum(["en-CA", "en-GB", "en-US"]).parse(s.value);
    if (s.key === "activeShop")
      z.union([z.literal("all"), z.uuid()]).parse(s.value);
    if (s.key.startsWith("financial:")) {
      if (s.key !== `financial:${s.shopId}`)
        throw new Error("Financial preferences shop mismatch.");
      financialPreferencesSchema.parse(s.value);
    }
  }
  for (const mapping of data.sourceMappings) {
    const table = canonicalTable(mapping.entityType);
    if (!table) throw new Error("Unknown source mapping entity.");
    const target = find(table, mapping.canonicalId);
    if ((table === "shops" ? target.id : target.shopId) !== mapping.shopId)
      throw new Error("Source mapping crosses shop ownership.");
  }
  for (const t of data.transactions) {
    const raw = t.source?.raw;
    if (raw && typeof raw === "object" && t.legacyFields) {
      for (const [field, alias] of Object.entries({
        income: "income",
        expense: "expense",
        bankCredit: t.source.format === "legacy-html" ? "credit" : "bankCredit",
        bankDeposit:
          t.source.format === "legacy-html" ? "deposit" : "bankDeposit",
        bankDebit: t.source.format === "legacy-html" ? "debit" : "bankDebit",
      })) {
        if (
          raw[alias] !== undefined &&
          t.legacyFields[field] !== undefined &&
          exactScaled(t.source.moneyText?.[field] ?? String(raw[alias]), 2) !==
            t.legacyFields[field]
        )
          throw new Error(
            "Preserved source fields disagree with their original monetary values.",
          );
      }
    }
  }
  for (const table of ["sourceMappings", "sourceDocuments"] as const)
    for (const row of data[table]) own(row);
  // Force checked integer aggregation independently of source-field totals.
  for (const field of [
    "amountCents",
    "serviceCents",
    "productCents",
    "cashCents",
    "cardCents",
    "openingBalanceCents",
    "revenueCents",
    "operatingExpenseCents",
    "commissionExpenseCents",
  ])
    for (const table of entityTables)
      addCents(...data[table].map((r) => r[field] ?? 0));
}
