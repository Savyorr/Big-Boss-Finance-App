import { z } from "zod";
import { dateOnly, transactionKinds } from "../models";
import { parseMoney } from "../calculations/money";
export const moneyText = z.string().refine((v) => {
  try {
    parseMoney(v);
    return true;
  } catch {
    return false;
  }
}, "Enter a valid amount with up to two decimals");
export const transactionDraftSchema = z.object({
  businessDate: dateOnly,
  shopId: z.uuid(),
  kind: z.enum(transactionKinds),
  category: z.string().trim().min(1),
  payee: z.string(),
  description: z.string().trim().min(1),
  amount: moneyText,
  accountId: z.uuid(),
  paymentMethod: z.string().min(1),
  notes: z.string(),
});
export const dailySalesDraftSchema = z.object({
  businessDate: dateOnly,
  shopId: z.uuid(),
  service: moneyText,
  products: moneyText,
  cash: moneyText,
  card: moneyText,
  notes: z.string(),
});
