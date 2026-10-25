import { z } from "zod";
import * as m from "../../models";
import { canonical } from "./json";
export const APP_ID = "big-boss-finance";
export const FORMAT_VERSION = 1;
export const entitySchemas = {
  shops: m.shopSchema,
  stylists: m.stylistSchema,
  accounts: m.accountSchema,
  dailySales: m.dailySaleSchema,
  transactions: m.transactionSchema,
  commissionRules: m.commissionRuleSchema,
  commissionPayments: m.commissionPaymentSchema,
  adjustments: m.adjustmentSchema,
  openingBalances: m.openingBalanceSchema,
  earnings: m.earningSchema,
  reconciliations: m.reconciliationSchema,
} as const;
export type EntityTable = keyof typeof entitySchemas;
export const entityTables = Object.keys(entitySchemas) as EntityTable[];
export const mappingSchema = z
  .object({
    id: z.string().min(1),
    shopId: z.uuid(),
    format: z.string(),
    namespace: z.string(),
    entityType: z.string(),
    originalId: z.string(),
    canonicalId: z.uuid(),
    originalRevision: z.string().optional(),
    originalRecord: z.unknown().optional(),
    originalHistory: z.array(z.unknown()).optional(),
    revisionPairs: z
      .array(z.object({ original: z.uuid(), canonical: z.uuid() }).strict())
      .optional(),
  })
  .strict();
export const documentSchema = z
  .object({
    id: z.string().min(1),
    shopId: z.uuid(),
    format: z.string(),
    namespace: z.string(),
    filename: z.string(),
    digest: z.string(),
    rawText: z.string(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const historySchema = m.importHistorySchema.extend({
  skipped: z.number().int().nonnegative().optional(),
  deleted: z.number().int().nonnegative().optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  format: z.string().optional(),
  mode: z.enum(["merge", "replace"]).optional(),
  recoveryBackupId: z.uuid().optional(),
});
export const collections = [
  ...entityTables,
  "settings",
  "revisions",
  "tombstones",
  "sourceMappings",
  "sourceDocuments",
  "importHistory",
  "backupMetadata",
] as const;
export type Collection = (typeof collections)[number];
export type Row = Record<string, any>;
export type DataSet = Record<Collection, Row[]>;
export function emptyData(): DataSet {
  return Object.fromEntries(
    collections.map((k) => [k, []]),
  ) as unknown as DataSet;
}
export const extraSchemas = {
  settings: m.settingSchema,
  revisions: m.revisionSchema,
  tombstones: m.tombstoneSchema,
  sourceMappings: mappingSchema,
  sourceDocuments: documentSchema,
  importHistory: historySchema,
  backupMetadata: m.backupSchema.omit({ payload: true }),
} as const;
const dataShape = Object.fromEntries(
  collections.map((k) => [
    k,
    z
      .array(
        (k in entitySchemas
          ? entitySchemas[k as EntityTable]
          : extraSchemas[k as keyof typeof extraSchemas]
        ).strict(),
      )
      .max(100000),
  ]),
) as unknown as Record<Collection, z.ZodArray>;
export const envelopeSchema = z
  .object({
    application: z.literal(APP_ID),
    schemaVersion: z.literal(FORMAT_VERSION),
    exportId: z.uuid(),
    exportedAt: z.iso.datetime(),
    scope: z
      .object({
        type: z.enum(["shop", "all", "backup"]),
        shopIds: z.array(z.uuid()),
        requestedShopId: z.uuid().optional(),
      })
      .strict(),
    data: z.object(dataShape).strict(),
  })
  .strict();
export interface Envelope {
  application: typeof APP_ID;
  schemaVersion: number;
  exportId: string;
  exportedAt: string;
  scope: {
    type: "shop" | "all" | "backup";
    shopIds: string[];
    requestedShopId?: string;
  };
  data: DataSet;
}
export const keyOf = (table: Collection, row: Row) =>
  String(table === "settings" ? row.key : row.id);
export function sortedData(data: DataSet): DataSet {
  return Object.fromEntries(
    collections.map((k) => [
      k,
      [...data[k]].sort((a, b) => keyOf(k, a).localeCompare(keyOf(k, b))),
    ]),
  ) as DataSet;
}
export function canonicalTable(name: string): EntityTable | undefined {
  return (
    (
      {
        shop: "shops",
        stylist: "stylists",
        account: "accounts",
        commissionRule: "commissionRules",
      } as Record<string, EntityTable>
    )[name] ??
    (entityTables.includes(name as EntityTable)
      ? (name as EntityTable)
      : undefined)
  );
}
export const sourceFields = [
  "income",
  "expense",
  "bankCredit",
  "bankDeposit",
  "bankDebit",
] as const;
export function sourceTotals(data: DataSet, shopIds?: string[]) {
  const result = Object.fromEntries(sourceFields.map((k) => [k, 0])) as Record<
    (typeof sourceFields)[number],
    number
  >;
  for (const row of data.transactions) {
    if (shopIds && !shopIds.includes(row.shopId)) continue;
    for (const key of sourceFields) {
      const amount = row.legacyFields?.[key] ?? 0;
      const sum = BigInt(result[key]) + BigInt(amount);
      if (
        sum > BigInt(Number.MAX_SAFE_INTEGER) ||
        sum < BigInt(Number.MIN_SAFE_INTEGER)
      )
        throw new Error("Source totals exceed safe cent range.");
      result[key] = Number(sum);
    }
  }
  return result;
}
export function financialTotals(data: DataSet) {
  const result: Record<string, string> = {};
  for (const table of entityTables) {
    const relevant = data[table].map((row) => {
      const amounts: Row = {
        id: row.id,
        shopId: row.shopId,
        deletedAt: row.deletedAt,
      };
      for (const [key, value] of Object.entries(row))
        if (
          /Cents$|BasisPoints$/.test(key) ||
          [
            "legacyFields",
            "postings",
            "stylistAllocations",
            "commissionSnapshots",
          ].includes(key)
        )
          amounts[key] = value;
      return amounts;
    });
    result[table] = canonical(
      relevant.sort((a, b) => a.id.localeCompare(b.id)),
    );
  }
  return result;
}

export function normalizedTotals(data: DataSet, shopIds?: string[]) {
  const records = (table: Collection) =>
    data[table].filter(
      (r) => !r.deletedAt && (!shopIds || shopIds.includes(r.shopId)),
    );
  const sum = (rows: Row[], field: string) => {
    const total = rows.reduce(
      (value, row) => value + BigInt(row[field] ?? 0),
      0n,
    );
    if (
      total > BigInt(Number.MAX_SAFE_INTEGER) ||
      total < BigInt(Number.MIN_SAFE_INTEGER)
    )
      throw new Error("Financial totals exceed the supported range.");
    return Number(total);
  };
  const tx = records("transactions").filter(
    (t) => t.accountingStatus === "classified",
  );
  return {
    "Recognized revenue": sum(tx, "revenueCents"),
    "Recorded operating expenses": sum(tx, "operatingExpenseCents"),
    "Commissions earned (recognized)": sum(tx, "commissionExpenseCents"),
    "Commission payments": sum(records("commissionPayments"), "amountCents"),
    "Settlement adjustments": sum(records("adjustments"), "amountCents"),
    "Daily service amounts (including unposted)": sum(
      records("dailySales"),
      "serviceCents",
    ),
    "Product sale amounts (including unposted)": sum(
      records("dailySales"),
      "productCents",
    ),
  };
}
