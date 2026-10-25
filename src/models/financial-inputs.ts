import { z } from "zod";
import { dateOnly, cents, transactionKinds } from "./index";
const amount = cents.refine((v) => v > 0, "Enter an amount greater than zero.");
const nonnegative = cents.refine(
  (v) => v >= 0,
  "Use zero or a positive amount.",
);
export const financialInputSchema = z
  .object({
    shopId: z.uuid(),
    businessDate: dateOnly,
    kind: z.enum(transactionKinds),
    amountCents: cents,
    accountId: z.uuid().optional(),
    destinationAccountId: z.uuid().optional(),
    destinationShopId: z.uuid().optional(),
    category: z.string().trim().min(1, "Category is required.").max(100),
    payee: z.string().trim().max(200),
    description: z.string().trim().min(1, "Description is required.").max(500),
    paymentMethod: z.string().trim().min(1),
    notes: z.string().max(5000),
    stylistId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind !== "Needs review" && value.amountCents <= 0)
      context.addIssue({
        code: "custom",
        path: ["amountCents"],
        message: "Enter an amount greater than zero.",
      });
  });
export const saleInputSchema = z.object({
  shopId: z.uuid(),
  businessDate: dateOnly,
  productCents: nonnegative,
  cardCents: nonnegative,
  cashCents: cents,
  cashVerified: z.boolean(),
  cashAccountId: z.uuid(),
  cardAccountId: z.uuid(),
  notes: z.string().max(5000),
  stylistAllocations: z.array(
    z.object({ stylistId: z.uuid(), serviceCents: nonnegative }),
  ),
});
export const paymentInputSchema = z.object({
  shopId: z.uuid(),
  stylistId: z.uuid(),
  accountId: z.uuid(),
  businessDate: dateOnly,
  amountCents: amount,
  paymentMethod: z.string().trim().min(1),
  notes: z.string().max(5000),
  periodMode: z.enum(["calendar", "legacy"]),
});
export const adjustmentInputSchema = z.object({
  shopId: z.uuid(),
  stylistId: z.uuid(),
  businessDate: dateOnly,
  amountCents: cents.refine((v) => v !== 0, "Adjustment must be nonzero."),
  reason: z.string().trim().min(1, "Explain this adjustment.").max(1000),
  adjustmentKind: z.enum([
    "Correction",
    "Advance reclassification",
    "Deduction",
    "Previously settled",
    "Other",
  ]),
  periodMode: z.enum(["calendar", "legacy"]),
});
export type FinancialInput = z.infer<typeof financialInputSchema>;
export type SaleInput = z.infer<typeof saleInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>;
