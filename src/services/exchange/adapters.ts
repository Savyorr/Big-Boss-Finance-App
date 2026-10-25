import { z } from "zod";
import {
  parseJson,
  moneyAt,
  canonical,
  digest,
  stableId,
  exactScaled,
  type ParsedJson,
} from "./json";
import {
  emptyData,
  envelopeSchema,
  FORMAT_VERSION,
  APP_ID,
  type DataSet,
  type Envelope,
  type EntityTable,
  type Row,
} from "./schema";
import { dateOnly } from "../../models";
import {
  addCents,
  commissionCents,
  moneyInput,
} from "../../calculations/money";
const unknownTime = "1970-01-01T00:00:00.000Z";
const amount = z.union([z.number(), z.string()]);
const legacyTransaction = z
  .object({
    id: z.string().min(1),
    date: dateOnly,
    type: z.string(),
    category: z.string(),
    payee: z.string(),
    details: z.string(),
    income: amount,
    expense: amount,
    bankCredit: amount,
    bankDeposit: amount,
    bankDebit: amount,
    notes: z.string(),
  })
  .passthrough();
const legacyASchema = z
  .object({
    app: z.string().min(1),
    version: z.literal(1),
    exportedAt: z.iso.datetime().optional(),
    transactions: z.array(legacyTransaction).max(100000),
  })
  .passthrough();
const htmlTxSchema = z
  .object({
    id: z.string().min(1),
    date: dateOnly,
    account: z.string(),
    cat: z.string(),
    sub: z.string().optional(),
    name: z.string(),
    details: z.string(),
    income: amount,
    expense: amount,
    credit: amount,
    deposit: amount,
    debit: amount,
  })
  .passthrough();
const htmlDaySchema = z
  .object({
    date: dateOnly,
    total: amount,
    card: amount,
    deposit: amount.optional(),
    sales: z.record(z.string(), amount),
    notes: z.string().optional(),
  })
  .passthrough();
