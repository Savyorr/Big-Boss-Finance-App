import { z } from "zod";
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Enter a valid date");
export const cents = z
  .number()
  .int()
  .refine(Number.isSafeInteger, "Amount exceeds supported range");
const timestamp = z.iso.datetime();
const base = {
  id: z.uuid(),
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: z.uuid(),
  revisionNumber: z.number().int().positive().optional(),
  parentRevision: z.uuid().optional(),
  deletedAt: timestamp.optional(),
};
export const owned = {
  ...base,
  shopId: z.uuid(),
  source: z
    .object({
      format: z.string(),
      originalId: z.string().optional(),
      raw: z.unknown().optional(),
      moneyText: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
};
export const shopInputSchema = z.object({
  name: z.string().trim().min(1, "Shop name is required").max(100),
  address: z.string().trim().max(300),
  contact: z.string().trim().max(200),
});
export const shopSchema = shopInputSchema.extend({
  ...base,
  status: z.enum(["active", "archived"]),
});
export const stylistInputSchema = z.object({
  name: z.string().trim().min(1, "Stylist name is required").max(100),
  commissionBasisPoints: z.number().int().min(0).max(10000),
  status: z.enum(["active", "inactive"]),
});
export const stylistSchema = stylistInputSchema.extend(owned);
export const accountTypes = [
  "Chequing",
  "Savings",
  "Cash",
  "Petty Cash",
  "Credit Card",
  "Operating Line of Credit",
  "Other",
] as const;
export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Account name is required").max(100),
  type: z.enum(accountTypes),
  openingBalanceCents: cents,
  openingDate: dateOnly,
  status: z.enum(["active", "archived"]),
});
export const accountSchema = accountInputSchema.extend({
  ...owned,
  currency: z.literal("CAD").optional(),
});
export const transactionKinds = [
  "Revenue",
  "Operating expense",
  "Bank deposit",
  "Bank withdrawal",
  "Transfer",
  "Loan advance",
  "Loan principal repayment",
  "Credit card payment",
  "Commission expense",
  "Commission payment",
  "Owner distribution",
  "Opening balance",
  "Loan interest",
  "Adjustment",
  "Needs review",
] as const;
export const transactionSchema = z.object({
  ...owned,
  businessDate: dateOnly,
  kind: z.enum(transactionKinds),
  amountCents: cents,
  accountId: z.uuid().optional(),
  category: z.string(),
  payee: z.string(),
  description: z.string(),
  paymentMethod: z.string(),
  notes: z.string(),
  linkedEventId: z.uuid().optional(),
  currency: z.literal("CAD").optional(),
  revisionNumber: z.number().int().positive().optional(),
  destinationAccountId: z.uuid().optional(),
  destinationShopId: z.uuid().optional(),
  stylistId: z.uuid().optional(),
  managedBy: z
    .enum(["dailySales", "commissionPayments", "adjustments"])
    .optional(),
  accountingStatus: z.enum(["classified", "review"]).optional(),
  revenueCents: cents.optional(),
  operatingExpenseCents: cents.optional(),
  commissionExpenseCents: cents.optional(),
  postings: z
    .array(
      z.object({ accountId: z.uuid(), shopId: z.uuid(), deltaCents: cents }),
    )
    .optional(),
  legacyFields: z
    .object({
      income: cents.optional(),
      expense: cents.optional(),
      bankCredit: cents.optional(),
      bankDeposit: cents.optional(),
      bankDebit: cents.optional(),
    })
    .optional(),
});
export const dailySaleSchema = z.object({
  ...owned,
  businessDate: dateOnly,
  serviceCents: cents,
  productCents: cents,
  cashCents: cents,
  cardCents: cents,
  notes: z.string(),
  stylistAllocations: z.array(
    z.object({ stylistId: z.uuid(), serviceCents: cents }),
  ),
  linkedTransactionIds: z.array(z.uuid()),
  currency: z.literal("CAD").optional(),
  cashAccountId: z.uuid().optional(),
  cardAccountId: z.uuid().optional(),
  cashVerified: z.boolean().optional(),
  calculatedCashCents: cents.optional(),
  legacyTotalCents: cents.optional(),
  legacyDepositCents: cents.optional(),
  commissionSnapshots: z
    .array(
      z.object({
        stylistId: z.uuid(),
        rateBasisPoints: z.number().int().min(0).max(10000),
        commissionCents: cents,
      }),
    )
    .optional(),
});
export const commissionRuleSchema = z.object({
  ...owned,
  stylistId: z.uuid(),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.optional(),
  rateBasisPoints: z.number().int().min(0).max(10000),
  basis: z.literal("eligible-service-revenue"),
  rounding: z.enum(["half-up", "half-even"]),
});
export const commissionPaymentSchema = z.object({
  ...owned,
  stylistId: z.uuid(),
  accountId: z.uuid(),
  businessDate: dateOnly,
  amountCents: cents,
  transactionId: z.uuid(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  periodMode: z.enum(["calendar", "legacy"]).optional(),
});
export const adjustmentSchema = z.object({
  ...owned,
  stylistId: z.uuid().optional(),
  businessDate: dateOnly,
  amountCents: cents,
  reason: z.string().trim().min(1),
  transactionId: z.uuid().optional(),
  adjustmentKind: z
    .enum([
      "Correction",
      "Advance reclassification",
      "Deduction",
      "Previously settled",
      "Other",
    ])
    .optional(),
  periodMode: z.enum(["calendar", "legacy"]).optional(),
});
export const openingBalanceSchema = z.object({
  ...owned,
  accountId: z.uuid(),
  businessDate: dateOnly,
  amountCents: cents,
});
export const settingSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  shopId: z.uuid().optional(),
});
export const importHistorySchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  importedAt: timestamp,
  shopIds: z.array(z.uuid()),
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  result: z.enum(["applied", "rejected"]),
  skipped: z.number().int().nonnegative().optional(),
  deleted: z.number().int().nonnegative().optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  format: z.string().optional(),
  mode: z.enum(["merge", "replace"]).optional(),
  recoveryBackupId: z.uuid().optional(),
  backupId: z.uuid(),
  digest: z.string(),
});
export const revisionSchema = z.object({
  id: z.uuid(),
  entityType: z.string(),
  entityId: z.uuid(),
  shopId: z.uuid(),
  parents: z.array(z.uuid()),
  createdAt: timestamp,
  payload: z.unknown(),
});
export const tombstoneSchema = z.object({
  ...owned,
  entityType: z.string(),
  entityId: z.uuid(),
});
export const backupSchema = z.object({
  id: z.uuid(),
  createdAt: timestamp,
  reason: z.string(),
  schemaVersion: z.number().int().positive(),
  shopIds: z.array(z.uuid()),
  payload: z.unknown().optional(),
});
export type Shop = z.infer<typeof shopSchema>;
export type Stylist = z.infer<typeof stylistSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type DailySale = z.infer<typeof dailySaleSchema>;
export type Setting = z.infer<typeof settingSchema>;
export type Revision = z.infer<typeof revisionSchema>;
export type ShopScope = string | "all";

export const earningSchema = z.object({
  ...owned,
  saleId: z.uuid(),
  stylistId: z.uuid(),
  businessDate: dateOnly,
  serviceCents: cents,
  rateBasisPoints: z.number().int().min(0).max(10000),
  amountCents: cents,
});
export const reconciliationSchema = z.object({
  ...owned,
  accountId: z.uuid(),
  statementDate: dateOnly,
  statementBalanceCents: cents,
  clearedKeys: z.array(z.string()),
  clearedBalanceCents: cents,
  differenceCents: cents,
  status: z.enum(["completed", "in-progress"]),
  accountRevision: z.uuid(),
  eventRevisions: z.record(z.string(), z.string()),
});
export type Earning = z.infer<typeof earningSchema>;
export type CommissionPayment = z.infer<typeof commissionPaymentSchema>;
export type Adjustment = z.infer<typeof adjustmentSchema>;
export type CommissionRule = z.infer<typeof commissionRuleSchema>;
export type Reconciliation = z.infer<typeof reconciliationSchema>;
