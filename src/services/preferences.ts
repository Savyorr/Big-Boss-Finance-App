import { z } from "zod";
import { db } from "../database/db";
export const financialPreferencesSchema = z.object({
  defaultCommissionBasisPoints: z.number().int().min(0).max(10000),
  fiscalStartMonth: z.number().int().min(1).max(12),
  categories: z.array(z.string().trim().min(1).max(100)).max(200),
});
export type FinancialPreferences = z.infer<typeof financialPreferencesSchema>;
export const defaultFinancialPreferences: FinancialPreferences = {
  defaultCommissionBasisPoints: 5000,
  fiscalStartMonth: 1,
  categories: [],
};
export async function saveFinancialPreferences(
  shopId: string,
  raw: FinancialPreferences,
) {
  z.uuid().parse(shopId);
  const value = financialPreferencesSchema.parse(raw);
  await db.transaction("rw", db.shops, db.settings, async () => {
    const shop = await db.shops.get(shopId);
    if (!shop || shop.status !== "active")
      throw new Error("Select an active shop.");
    await db.settings.put({ key: `financial:${shopId}`, shopId, value });
  });
}
