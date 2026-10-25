import { test, expect } from "@playwright/test";
test("Stage 1 profiles, location isolation, themes, navigation and reload persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Financial Overview" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Add shop", exact: true }).click();
  await page.getByLabel("Shop name").fill("Downtown");
  await page.getByLabel("Address (optional)").fill("123 Main");
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Downtown", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add shop", exact: true }).click();
  await page.getByLabel("Shop name").fill("West End");
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select location: All Locations" })
    .click();
  await page.getByLabel("Search locations").fill("Down");
  await page.getByRole("button", { name: "Downtown 123 Main" }).click();
  await page
    .getByRole("link", { name: "Stylists & Commissions", exact: true })
    .click();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Downtown active" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "West End active" })).toHaveCount(
    0,
  );
  await page
    .getByRole("link", { name: "Stylists & Commissions", exact: true })
    .click();
  await page.getByRole("button", { name: "Add stylist" }).click();
  await page.getByLabel("Stylist name").fill("Alex");
  await page.getByLabel("Commission percentage").fill("50.25");
  await page.getByRole("button", { name: "Save stylist" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Alex", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Alex" }).click();
  await page.getByLabel("Stylist name").fill("Alex Smith");
  await page.getByRole("button", { name: "Save stylist" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Banking", exact: true }).click();
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Account name").fill("Main chequing");
  await page.getByLabel("Opening balance", { exact: true }).fill("1234.56");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Main chequing", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Main chequing" }).click();
  await page.getByLabel("Account name").fill("Operating chequing");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Operating chequing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "$1,234.56", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select location: Downtown" }).click();
  await page.getByRole("button", { name: "West End Individual shop" }).click();
  await expect(
    page.getByRole("cell", { name: "Operating chequing", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Stylists & Commissions", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Alex Smith", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Select location: West End" }).click();
  await page
    .getByRole("button", { name: "All Locations Consolidated view" })
    .click();
  await expect(
    page.getByRole("cell", { name: "Alex Smith", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.screenshot({
    path: "test-results/dark-profiles.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Edit Downtown" }).click();
  await page.getByLabel("Shop name").fill("Downtown Salon");
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Archive Downtown Salon" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Restore Downtown Salon" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore Downtown Salon" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Archive Downtown Salon" }),
  ).toBeVisible();
  for (const [name, heading] of [
    ["Dashboard", "Financial Overview"],
    ["Daily Sales", "Daily Sales"],
    ["Transactions", "Transactions"],
    ["Stylists & Commissions", "Stylists & Commissions"],
    ["Banking", "Banking"],
    ["Reports", "Reports"],
    ["Data Management", "Data Management"],
    ["Settings", "Settings"],
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).not.toHaveClass("dark");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Main navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Main navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true, level: 1 }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/settings-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("required validation and import preview stay honest", async ({ page }) => {
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Add shop", exact: true }).click();
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByLabel("Shop name")
      .evaluate((el: HTMLInputElement) => el.validity.valueMissing),
  ).toBe(true);
  await page.getByLabel("Shop name").fill("   ");
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByRole("alert")).toContainText("Shop name is required");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/#/data");
  await expect(
    page.getByRole("button", { name: "Preview import", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Select JSON file", { exact: true }).setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Unsupported JSON format",
  );
  await page.goto("/#/daily-sales");
  await expect(
    page.getByRole("button", { name: "Record Today's Sales" }),
  ).toBeDisabled();
});
test("production shell reloads offline after initial cache installation", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Financial Overview" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Financial Overview" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
  await context.setOffline(false);
});