const htmlSchema = z
  .object({
    days: z.array(htmlDaySchema).max(100000),
    tx: z.array(htmlTxSchema).max(100000),
    staff: z.array(z.string().min(1)).max(10000),
    open: amount,
    bal: z
      .object({
        asOf: dateOnly,
        items: z.array(z.object({ n: z.string(), v: amount }).passthrough()),
        limit: amount.optional(),
      })
      .passthrough()
      .optional(),
    adj: z
      .array(
        z
          .object({
            id: z.string().min(1),
            date: dateOnly,
            name: z.string().min(1),
            amt: amount,
            note: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export interface PrepareOptions {
  targetShopId?: string;
  namespace?: string;
  filename?: string;
}
export interface PreparedDocument {
  appliedMapping?: Record<string, string>;
  ambiguousMappingIds?: string[];
  sourceShops?: { id: string; name: string }[];
  filename?: string;
  format: "modern" | "legacy-transactions" | "legacy-html";
  schemaVersion: number;
  exportedAt?: string;
  exportId?: string;
  data: DataSet;
  shopIds: string[];
  namespace?: string;
  warnings: string[];
  digest: string;
  sourceCount: number;
  requestedShopId?: string;
}
function validateNumbers(parsed: ParsedJson) {
  for (const [path, token] of parsed.numbers) {
    const key = path.slice(path.lastIndexOf("/") + 1);
    const n = Number(token);
    if (
      /Cents$|BasisPoints$/.test(key) ||
      ["revisionNumber", "schemaVersion"].includes(key) ||
      Number.isInteger(n)
    )
      exactScaled(token, 0);
  }
}
export async function prepareDocument(
  text: string,
  options: PrepareOptions = {},
): Promise<PreparedDocument> {
  const parsed = parseJson(text);
  const root = parsed.value;
  const hash = await digest(text);
  if (!root || typeof root !== "object" || Array.isArray(root))
    throw new Error("The file must contain a supported backup object.");
  if (root.application === APP_ID) {
    if (root.schemaVersion !== FORMAT_VERSION)
      throw new Error(
        `Unsupported modern schema version ${String(root.schemaVersion)}. No changes were made.`,
      );
    validateNumbers(parsed);
    const checked = envelopeSchema.parse(root);
    if (canonical(checked) !== canonical(root))
      throw new Error(
        "Modern backup contains unknown or lossy nested fields. Use a supported schema; no fields were discarded.",
      );
    const envelope = checked as unknown as Envelope;
    for (const doc of envelope.data.sourceDocuments)
      if ((await digest(doc.rawText)) !== doc.digest)
        throw new Error(
          "Source document checksum does not match its retained contents.",
        );
    return {
      format: "modern",
      sourceShops: envelope.data.shops.map((s) => ({ id: s.id, name: s.name })),
      schemaVersion: FORMAT_VERSION,
      exportId: envelope.exportId,
      exportedAt: envelope.exportedAt,
      data: envelope.data,
      shopIds: envelope.scope.shopIds,
      requestedShopId: envelope.scope.requestedShopId,
      warnings: [],
      digest: hash,
      sourceCount: envelope.data.transactions.length,
    };
  }
  const format = Array.isArray(root.transactions)
    ? "legacy-transactions"
    : Array.isArray(root.days) && Array.isArray(root.tx)
      ? "legacy-html"
      : undefined;
  if (!format)
    throw new Error(
      "Unsupported JSON format. Expected a Big Boss transaction backup, HTML state backup, or modern export.",
    );
  if (!options.targetShopId)
    throw new Error("Select a target shop for this legacy file.");
  z.uuid().parse(options.targetShopId);
  const target = options.targetShopId;
  const namespace =
    options.namespace?.trim() ||
    (format === "legacy-transactions"
      ? String(root.app ?? "Big Boss Hair Salon Finance")
      : "bigboss-salon-v2");
  if (namespace.length > 200) throw new Error("Dataset label is too long.");
  const data = emptyData();
  const warnings = [
    "Legacy data has no revision ancestry. Changed source records require conflict review. Different legacy formats may overlap; they are never automatically deduplicated against one another.",
  ];
  const ids = new Map<string, string>();
  const seen = new Set<string>();
  async function idFor(table: EntityTable, original: string) {
    const key = `${table}:${original}`;
    if (ids.has(key)) return ids.get(key)!;
    const id = await stableId(`${format}|${namespace}|${target}|${key}`);
    ids.set(key, id);
    data.sourceMappings.push({
      id: `${format}:${namespace}:${target}:${key}`,
      shopId: target,
      format,
      namespace,
      entityType: table,
      originalId: original,
      canonicalId: id,
    });
    return id;
  }
  async function record(
    table: EntityTable,
    original: string,
    values: Row,
    raw: unknown,
  ) {
    const id = await idFor(table, original);
    if (seen.has(`${table}:${original}`))
      throw new Error(`Duplicate source identifier in ${table}: ${original}`);
    seen.add(`${table}:${original}`);
    const revision = await stableId(
      `${id}:${canonical(values)}:${canonical(raw)}`,
    );
    const row = {
      id,
      shopId: target,
      createdAt: unknownTime,
      updatedAt: unknownTime,
      revision,
      ...values,
      source: {
        format,
        originalId: original,
        raw,
        ...(values.legacyFields
          ? {
              moneyText: Object.fromEntries(
                Object.entries(values.legacyFields).map(([field, value]) => [
                  field,
                  moneyInput(value as number),
                ]),
              ),
            }
          : {}),
      },
    };
    data[table].push(row);
    data.revisions.push({
      id: revision,
      entityType: table,
      entityId: id,
      shopId: target,
      parents: [],
      createdAt: unknownTime,
      payload: row,
    });
    return row;
  }
  const amountAt = (path: string, value: unknown) =>
    moneyAt(parsed, path, value);
  if (format === "legacy-transactions") {
    const legacy = legacyASchema.parse(root);
    for (let i = 0; i < legacy.transactions.length; i++) {
      const t = legacy.transactions[i],
        fields = {
          income: 0,
          expense: 0,
          bankCredit: 0,
          bankDeposit: 0,
          bankDebit: 0,
        };
      for (const k of Object.keys(fields) as (keyof typeof fields)[])
        fields[k] = amountAt(`/transactions/${i}/${k}`, t[k]);
      await record(
        "transactions",
        t.id,
        {
          businessDate: t.date,
          kind: "Needs review",
          amountCents: 0,
          category: t.category,
          payee: t.payee,
          description: t.details,
          paymentMethod: "Unknown legacy method",
          notes: t.notes,
          currency: "CAD",
          accountingStatus: "review",
          revenueCents: 0,
          operatingExpenseCents: 0,
          commissionExpenseCents: 0,
          postings: [],
          legacyFields: fields,
        },
        t,
      );
    }
    warnings.push(
      "All legacy transactions are preserved for classification review. No account, profit classification, or stylist-level sales has been invented.",
    );
  } else {
    const html = htmlSchema.parse(root);
    if (new Set(html.staff).size !== html.staff.length)
      throw new Error("Duplicate staff names in HTML backup need review.");
    const allNames = [
      ...new Set([
        ...html.staff,
        ...html.days.flatMap((d) => Object.keys(d.sales)),
        ...(html.adj ?? []).map((a) => a.name),
      ]),
    ].filter((n) => n !== "Sale Product");
    for (const name of allNames) {
      const stylist = await record(
        "stylists",
        name,
        { name, commissionBasisPoints: 5000, status: "active" },
        { name, listedInStaff: html.staff.includes(name) },
      );
      await record(
        "commissionRules",
        `${name}:baseline`,
        {
          stylistId: stylist.id,
          effectiveFrom: "0001-01-01",
          rateBasisPoints: 5000,
          basis: "eligible-service-revenue",
          rounding: "half-up",
        },
        { legacyRate: "50% of service revenue; no product commission" },
      );
    }
    for (let i = 0; i < html.tx.length; i++) {
      const t = html.tx[i];
      await record(
        "transactions",
        t.id,
        {
          businessDate: t.date,
          kind: "Needs review",
          amountCents: 0,
          category: t.cat,
          payee: t.name,
          description: t.details,
          paymentMethod: "Unknown legacy method",
          notes: "Legacy account and subcategory retained in source metadata.",
          currency: "CAD",
          accountingStatus: "review",
          revenueCents: 0,
          operatingExpenseCents: 0,
          commissionExpenseCents: 0,
          postings: [],
          legacyFields: {
            income: amountAt(`/tx/${i}/income`, t.income),
            expense: amountAt(`/tx/${i}/expense`, t.expense),
            bankCredit: amountAt(`/tx/${i}/credit`, t.credit),
            bankDeposit: amountAt(`/tx/${i}/deposit`, t.deposit),
            bankDebit: amountAt(`/tx/${i}/debit`, t.debit),
          },
        },
        t,
      );
    }
    for (let i = 0; i < html.days.length; i++) {
      const d = html.days[i];
      const allocations = [];
      for (const [name, value] of Object.entries(d.sales))
        if (name !== "Sale Product") {
          const serviceCents = amountAt(
            `/days/${i}/sales/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`,
            value,
          );
          if (serviceCents < 0)
            throw new Error(
              "Negative legacy service revenue needs explicit migration review.",
            );
          allocations.push({
            stylistId: await idFor("stylists", name),
            serviceCents,
          });
        }
      const service = addCents(...allocations.map((a) => a.serviceCents));
      const product =
        d.sales["Sale Product"] !== undefined
          ? amountAt(`/days/${i}/sales/Sale Product`, d.sales["Sale Product"])
          : 0;
      const total = amountAt(`/days/${i}/total`, d.total),
        card = amountAt(`/days/${i}/card`, d.card);
      const day = await record(
        "dailySales",
        d.date,
        {
          businessDate: d.date,
          serviceCents: service,
          productCents: product,
          cardCents: card,
          cashCents: addCents(total, -card),
          calculatedCashCents: addCents(total, -card),
          cashVerified: false,
          legacyTotalCents: total,
          legacyDepositCents:
            d.deposit === undefined
              ? 0
              : amountAt(`/days/${i}/deposit`, d.deposit),
          notes: d.notes ?? "",
          stylistAllocations: allocations,
          linkedTransactionIds: [],
          currency: "CAD",
        },
        d,
      );
      // Preserve original aggregate rounding: do not manufacture per-day commission earnings or receiving accounts.
      if (total !== addCents(service, product))
        warnings.push(
          `Saved daily total differs from row totals on ${d.date}; both are retained.`,
        );
      void day;
    }
    for (let i = 0; i < (html.adj ?? []).length; i++) {
      const a = html.adj![i];
      await record(
        "adjustments",
        a.id,
        {
          stylistId: await idFor("stylists", a.name),
          businessDate: a.date,
          amountCents: amountAt(`/adj/${i}/amt`, a.amt),
          reason:
            a.note?.trim() || "Legacy adjustment (no explanation supplied)",
          adjustmentKind: "Other",
          periodMode: "legacy",
        },
        a,
      );
    }
    // Embedded balance snapshots have unspecified account semantics; preserve them without fabricating balances.
    amountAt("/open", html.open);
    if (html.bal) {
      html.bal.items.forEach((b, i) => amountAt(`/bal/items/${i}/v`, b.v));
      if (html.bal.limit !== undefined) amountAt("/bal/limit", html.bal.limit);
    }
    data.settings.push({
      key: `legacy:${target}:${await digest(namespace)}`,
      shopId: target,
      value: {
        format,
        namespace,
        staff: html.staff,
        open: html.open,
        openCents: amountAt("/open", html.open),
        balanceItems: (html.bal?.items ?? []).map((item, i) => ({
          name: item.n,
          amountCents: amountAt(`/bal/items/${i}/v`, item.v),
        })),
        bal: html.bal ?? null,
        bankValuesNeedReview: true,
      },
    });
    warnings.push(
      "HTML daily sales, staff, adjustments, bank snapshots and unsupported fields are preserved. Account assignments and saved daily totals require review before posting. Historical aggregate commission rounding is not replaced with invented daily earnings.",
    );
  }
  data.sourceDocuments.push({
    id: `${hash}:${target}:${await digest(namespace)}`,
    shopId: target,
    format,
    namespace,
    filename: options.filename ?? "backup.json",
    digest: hash,
    rawText: text,
    createdAt: unknownTime,
  });
  return {
    format,
    schemaVersion: format === "legacy-transactions" ? 1 : 0,
    exportedAt: root.exportedAt,
    data,
    shopIds: [target],
    namespace,
    warnings,
    digest: hash,
    sourceCount:
      format === "legacy-transactions"
        ? root.transactions.length
        : root.tx.length,
  };
}
