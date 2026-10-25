import { z } from "zod";
import { db, type FinanceDatabase } from "../database/db";
import {
  owned,
  transactionSchema,
  dailySaleSchema,
  earningSchema,
  commissionPaymentSchema,
  adjustmentSchema,
  reconciliationSchema,
  dateOnly,
  cents,
  type Transaction,
  type DailySale,
} from "../models";
import {
  financialInputSchema,
  saleInputSchema,
  paymentInputSchema,
  adjustmentInputSchema,
  type FinancialInput,
  type SaleInput,
  type PaymentInput,
  type AdjustmentInput,
} from "../models/financial-inputs";
import { addCents, commissionCents } from "../calculations/money";
import {
  isCashAccount,
  isLiability,
  reconciliationState,
  type FinanceData,
} from "../calculations/finance";
export interface SaveOptions {
  id?: string;
  expectedRevision?: string;
  createId?: string;
}
export const newMeta = (id: string = crypto.randomUUID()) => {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    revision: crypto.randomUUID(),
    revisionNumber: 1,
  };
};
export async function readFinance(
  database: FinanceDatabase = db,
): Promise<FinanceData> {
  return database.transaction("r", database.tables, async () => ({
    accounts: await database.accounts.toArray(),
    transactions: await database.transactions.toArray(),
    dailySales: await database.dailySales.toArray(),
    earnings: await database.earnings.toArray(),
    payments: await database.commissionPayments.toArray(),
    adjustments: await database.adjustments.toArray(),
    stylists: await database.stylists.toArray(),
    reconciliations: await database.reconciliations.toArray(),
  }));
}
export function createFinanceService(database: FinanceDatabase) {
  const atomic = <T>(fn: () => Promise<T>) =>
    database.transaction("rw", database.tables, fn);
  const requireShop = async (id: string) => {
    z.uuid().parse(id);
    const shop = await database.shops.get(id);
    if (!shop || shop.status !== "active")
      throw new Error("Select an active shop.");
  };
  const accountFor = async (id: string | undefined, shopId: string) => {
    if (!id) throw new Error("Select an account.");
    const account = await database.accounts.get(id);
    if (
      !account ||
      account.shopId !== shopId ||
      account.status !== "active" ||
      account.deletedAt
    )
      throw new Error("Choose an active account owned by the selected shop.");
    return account;
  };
  const stylistFor = async (id: string, shopId: string) => {
    const stylist = await database.stylists.get(id);
    if (!stylist || stylist.shopId !== shopId || stylist.deletedAt)
      throw new Error("Stylist does not belong to this shop.");
    return stylist;
  };
  async function previous(table: string, shopId: string, options: SaveOptions) {
    const existing = await database
      .table(table)
      .get(options.id ?? options.createId ?? "");
    if (options.id) {
      if (!existing || existing.shopId !== shopId || existing.deletedAt)
        throw new Error("Record does not belong to this shop or was deleted.");
      if (existing.revision !== options.expectedRevision)
        throw new Error("This record changed. Reopen it before saving.");
      return existing;
    }
    if (existing)
      throw new Error(
        "This operation was already saved. Refresh the history before retrying.",
      );
    return undefined;
  }
  function metadata(
    old:
      | {
          id: string;
          createdAt: string;
          revision: string;
          revisionNumber?: number;
        }
      | undefined,
    createId?: string,
  ) {
    return old
      ? {
          ...old,
          parentRevision: old.revision,
          revision: crypto.randomUUID(),
          revisionNumber: addCents(old.revisionNumber ?? 1, 1),
          updatedAt: new Date().toISOString(),
        }
      : newMeta(createId);
  }
  async function audited(
    table: string,
    record: z.infer<z.ZodObject<typeof owned>>,
  ) {
    await database.table(table).put(record);
    await database.revisions.add({
      id: record.revision,
      shopId: record.shopId,
      entityType: table,
      entityId: record.id,
      parents: record.parentRevision ? [record.parentRevision] : [],
      createdAt: record.updatedAt,
      payload: record,
    });
  }
  async function event(
    input: Partial<Transaction> &
      Pick<
        Transaction,
        | "id"
        | "shopId"
        | "businessDate"
        | "kind"
        | "amountCents"
        | "description"
      >,
  ) {
    const old = await database.transactions.get(input.id);
    if (old && old.shopId !== input.shopId)
      throw new Error("Event ownership mismatch.");
    const record = transactionSchema.parse({
      ...metadata(old, input.id),
      category: "Uncategorized",
      payee: "",
      paymentMethod: "Other",
      notes: "",
      currency: "CAD",
      accountingStatus: "classified",
      revenueCents: 0,
      operatingExpenseCents: 0,
      commissionExpenseCents: 0,
      postings: [],
      ...input,
    });
    const combined = new Map<
      string,
      NonNullable<Transaction["postings"]>[number]
    >();
    for (const p of record.postings ?? []) {
      const prior = combined.get(p.accountId);
      combined.set(p.accountId, {
        ...p,
        deltaCents: addCents(prior?.deltaCents ?? 0, p.deltaCents),
      });
    }
    record.postings = [...combined.values()];
    await audited("transactions", record);
    return record;
  }
  async function remove(table: string, record: any) {
    const changed = {
      ...record,
      ...metadata(record),
      deletedAt: new Date().toISOString(),
    };
    await audited(table, changed);
    await database.tombstones.add({
      ...newMeta(),
      shopId: record.shopId,
      entityType: table,
      entityId: record.id,
    });
  }
  async function removeEarnings(saleId: string) {
    for (const row of await database.earnings
      .where("saleId")
      .equals(saleId)
      .toArray())
      if (!row.deletedAt) await remove("earnings", row);
  }
  return {
    async saveTransaction(raw: FinancialInput, options: SaveOptions = {}) {
      const input = financialInputSchema.parse(raw);
      return atomic(async () => {
        await requireShop(input.shopId);
        const old = await previous("transactions", input.shopId, options);
        if (old?.managedBy)
          throw new Error(
            "Edit this linked record from its sales or commission workspace.",
          );
        if (
          [
            "Commission payment",
            "Commission expense",
            "Opening balance",
          ].includes(input.kind)
        )
          throw new Error(
            "Use the commission workspace or account opening balance for this entry.",
          );
        if (input.kind === "Adjustment")
          throw new Error(
            "Use commission adjustments for settlement corrections, or Needs review for unclassified source entries.",
          );
        if (input.kind === "Needs review" && input.accountId)
          await accountFor(input.accountId, input.shopId);
        if (input.stylistId) await stylistFor(input.stylistId, input.shopId);
        const source =
          input.kind === "Needs review"
            ? undefined
            : await accountFor(input.accountId, input.shopId);
        const postings: NonNullable<Transaction["postings"]> = [];
        let revenueCents = 0,
          operatingExpenseCents = 0;
        const twoSided = [
          "Transfer",
          "Loan advance",
          "Loan principal repayment",
          "Credit card payment",
        ].includes(input.kind);
        if (
          !twoSided &&
          (input.destinationAccountId || input.destinationShopId)
        )
          throw new Error(
            "A destination is only valid for paired account movements.",
          );
        const destination = twoSided
          ? await accountFor(
              input.destinationAccountId,
              input.destinationShopId ?? input.shopId,
            )
          : undefined;
        if (destination) {
          await requireShop(destination.shopId);
          if (source!.id === destination.id)
            throw new Error("Source and destination accounts must differ.");
          if (destination.shopId !== input.shopId && input.kind !== "Transfer")
            throw new Error("Only explicit transfers may cross locations.");
        }
        if (source) {
          const incoming = ["Revenue", "Bank deposit"].includes(input.kind);
          if (input.kind === "Revenue") revenueCents = input.amountCents;
          if (["Operating expense", "Loan interest"].includes(input.kind))
            operatingExpenseCents = input.amountCents;
          if (
            input.kind === "Loan advance" &&
            (!isLiability(source) ||
              !destination ||
              !isCashAccount(destination))
          )
            throw new Error(
              "A loan advance moves from a liability account into cash or bank.",
            );
          if (
            input.kind === "Loan principal repayment" &&
            (!isCashAccount(source) ||
              destination?.type !== "Operating Line of Credit")
          )
            throw new Error(
              "Principal repayment moves from cash or bank into a loan account.",
            );
          if (
            input.kind === "Credit card payment" &&
            (!isCashAccount(source) || destination?.type !== "Credit Card")
          )
            throw new Error(
              "Credit card payments move from cash or bank into a credit card account.",
            );
          if (
            input.kind === "Transfer" &&
            (!isCashAccount(source) ||
              !destination ||
              !isCashAccount(destination))
          )
            throw new Error(
              "Use loan or credit card payment types for liability movements. Transfers require cash or bank accounts.",
            );
          postings.push({
            accountId: source.id,
            shopId: source.shopId,
            deltaCents: incoming ? input.amountCents : -input.amountCents,
          });
          if (destination)
            postings.push({
              accountId: destination.id,
              shopId: destination.shopId,
              deltaCents: input.amountCents,
            });
        }
        const meta = metadata(old, options.createId);
        const record = transactionSchema.parse({
          ...meta,
          ...input,
          accountId: input.accountId,
          destinationAccountId: destination?.id,
          destinationShopId: destination?.shopId,
          stylistId: input.stylistId,
          currency: "CAD",
          accountingStatus:
            input.kind === "Needs review" ? "review" : "classified",
          revenueCents,
          operatingExpenseCents,
          commissionExpenseCents: 0,
          postings,
          legacyFields: old?.legacyFields,
          source: old?.source,
        });
        await audited("transactions", record);
        return record;
      });
    },
    async saveSale(raw: SaleInput, options: SaveOptions = {}) {
      const input = saleInputSchema.parse(raw);
      return atomic(async () => {
        await requireShop(input.shopId);
        const old: DailySale | undefined = await previous(
          "dailySales",
          input.shopId,
          options,
        );
        const duplicate = (
          await database.dailySales
            .where("[shopId+businessDate]")
            .equals([input.shopId, input.businessDate])
            .toArray()
        ).some((s) => !s.deletedAt && s.id !== old?.id);
        if (duplicate)
          throw new Error(
            "A daily record already exists for this shop and date. Edit that record.",
          );
        if (
          new Set(input.stylistAllocations.map((s) => s.stylistId)).size !==
          input.stylistAllocations.length
        )
          throw new Error("A stylist may only appear once per day.");
        const cashAccount = await accountFor(input.cashAccountId, input.shopId),
          cardAccount = await accountFor(input.cardAccountId, input.shopId);
        if (!isCashAccount(cashAccount) || !isCashAccount(cardAccount))
          throw new Error("Daily receipts require cash or bank accounts.");
        const serviceCents = addCents(
          ...input.stylistAllocations.map((a) => a.serviceCents),
        );
        const total = addCents(serviceCents, input.productCents);
        const calculatedCashCents = addCents(total, -input.cardCents);
        const cashCents = input.cashVerified
          ? input.cashCents
          : calculatedCashCents;
        const snapshots = [];
        for (const allocation of input.stylistAllocations) {
          const stylist = await stylistFor(allocation.stylistId, input.shopId);
          const preserved =
            old?.businessDate === input.businessDate
              ? old.commissionSnapshots?.find((s) => s.stylistId === stylist.id)
              : undefined;
          const rules = (
            await database.commissionRules
              .where("[shopId+stylistId]")
              .equals([input.shopId, stylist.id])
              .toArray()
          )
            .filter(
              (r) =>
                !r.deletedAt &&
                r.effectiveFrom <= input.businessDate &&
                (!r.effectiveTo || r.effectiveTo >= input.businessDate),
            )
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
          if (
            !preserved &&
            rules.length === 0 &&
            (await database.commissionRules
              .where("[shopId+stylistId]")
              .equals([input.shopId, stylist.id])
              .count()) > 0
          )
            throw new Error(
              "No commission rate is effective on this sale date. Set an applicable rate first.",
            );
          const rate =
            preserved?.rateBasisPoints ??
            rules[0]?.rateBasisPoints ??
            stylist.commissionBasisPoints;
          snapshots.push({
            stylistId: stylist.id,
            rateBasisPoints: rate,
            commissionCents: commissionCents(allocation.serviceCents, rate),
          });
        }
        const commission = addCents(...snapshots.map((s) => s.commissionCents));
        const id = old?.id ?? options.createId ?? crypto.randomUUID();
        const eventId = old?.linkedTransactionIds[0] ?? crypto.randomUUID();
        const record = dailySaleSchema.parse({
          ...metadata(old, id),
          ...input,
          currency: "CAD",
          serviceCents,
          cashCents,
          calculatedCashCents,
          commissionSnapshots: snapshots,
          linkedTransactionIds: [eventId],
          source: old?.source,
        });
        await audited("dailySales", record);
        await event({
          id: eventId,
          shopId: input.shopId,
          businessDate: input.businessDate,
          kind: "Revenue",
          amountCents: total,
          category: "Daily sales",
          description: `Daily sales · ${input.businessDate}`,
          managedBy: "dailySales",
          linkedEventId: id,
          revenueCents: total,
          commissionExpenseCents: commission,
          notes: input.notes,
          postings: [
            {
              accountId: cashAccount.id,
              shopId: input.shopId,
              deltaCents: cashCents,
            },
            {
              accountId: cardAccount.id,
              shopId: input.shopId,
              deltaCents: input.cardCents,
            },
          ],
          legacyFields: old
            ? (await database.transactions.get(eventId))?.legacyFields
            : undefined,
        });
        const existing = await database.earnings
          .where("saleId")
          .equals(id)
          .toArray();
        for (const allocation of input.stylistAllocations) {
          const snapshot = snapshots.find(
            (s) => s.stylistId === allocation.stylistId,
          )!;
          const prior = existing.find(
            (e) => e.stylistId === allocation.stylistId && !e.deletedAt,
          );
          const earning = earningSchema.parse({
            ...metadata(prior),
            shopId: input.shopId,
            saleId: id,
            stylistId: allocation.stylistId,
            businessDate: input.businessDate,
            serviceCents: allocation.serviceCents,
            rateBasisPoints: snapshot.rateBasisPoints,
            amountCents: snapshot.commissionCents,
          });
          await audited("earnings", earning);
        }
        for (const prior of existing)
          if (
            !prior.deletedAt &&
            !input.stylistAllocations.some(
              (a) => a.stylistId === prior.stylistId,
            )
          )
            await remove("earnings", prior);
        return record;
      });
    },
    async savePayment(raw: PaymentInput, options: SaveOptions = {}) {
      const input = paymentInputSchema.parse(raw);
      return atomic(async () => {
        await requireShop(input.shopId);
        await stylistFor(input.stylistId, input.shopId);
        const account = await accountFor(input.accountId, input.shopId);
        if (!isCashAccount(account))
          throw new Error("Commission payments require cash or bank.");
        const old = await previous("commissionPayments", input.shopId, options);
        const id = old?.id ?? options.createId ?? crypto.randomUUID();
        const eventId = old?.transactionId ?? crypto.randomUUID();
        const record = commissionPaymentSchema.parse({
          ...metadata(old, id),
          ...input,
          transactionId: eventId,
          source: old?.source,
        });
        await audited("commissionPayments", record);
        await event({
          id: eventId,
          shopId: input.shopId,
          businessDate: input.businessDate,
          kind: "Commission payment",
          amountCents: input.amountCents,
          accountId: input.accountId,
          stylistId: input.stylistId,
          category: "Contract Labour settlement",
          description: "Stylist commission payment",
          paymentMethod: input.paymentMethod,
          notes: input.notes,
          managedBy: "commissionPayments",
          linkedEventId: id,
          postings: [
            {
              accountId: input.accountId,
              shopId: input.shopId,
              deltaCents: -input.amountCents,
            },
          ],
        });
        return record;
      });
    },
    async saveAdjustment(raw: AdjustmentInput, options: SaveOptions = {}) {
      const input = adjustmentInputSchema.parse(raw);
      return atomic(async () => {
        await requireShop(input.shopId);
        await stylistFor(input.stylistId, input.shopId);
        const old = await previous("adjustments", input.shopId, options);
        const id = old?.id ?? options.createId ?? crypto.randomUUID();
        const eventId = old?.transactionId ?? crypto.randomUUID();
        const record = adjustmentSchema.parse({
          ...metadata(old, id),
          ...input,
          transactionId: eventId,
          source: old?.source,
        });
        await audited("adjustments", record);
        await event({
          id: eventId,
          shopId: input.shopId,
          businessDate: input.businessDate,
          kind: "Adjustment",
          amountCents: input.amountCents,
          stylistId: input.stylistId,
          category: "Commission settlement adjustment",
          description: input.reason,
          notes: input.adjustmentKind,
          managedBy: "adjustments",
          linkedEventId: id,
        });
        return record;
      });
    },
    async deleteRecord(
      table:
        "transactions" | "dailySales" | "commissionPayments" | "adjustments",
      shopId: string,
      id: string,
      expectedRevision: string,
    ) {
      return atomic(async () => {
        await requireShop(shopId);
        const old = await previous(table, shopId, { id, expectedRevision });
        if (table === "transactions" && old.managedBy)
          throw new Error(
            "Delete this linked record in its sales or commission workspace.",
          );
        await remove(table, old);
        if (table === "dailySales") {
          for (const eventId of old.linkedTransactionIds) {
            const linked = await database.transactions.get(eventId);
            if (linked && !linked.deletedAt)
              await remove("transactions", linked);
          }
          await removeEarnings(id);
        }
        if (
          table === "commissionPayments" ||
          (table === "adjustments" && old.transactionId)
        ) {
          const linked = await database.transactions.get(old.transactionId);
          if (linked && !linked.deletedAt) await remove("transactions", linked);
        }
      });
    },
    async saveReconciliation(input: {
      shopId: string;
      accountId: string;
      statementDate: string;
      statementBalanceCents: number;
      clearedKeys: string[];
      expectedAccountRevision: string;
      expectedEventRevisions: Record<string, string>;
    }) {
      z.uuid().parse(input.shopId);
      dateOnly.parse(input.statementDate);
      cents.parse(input.statementBalanceCents);
      return atomic(async () => {
        await requireShop(input.shopId);
        const account = await accountFor(input.accountId, input.shopId);
        if (account.revision !== input.expectedAccountRevision)
          throw new Error("Account changed. Reopen reconciliation.");
        if (input.statementDate < account.openingDate)
          throw new Error("Statement date precedes the opening balance.");
        const data = await readFinance(database);
        const state = reconciliationState(
          data,
          account,
          input.statementDate,
          input.clearedKeys,
          input.statementBalanceCents,
        );
        if (
          new Set(input.clearedKeys).size !== input.clearedKeys.length ||
          input.clearedKeys.some(
            (k) =>
              !state.rows.some(
                (r) =>
                  r.key === k && r.revision === input.expectedEventRevisions[k],
              ),
          )
        )
          throw new Error(
            "Cleared transactions changed. Review the current movements.",
          );
        const eventRevisions = Object.fromEntries(
          state.rows
            .filter((r) => input.clearedKeys.includes(r.key))
            .map((r) => [r.key, r.revision]),
        );
        const record = reconciliationSchema.parse({
          ...newMeta(),
          shopId: input.shopId,
          accountId: account.id,
          statementDate: input.statementDate,
          statementBalanceCents: input.statementBalanceCents,
          clearedKeys: input.clearedKeys,
          clearedBalanceCents: state.clearedBalanceCents,
          differenceCents: state.differenceCents,
          status: state.differenceCents === 0 ? "completed" : "in-progress",
          accountRevision: account.revision,
          eventRevisions,
        });
        await audited("reconciliations", record);
        return record;
      });
    },
  };
}
export const financeService = createFinanceService(db);
