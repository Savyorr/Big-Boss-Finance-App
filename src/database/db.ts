import Dexie, { type Table } from "dexie";
import type { z } from "zod";
import {
  type Shop,
  type Stylist,
  type Account,
  type Transaction,
  type DailySale,
  type Setting,
  type Revision,
  commissionRuleSchema,
  commissionPaymentSchema,
  adjustmentSchema,
  openingBalanceSchema,
  importHistorySchema,
  tombstoneSchema,
  backupSchema,
  earningSchema,
  reconciliationSchema,
} from "../models";
export const schemaV1 = {
  shops: "id,status,name",
  stylists: "id,shopId,[shopId+status]",
  accounts: "id,shopId,[shopId+status]",
  transactions: "id,shopId,[shopId+businessDate],[shopId+kind]",
  dailySales: "id,shopId,[shopId+businessDate]",
  commissionRules: "id,shopId,[shopId+stylistId]",
  commissionPayments: "id,shopId,[shopId+stylistId]",
  adjustments: "id,shopId",
  openingBalances: "id,shopId,[shopId+accountId]",
  settings: "key,shopId",
  importHistory: "id,importedAt,digest",
  revisions: "id,shopId,[entityType+entityId]",
  tombstones: "id,shopId,[entityType+entityId]",
  backups: "id,createdAt",
};
export const schemaV2 = {
  ...schemaV1,
  earnings: "id,shopId,saleId,[shopId+stylistId],[shopId+businessDate]",
  reconciliations: "id,shopId,[shopId+accountId],statementDate",
  transactions: "id,shopId,[shopId+businessDate],[shopId+kind],managedBy",
};
export const schemaV3 = {
  ...schemaV2,
  sourceMappings: "id,shopId,[format+namespace+originalId]",
  sourceDocuments: "id,shopId,digest",
};
export class FinanceDatabase extends Dexie {
  sourceMappings!: Table<Record<string, any>, string>;
  sourceDocuments!: Table<Record<string, any>, string>;
  earnings!: Table<z.infer<typeof earningSchema>, string>;
  reconciliations!: Table<z.infer<typeof reconciliationSchema>, string>;
  shops!: Table<Shop, string>;
  stylists!: Table<Stylist, string>;
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  dailySales!: Table<DailySale, string>;
  settings!: Table<Setting, string>;
  revisions!: Table<Revision, string>;
  commissionRules!: Table<z.infer<typeof commissionRuleSchema>, string>;
  commissionPayments!: Table<z.infer<typeof commissionPaymentSchema>, string>;
  adjustments!: Table<z.infer<typeof adjustmentSchema>, string>;
  openingBalances!: Table<z.infer<typeof openingBalanceSchema>, string>;
  importHistory!: Table<z.infer<typeof importHistorySchema>, string>;
  tombstones!: Table<z.infer<typeof tombstoneSchema>, string>;
  backups!: Table<z.infer<typeof backupSchema>, string>;
  constructor(name = "big-boss-finance") {
    super(name);
    this.version(1).stores(schemaV1);
    // Additive only: preserve all v1 payloads. Unclassified v1 transactions are review items.
    this.version(2).stores(schemaV2);
    this.version(3).stores(schemaV3);
  }
}
export const db = new FinanceDatabase();
