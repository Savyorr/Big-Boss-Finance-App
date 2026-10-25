import { test, expect } from "@playwright/test";
import { createProfile, chooseProfile, uploadPreview } from "./profile-helpers";
import AxeBuilder from "@axe-core/playwright";
test("separate business databases, simple import preview, clear source totals and missing-staff explanation", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createProfile(page, "Barber business A");
  await page.goto("/#/stylists");
  await page.getByRole("button", { name: "Add stylist", exact: true }).click();
  await page.getByLabel("Stylist name").fill("Only A barber");
  await page.getByLabel("Commission percentage").fill("50");
  await page.getByRole("button", { name: "Save stylist" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const firstDatabase = await page.evaluate(() =>
    sessionStorage.getItem("big-boss-active-business"),
  );
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await createProfile(page, "Barber business B");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("big-boss-active-business"),
    ),
  ).not.toBe(firstDatabase);
  await expect(page.locator("html")).not.toHaveClass("dark");
  await page.goto("/#/stylists");
  await expect(page.getByText("Only A barber", { exact: true })).toHaveCount(0);
  const source = {
    app: "Synthetic legacy account",
    version: 1,
    exportedAt: "2026-06-10T00:00:00.000Z",
    transactions: [
      {
        id: "synthetic-1",
        date: "2026-06-10",
        type: "Expense",
        category: "Unclassified",
        payee: "Synthetic",
        details: "Only B imported row",
        income: 50,
        expense: 10,
        bankCredit: 40,
        bankDeposit: 30,
        bankDebit: 999,
        notes: "",
      },
    ],
  };
  await uploadPreview(page, source);
  await expect(
    page.getByText("Destination: Barber business B", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Advanced import options", { exact: true }),
  ).toBeVisible();
  expect(await page.getByLabel("Import mode").isVisible()).toBe(false);
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply merge", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your imported history is ready" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "See imported financial history" })
    .click();
  const history = page.getByRole("region", {
    name: "Imported financial history",
  });
  await expect(history).toContainText("1 imported transactions");
  await expect(
    history.locator(".metric-card").filter({ hasText: "Recorded Revenue" }),
  ).toContainText("$50.00");
  await expect(
    history.locator(".metric-card").filter({ hasText: "Recorded Expenses" }),
  ).toContainText("$10.00");
  await expect(
    history
      .locator(".metric-card")
      .filter({ hasText: "Recorded bank withdrawals" }),
  ).toContainText("$999.00");
  await page.goto("/#/stylists");
  await expect(
    page.getByRole("heading", {
      name: "Build your team",
    }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  await page.goto("/#/data");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export business JSON", exact: true })
    .click();
  const data = JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile((await (await download).path())!, "utf8"),
  );
  expect(data.data.stylists).toHaveLength(0);
  expect(data.data.transactions).toHaveLength(1);
  await chooseProfile(page, "Barber business A");
  await expect(page.locator("html")).toHaveClass("dark");
  await page.goto("/#/stylists");
  await expect(
    page.getByRole("cell", { name: "Only A barber", exact: true }),
  ).toBeVisible();
  await page.goto("/#/transactions");
  await expect(
    page.getByText("Only B imported row", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await chooseProfile(page, "Barber business B");
  await expect(
    page.getByRole("region", { name: "Imported financial history" }),
  ).toContainText("$50.00");
  await context.setOffline(false);
  await page.screenshot({
    path: "test-results/business-profile-imported-history.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/business-profile-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
