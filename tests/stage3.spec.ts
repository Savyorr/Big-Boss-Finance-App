import Dexie from "dexie";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { test, expect, type Page } from "@playwright/test";
import { FinanceDatabase } from "../src/database/db";
import { createRepository } from "../src/database/repository";
import { createFinanceService } from "../src/services/finance";
import {
  createExchangeService,
  type ImportPlan,
} from "../src/services/exchange";
import { readFile } from "node:fs/promises";
Object.assign(Dexie.dependencies, { indexedDB, IDBKeyRange });
async function addShop(page: Page, name = "Import Target") {
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Add shop", exact: true }).click();
  await page.getByLabel("Shop name").fill(name);
  await page.getByRole("button", { name: "Save shop" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
const legacy = (amount = 10) => ({
  app: "Synthetic exchanged ledger",
  version: 1,
  exportedAt: "2026-06-10T00:00:00.000Z",
  transactions: [
    {
      id: "legacy-1",
      date: "2026-06-10",
      type: "Expense",
      category: "Ambiguous loan movement",
      payee: "Synthetic payee",
      details: "Synthetic source record",
      income: 0,
      expense: 0,
      bankCredit: 0,
      bankDeposit: 0,
      bankDebit: amount,
      notes: "Review classification",
    },
  ],
});
async function upload(page: Page, value: unknown, name = "synthetic.json") {
  await page.getByLabel("Select JSON file", { exact: true }).setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(
      typeof value === "string" ? value : JSON.stringify(value),
    ),
  });
}
async function preview(page: Page) {
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Preview ready");
}
async function confirm(page: Page) {
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  const mapped = page.getByRole("checkbox", {
    name: "I confirm the source-to-local shop mapping.",
  });
  if (await mapped.count()) await mapped.check();
  await page.getByRole("button", { name: "Apply merge", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Import complete");
}
test("legacy preview, target selection, repeated imports, details and offline file exchange", async ({
  page,
  context,
}) => {
  await addShop(page);
  await page.goto("/#/data");
  await upload(page, legacy());
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Select a target shop");
  await page
    .getByLabel("Target shop for legacy records")
    .selectOption({ label: "Import Target" });
  await preview(page);
  await expect(
    page.getByText("Destination: Import Target", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/stage3-data-preview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/stage3-data-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await confirm(page);
  await expect(page.getByRole("status")).toContainText(
    "1 business records added",
  );
  await preview(page);
  await confirm(page);
  await expect(page.getByRole("status")).toContainText(
    "0 business records added",
  );
  await page.goto("/#/transactions");
  await expect(
    page.getByText("Synthetic source record", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Details Synthetic source record" })
    .click();
  await expect(
    page.getByText("Original source ID: legacy-1", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/#/");
  await expect(
    page.getByText("1 unclassified transactions excluded", { exact: false }),
  ).toBeVisible();
  await page.goto("/#/reports");
  await expect(
    page.getByText("1 unclassified records are excluded.", { exact: false }),
  ).toBeVisible();
  await page.goto("/#/data");
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await upload(page, legacy());
  await page
    .getByLabel("Target shop for legacy records")
    .selectOption({ label: "Import Target" });
  await preview(page);
  await confirm(page);
  await page
    .getByRole("button", { name: "Export All Locations", exact: true })
    .click();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  const downloaded = await event;
  expect(downloaded.suggestedFilename()).toMatch(
    /^BigBoss_AllLocations_\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await downloaded.path();
  const data = JSON.parse(await readFile(path!, "utf8"));
  expect(data.data.transactions).toHaveLength(1);
  expect(data.data.transactions[0].legacyFields.bankDebit).toBe(1000);
  await context.setOffline(false);
  const fresh = await context.browser()!.newContext();
  const next = await fresh.newPage();
  await next.goto("http://127.0.0.1:4173/#/data");
  await upload(next, data, "restored-modern.json");
  await preview(next);
  await confirm(next);
  await next.goto("http://127.0.0.1:4173/#/transactions");
  await expect(
    next.getByText("Synthetic source record", { exact: true }),
  ).toBeVisible();
  await fresh.close();
});
test("drag/drop, malformed JSON, changed-source conflict and restore confirmation", async ({
  page,
}) => {
  await addShop(page);
  await page.goto("/#/data");
  await upload(page, "{bad");
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Invalid JSON");
  const drop = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([text], "dragged.json", { type: "application/json" }),
    );
    return dt;
  }, JSON.stringify(legacy()));
  await page
    .locator(".drop-zone")
    .dispatchEvent("drop", { dataTransfer: drop });
  await page
    .getByLabel("Target shop for legacy records")
    .selectOption({ label: "Import Target" });
  await preview(page);
  await confirm(page);
  await upload(page, legacy(20), "changed.json");
  await preview(page);
  await expect(
    page.getByRole("heading", { name: "Resolve conflicting versions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm Import", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Use Imported for all conflicts" })
    .click();
  await confirm(page);
  await page.goto("/#/transactions");
  await page
    .getByRole("button", { name: "Details Synthetic source record" })
    .click();
  await expect(page.getByText("bankDebit: $20.00")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/#/data");
  await page
    .getByRole("button", { name: "Create Backup", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Download JSON file" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Restore Backup", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Restore preview ready");
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply replacement", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Type REPLACE to confirm").fill("REPLACE");
  await page
    .getByRole("button", { name: "Apply replacement", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("modern multi-shop import populates existing financial workspaces", async ({
  page,
}) => {
  const db = new FinanceDatabase(`browser-source-${crypto.randomUUID()}`);
  await db.open();
  try {
    const repo = createRepository(db),
      finance = createFinanceService(db);
    for (const name of ["North shop", "South shop"]) {
      const shop = await repo.createShop({ name, address: "", contact: "" });
      const account = await repo.saveAccount(shop.id, {
        name: `${name} bank`,
        type: "Chequing",
        openingBalanceCents: 100000,
        openingDate: "2026-01-01",
        status: "active",
      });
      await finance.saveTransaction({
        shopId: shop.id,
        accountId: account.id,
        businessDate: "2026-06-10",
        kind: "Revenue",
        amountCents: 5000,
        category: "Revenue",
        payee: "",
        description: `${name} revenue`,
        paymentMethod: "Cash",
        notes: "",
      });
    }
    const doc = await createExchangeService(db).exportData("all");
    await addShop(page, "Existing owner shop");
    await page.goto("/#/data");
    await upload(page, doc, "two-shops.json");
    await preview(page);
    await expect(page.getByLabel("Map North shop")).toBeVisible();
    await expect(page.getByLabel("Map South shop")).toBeVisible();
    await page
      .getByLabel("Map North shop")
      .selectOption({ label: "Map to Existing owner shop" });
    await preview(page);
    await confirm(page);
    await upload(page, doc, "two-shops-again.json");
    await preview(page);
    await confirm(page);
    await expect(page.getByRole("status")).toContainText(
      "0 business records added",
    );
    await page.goto("/#/");
    await expect(
      page.locator(".metric-card").filter({ hasText: "Total Revenue" }),
    ).toContainText("$100.00");
    await page.goto("/#/banking");
    await expect(
      page.getByRole("cell", { name: "North shop bank", exact: true }),
    ).toBeVisible();
    await page.goto("/#/reports");
    await expect(
      page.getByRole("row", { name: "Revenue $100.00", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Select location: All Locations" })
      .click();
    await page
      .getByRole("button", { name: "Existing owner shop Individual shop" })
      .click();
    await page.goto("/#/");
    await expect(
      page.locator(".metric-card").filter({ hasText: "Total Revenue" }),
    ).toContainText("$50.00");
  } finally {
    await db.delete();
  }
});
