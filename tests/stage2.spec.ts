import { test, expect, type Page } from "@playwright/test";
async function navigate(page: Page, name: string) {
  await page.getByRole("link", { name, exact: true }).click();
}
async function createAccount(
  page: Page,
  name: string,
  type: string,
  balance: string,
) {
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Account name").fill(name);
  await page.getByLabel("Account type").selectOption(type);
  await page.getByLabel("Opening balance", { exact: true }).fill(balance);
  await page.getByLabel("Opening balance date").fill("2026-01-01");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function setup(page: Page) {
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Add shop", exact: true }).click();
  await page.getByLabel("Shop name").fill("Finance Test");
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select location: All Locations" })
    .click();
  await page
    .getByRole("button", { name: "Finance Test Individual shop" })
    .click();
  await navigate(page, "Stylists & Commissions");
  await page.getByRole("button", { name: "Add stylist", exact: true }).click();
  await page.getByLabel("Stylist name").fill("Test Stylist");
  await page.getByLabel("Commission percentage").fill("50.00");
  await page.getByRole("button", { name: "Save stylist" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Banking");
  await createAccount(page, "Test Bank", "Chequing", "1000.00");
  await createAccount(page, "Test Till", "Cash", "0.00");
}
test("financial workflow persists and recalculates sales, payments, reports and reconciliation", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await navigate(page, "Daily Sales");
  await page.getByRole("button", { name: "Record Today's Sales" }).click();
  await page.getByLabel("Sales date").fill("2026-06-10");
  await page.getByLabel("Service revenue for Test Stylist").fill("100.00");
  await page.getByLabel("Product sales", { exact: true }).fill("20.00");
  await page.getByLabel("Debit / card receipts").fill("80.00");
  await page
    .getByLabel("Cash receipt account")
    .selectOption({ label: "Test Till" });
  await page
    .getByLabel("Card receipt account")
    .selectOption({ label: "Test Bank" });
  await page
    .getByRole("button", { name: "Save daily sales", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit sales 2026-06-10" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit sales 2026-06-10" }),
  ).toBeVisible();
  await navigate(page, "Dashboard");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Total Revenue" }),
  ).toContainText("$120.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Operating Expenses" }),
  ).toContainText("$50.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Operating Profit" }),
  ).toContainText("$70.00");
  await navigate(page, "Transactions");
  await page
    .getByRole("button", { name: "Add Transaction", exact: true })
    .click();
  await page.getByLabel("Date", { exact: true }).fill("2026-06-10");
  await page.getByLabel("Amount", { exact: true }).fill("10.00");
  await page.getByLabel("Category (customizable)").fill("Rent Expense");
  await page
    .getByLabel("Financial account")
    .selectOption({ label: "Test Bank · Chequing" });
  await page.getByLabel("Description", { exact: true }).fill("Synthetic rent");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Stylists & Commissions");
  await page
    .getByRole("button", { name: "Payment history", exact: true })
    .click();
  await page.getByRole("button", { name: "Pay Stylist", exact: true }).click();
  await page
    .getByLabel("Stylist", { exact: true })
    .selectOption({ label: "Test Stylist" });
  await page.getByLabel("Payment or adjustment date").fill("2026-06-10");
  await page.getByLabel("Amount", { exact: true }).fill("30.00");
  await page.getByLabel("Payment account").selectOption({ label: "Test Bank" });
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "Test Stylist Finance Test" }),
    }),
  ).toContainText("$20.00");
  await page
    .getByRole("button", { name: "Add adjustment", exact: true })
    .click();
  await page
    .getByLabel("Stylist", { exact: true })
    .selectOption({ label: "Test Stylist" });
  await page.getByLabel("Payment or adjustment date").fill("2026-06-10");
  await page.getByLabel("Amount", { exact: true }).fill("-5.00");
  await page
    .getByLabel("Explanation (required)")
    .fill("Synthetic advance reclassification");
  await page.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Dashboard");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Operating Expenses" }),
  ).toContainText("$60.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Outstanding Commissions" }),
  ).toContainText("$25.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Net Cash Movement" }),
  ).toContainText("$80.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Cash & Bank Balances" }),
  ).toContainText("$1,080.00");
  await navigate(page, "Reports");
  await page.getByLabel("Reporting month").fill("2026-06");
  await expect(
    page.getByRole("row", { name: "Operating profit $60.00", exact: true }),
  ).toBeVisible();
  for (const report of [
    "Revenue Summary",
    "Expense Breakdown",
    "Cash Flow",
    "Commission Summary",
    "Banking Summary",
    "Location Comparison",
    "Annual Overview",
  ]) {
    await page.getByRole("button", { name: report, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: report, exact: true }).first(),
    ).toBeVisible();
  }
  await page.getByLabel("Financial year", { exact: true }).fill("2026");
  await expect(
    page.getByRole("row", {
      name: "2026-06 $120.00 $60.00 $60.00 $80.00",
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, "Banking");
  await page
    .getByRole("button", { name: "Reconciliation", exact: true })
    .click();
  await page.getByLabel("Banking account").selectOption({ label: "Test Bank" });
  await page.getByLabel("Statement date").fill("2026-06-30");
  await page.getByLabel("Statement closing balance").fill("1040.00");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page
    .getByRole("button", { name: "Complete reconciliation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Reconciliation completed",
  );
  await navigate(page, "Daily Sales");
  await page.getByRole("button", { name: "Edit sales 2026-06-10" }).click();
  await page.getByLabel("Product sales", { exact: true }).fill("30.00");
  await page
    .getByRole("button", { name: "Save daily sales", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit sales 2026-06-10" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Edit daily sales" }),
  ).toHaveCount(0);
  await navigate(page, "Dashboard");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Total Revenue" }),
  ).toContainText("$130.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Operating Expenses" }),
  ).toContainText("$60.00");
  await navigate(page, "Transactions");
  await page
    .getByRole("button", { name: "Edit Synthetic rent", exact: true })
    .click();
  await page.getByLabel("Amount", { exact: true }).fill("20.00");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Synthetic rent" }),
  ).toContainText("$20.00");
  await navigate(page, "Banking");
  await page
    .getByRole("button", { name: "Reconciliation", exact: true })
    .click();
  await page.getByLabel("Banking account").selectOption({ label: "Test Bank" });
  await expect(
    page.getByRole("cell", {
      name: "Needs review · records changed",
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, "Transactions");
  await page
    .getByRole("button", { name: "Delete Synthetic rent", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Synthetic rent", exact: true }),
  ).toHaveCount(0);
  await navigate(page, "Dashboard");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Operating Expenses" }),
  ).toContainText("$50.00");
  await expect(page.locator(".recharts-wrapper")).toBeVisible();
  await expect(page.locator(".recharts-area")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Monthly profit", exact: true })
    .click();
  await expect(page.locator(".recharts-area")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Cash movement", exact: true })
    .click();
  await expect(page.locator(".recharts-area")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Revenue vs expenses", exact: true })
    .click();
  await expect(page.locator(".recharts-area")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/stage2-dashboard.png",
    fullPage: true,
  });
  await navigate(page, "Stylists & Commissions");
  await page
    .getByRole("button", { name: "Payment history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reverse payment 2026-06-10" })
    .click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reverse payment 2026-06-10" }),
  ).toHaveCount(0);
  await navigate(page, "Daily Sales");
  await page.getByRole("button", { name: "Delete sales 2026-06-10" }).click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Dashboard");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Total Revenue" }),
  ).toContainText("$0.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Cash & Bank Balances" }),
  ).toContainText("$1,000.00");
  expect(errors).toEqual([]);
});
test("financial data remains accessible offline", async ({ page, context }) => {
  await setup(page);
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Test Bank", exact: true }),
  ).toBeVisible();
  await navigate(page, "Reports");
  await expect(
    page.getByRole("heading", { name: "Reports", level: 1 }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("loan, credit card, transfer and owner distribution forms preserve accounting separation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setup(page);
  await createAccount(page, "Test Loan", "Operating Line of Credit", "0.00");
  await createAccount(page, "Test Card", "Credit Card", "0.00");
  async function enter(
    kind: string,
    amount: string,
    source: string,
    destination?: string,
  ) {
    await navigate(page, "Transactions");
    await page
      .getByRole("button", { name: "Add Transaction", exact: true })
      .click();
    await page.getByLabel("Date", { exact: true }).fill("2026-06-10");
    await page
      .getByLabel("Transaction type", { exact: true })
      .selectOption(kind);
    await page.getByLabel("Amount", { exact: true }).fill(amount);
    await page.getByLabel("Category (customizable)").fill(kind);
    await page
      .getByLabel(destination ? "Source account" : "Financial account", {
        exact: true,
      })
      .selectOption({ label: source });
    if (destination)
      await page
        .getByLabel("Destination account", { exact: true })
        .selectOption({ label: destination });
    await page
      .getByLabel("Description", { exact: true })
      .fill(`Synthetic ${kind}`);
    await page.getByRole("button", { name: "Save transaction" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await enter(
    "Loan advance",
    "200.00",
    "Test Loan · Operating Line of Credit",
    "Test Bank · Chequing",
  );
  await enter(
    "Loan principal repayment",
    "50.00",
    "Test Bank · Chequing",
    "Test Loan · Operating Line of Credit",
  );
  await enter("Loan interest", "2.00", "Test Bank · Chequing");
  await enter("Operating expense", "10.00", "Test Card · Credit Card");
  await enter(
    "Credit card payment",
    "6.00",
    "Test Bank · Chequing",
    "Test Card · Credit Card",
  );
  await enter("Transfer", "20.00", "Test Bank · Chequing", "Test Till · Cash");
  await enter("Owner distribution", "5.00", "Test Bank · Chequing");
  await navigate(page, "Dashboard");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Total Revenue" }),
  ).toContainText("$0.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Operating Expenses" }),
  ).toContainText("$12.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Net Cash Movement" }),
  ).toContainText("$137.00");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Cash & Bank Balances" }),
  ).toContainText("$1,137.00");
  await navigate(page, "Banking");
  await expect(
    page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "Test Loan", exact: true }),
    }),
  ).toContainText("-$150.00");
  await expect(
    page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "Test Card", exact: true }),
    }),
  ).toContainText("-$4.00");
});
test("shop financial preferences and invalid report ranges persist without losing profiles", async ({
  page,
}) => {
  await setup(page);
  await navigate(page, "Settings");
  await page.getByLabel("Default commission percentage").fill("55.00");
  await page.getByLabel("Financial year starts").selectOption("4");
  await page
    .getByLabel("Custom categories (one per line)")
    .fill("Custom supplies");
  await page
    .getByRole("button", { name: "Save financial preferences" })
    .click();
  await expect(page.getByLabel("Default commission percentage")).toHaveValue(
    "55.00",
  );
  await page.reload();
  await expect(page.getByLabel("Financial year starts")).toHaveValue("4");
  await expect(page.getByLabel("Custom categories (one per line)")).toHaveValue(
    "Custom supplies",
  );
  await navigate(page, "Stylists & Commissions");
  await page.getByRole("button", { name: "Add stylist", exact: true }).click();
  await expect(page.getByLabel("Commission percentage")).toHaveValue("55.00");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await navigate(page, "Reports");
  await page.getByLabel("Financial year", { exact: true }).fill("2026");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(
    "2026-04-01",
  );
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(
    "2027-03-31",
  );
  await page.getByLabel("From", { exact: true }).fill("");
  await expect(page.getByRole("alert")).toContainText(
    "Enter valid From and To",
  );
  await page.getByLabel("From", { exact: true }).fill("2026-04-01");
  await expect(
    page.getByRole("button", { name: "Profit & Loss", exact: true }),
  ).toBeVisible();
});
