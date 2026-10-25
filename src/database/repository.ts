import { z } from "zod";
import { db, type FinanceDatabase } from "./db";
import {
  shopInputSchema,
  shopSchema,
  stylistInputSchema,
  stylistSchema,
  accountInputSchema,
  accountSchema,
  type ShopScope,
  commissionRuleSchema,
  dateOnly,
} from "../models";
const meta = () => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    revision: crypto.randomUUID(),
  };
};
export function createRepository(database: FinanceDatabase) {
  const revision = async (
    entityType: string,
    record: {
      id: string;
      revision: string;
      createdAt: string;
      updatedAt: string;
      parentRevision?: string;
    },
    shopId: string,
  ) =>
    database.revisions.add({
      id: record.revision,
      entityType,
      entityId: record.id,
      shopId,
      parents: record.parentRevision ? [record.parentRevision] : [],
      createdAt: record.updatedAt,
      payload: record,
    });
  const requireShop = async (shopId: string) => {
    z.uuid().parse(shopId);
    const shop = await database.shops.get(shopId);
    if (!shop || shop.status !== "active")
      throw new Error("Select an active shop before making changes.");
    return shop;
  };
  return {
    async createShop(input: z.input<typeof shopInputSchema>) {
      const record = shopSchema.parse({
        ...shopInputSchema.parse(input),
        ...meta(),
        status: "active",
      });
      await database.transaction(
        "rw",
        database.shops,
        database.revisions,
        async () => {
          await database.shops.add(record);
          await revision("shop", record, record.id);
        },
      );
      return record;
    },
    async editShop(
      id: string,
      input: z.input<typeof shopInputSchema>,
      expectedRevision: string,
    ) {
      return database.transaction(
        "rw",
        database.shops,
        database.revisions,
        async () => {
          const old = await database.shops.get(id);
          if (!old) throw new Error("Shop not found.");
          if (old.revision !== expectedRevision)
            throw new Error("This shop changed. Close and reopen the form.");
          const record = shopSchema.parse({
            ...old,
            ...shopInputSchema.parse(input),
            parentRevision: old.revision,
            revision: crypto.randomUUID(),
            updatedAt: new Date().toISOString(),
          });
          await database.shops.put(record);
          await revision("shop", record, id);
          return record;
        },
      );
    },
    async setShopStatus(
      id: string,
      status: "active" | "archived",
      expectedRevision: string,
    ) {
      await database.transaction(
        "rw",
        database.shops,
        database.revisions,
        async () => {
          const old = await database.shops.get(id);
          if (!old || old.revision !== expectedRevision)
            throw new Error("Shop changed. Please refresh and try again.");
          const record = shopSchema.parse({
            ...old,
            status,
            parentRevision: old.revision,
            revision: crypto.randomUUID(),
            updatedAt: new Date().toISOString(),
          });
          await database.shops.put(record);
          await revision("shop", record, id);
        },
      );
    },
    async listOwned(
      kind: "stylists" | "accounts" | "transactions" | "dailySales",
      scope: ShopScope,
    ) {
      if (scope !== "all") z.uuid().parse(scope);
      const table = database.table(kind);
      const records =
        scope === "all"
          ? await table.toArray()
          : await table.where("shopId").equals(scope).toArray();
      return records.filter((r) => !r.deletedAt);
    },
    async saveStylist(
      shopId: string,
      input: z.input<typeof stylistInputSchema>,
      id?: string,
      expectedRevision?: string,
      effectiveFrom?: string,
    ) {
      return database.transaction(
        "rw",
        database.shops,
        database.stylists,
        database.commissionRules,
        database.revisions,
        async () => {
          await requireShop(shopId);
          const old = id ? await database.stylists.get(id) : undefined;
          if (id && (!old || old.shopId !== shopId))
            throw new Error("Stylist does not belong to this shop.");
          if (old && old.revision !== expectedRevision)
            throw new Error("Stylist changed. Reopen the form.");
          const record = stylistSchema.parse({
            ...(old ?? meta()),
            ...stylistInputSchema.parse(input),
            shopId,
            ...(old
              ? {
                  parentRevision: old.revision,
                  revision: crypto.randomUUID(),
                  updatedAt: new Date().toISOString(),
                }
              : {}),
          });
          const effective =
            effectiveFrom ??
            (old ? new Date().toISOString().slice(0, 10) : "0001-01-01");
          dateOnly.parse(effective);
          if (
            !old ||
            old.commissionBasisPoints !== record.commissionBasisPoints ||
            effectiveFrom
          ) {
            const rules = await database.commissionRules
              .where("[shopId+stylistId]")
              .equals([shopId, record.id])
              .toArray();
            if (old && rules.length === 0 && effective !== "0001-01-01") {
              const baseline = commissionRuleSchema.parse({
                ...meta(),
                shopId,
                stylistId: record.id,
                effectiveFrom: "0001-01-01",
                rateBasisPoints: old.commissionBasisPoints,
                basis: "eligible-service-revenue",
                rounding: "half-up",
              });
              await database.commissionRules.add(baseline);
              await revision("commissionRule", baseline, shopId);
            }
            const same = rules.find(
              (r) => !r.deletedAt && r.effectiveFrom === effective,
            );
            const rule = commissionRuleSchema.parse({
              ...(same ?? meta()),
              shopId,
              stylistId: record.id,
              effectiveFrom: effective,
              rateBasisPoints: record.commissionBasisPoints,
              basis: "eligible-service-revenue",
              rounding: "half-up",
              ...(same
                ? {
                    parentRevision: same.revision,
                    revision: crypto.randomUUID(),
                    updatedAt: new Date().toISOString(),
                  }
                : {}),
            });
            await database.commissionRules.put(rule);
            await revision("commissionRule", rule, shopId);
          }
          await database.stylists.put(record);
          await revision("stylist", record, shopId);
          return record;
        },
      );
    },
    async saveAccount(
      shopId: string,
      input: z.input<typeof accountInputSchema>,
      id?: string,
      expectedRevision?: string,
    ) {
      return database.transaction(
        "rw",
        database.shops,
        database.accounts,
        database.transactions,
        database.reconciliations,
        database.revisions,
        async () => {
          await requireShop(shopId);
          const old = id ? await database.accounts.get(id) : undefined;
          if (id && (!old || old.shopId !== shopId))
            throw new Error("Account does not belong to this shop.");
          if (old && old.revision !== expectedRevision)
            throw new Error("Account changed. Reopen the form.");
          const record = accountSchema.parse({
            currency: "CAD",
            ...(old ?? meta()),
            ...accountInputSchema.parse(input),
            shopId,
            ...(old
              ? {
                  parentRevision: old.revision,
                  revision: crypto.randomUUID(),
                  updatedAt: new Date().toISOString(),
                }
              : {}),
          });
          if (
            old &&
            old.type !== record.type &&
            (await database.transactions.toArray()).some(
              (t) =>
                !t.deletedAt && t.postings?.some((p) => p.accountId === old.id),
            )
          )
            throw new Error(
              "Account type cannot change after movements are posted. Create a new account instead.",
            );
          await database.accounts.put(record);
          await revision("account", record, shopId);
          return record;
        },
      );
    },
    async setPreference(key: string, value: unknown) {
      await database.settings.put({ key, value });
    },
    async selectShop(scope: ShopScope) {
      if (scope !== "all") await requireShop(scope);
      await database.settings.put({ key: "activeShop", value: scope });
    },
  };
}
export const repository = createRepository(db);
