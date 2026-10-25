import { formatMoney } from "../src/calculations/money";
import { addLegacyShop, createProfile } from "./profile-helpers";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const fixture =
  process.env.BIG_BOSS_LEGACY_FIXTURE ??
  "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json";
async function addShop(page: Page, name: string) {
  await addLegacyShop(page, name);
}
async function preview(page: Page) {
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Preview ready");
}
async function merge(page: Page) {
  await expect(
    page.getByRole("button", { name: "Confirm Import", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  const mapping = page.getByRole("checkbox", {
    name: "I confirm the source-to-local shop mapping.",
  });
  if (await mapping.count()) await mapping.check();
  await page.getByRole("button", { name: "Apply merge", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Import complete", {
    timeout: 20000,
  });
}
async function exported(page: Page) {
  await page.goto("/#/data");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export business JSON", exact: true })
    .click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}
async function upload(page: Page, data: unknown) {
  await page.goto("/#/data");
  await page.getByLabel("Select JSON file", { exact: true }).setInputFiles({
    name: "owner-exchange.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
const canonical = (v: any): string =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? "[" + v.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",") +
        "}";
const digest = (v: unknown) =>
  createHash("sha256").update(canonical(v)).digest("hex");
test("actual original: browser import, all source fields and totals, clean restore, repeated original", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const raw = await readFile(fixture);
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a",
  );
  const source = JSON.parse(raw.toString());
  await addShop(page, "Private audit target");
  await page.goto("/#/data");
  await page
    .getByLabel("Select JSON file", { exact: true })
    .setInputFiles(fixture);

  await preview(page);
  await merge(page);
  const native = await exported(page);
  expect(native.data.transactions).toHaveLength(968);
  expect(native.data.stylists.map((s: any) => s.name).sort()).toEqual(
    ["Steven Hirmiz", "Waseem Saleem", "Aeden Kajo", "Mattew Burns"].sort(),
  );
  expect(native.data.transactions.filter((t: any) => t.stylistId)).toHaveLength(
    85,
  );

  const rows = native.data.transactions;
  // Compare every source field without printing private records on success.
  expect(
    digest(
      rows
        .map((r: any) => r.source.raw)
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
    ),
  ).toBe(
    digest(
      source.transactions.sort((a: any, b: any) => a.id.localeCompare(b.id)),
    ),
  );
  expect(new Set(rows.map((r: any) => r.source.originalId)).size).toBe(968);
  const expectedText = await readFile(
    process.env.BIG_BOSS_LEGACY_EXPECTED ??
      "private/legacy-expected-totals.json",
    "utf8",
  );
  expect(createHash("sha256").update(expectedText).digest("hex")).toBe(
    "7fa2472d4341d85a2753597bca9c9b1ffb8f5afb1f32d7fbae6a6cb4d44b4844",
  );
  for (const [field, total] of Object.entries(
    JSON.parse(expectedText) as Record<string, number>,
  ))
    expect(
      rows.reduce((s: number, r: any) => s + r.legacyFields[field], 0),
    ).toBe(total);
  expect(
    rows.filter(
      (r: any) => r.legacyFields.bankDebit > 0 && r.legacyFields.expense === 0,
    ),
  ).toHaveLength(277);
  await page.goto("/#/");
  const imported = page.getByRole("region", {
    name: "Imported financial history",
  });
  await expect(imported).toContainText("968 imported transactions");
  const expectedFigures = JSON.parse(expectedText);
  for (const [label, key] of [
    ["Recorded Revenue", "income"],
    ["Recorded Expenses", "expense"],
    ["Recorded bank withdrawals", "bankDebit"],
  ])
    await expect(
      imported.locator(".metric-card").filter({ hasText: label }),
    ).toContainText(formatMoney(expectedFigures[key]));
  await page.goto("/#/transactions");
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await page.goto("/#/reports");
  await expect(
    page.getByRole("row", {
      name: "Unreviewed Historical Records 968",
      exact: true,
    }),
  ).toBeVisible();
  const other = await browser.newContext();
  const fresh = await other.newPage();
  try {
    await fresh.goto("http://127.0.0.1:4173/");
    await createProfile(fresh, "Restored original", true);
    await fresh.goto("http://127.0.0.1:4173/#/data");
    await upload(fresh, native);
    await preview(fresh);
    await merge(fresh);
    const restored = await exported(fresh);
    expect(digest(restored.data.transactions)).toBe(digest(rows));
    await fresh.goto("/#/data");
    await fresh
      .getByLabel("Select JSON file", { exact: true })
      .setInputFiles(fixture);
    await fresh.getByText("Advanced import options", { exact: true }).click();
    await fresh
      .getByLabel("Target shop for legacy records")
      .selectOption({ label: "Private audit target" });
    await preview(fresh);
    await merge(fresh);
    await expect(fresh.getByRole("status")).toContainText(
      "0 business records added",
    );
    expect(digest((await exported(fresh)).data.transactions)).toBe(
      digest(rows),
    );
  } finally {
    await other.close();
  }
});
test("future commission scheduling survives a name-only profile edit", async ({
  page,
}) => {
  await addShop(page, "Rate test");
  await page.goto("/#/stylists");
  await page.getByRole("button", { name: "Add stylist", exact: true }).click();
  await page.getByLabel("Stylist name").fill("Rate stylist");
  await page.getByLabel("Commission percentage").fill("50");
  await page.getByRole("button", { name: "Save stylist" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit Rate stylist", exact: true })
    .click();
  await page.getByLabel("Commission percentage").fill("60");
  await page.getByLabel("Rate effective from").fill("2099-01-01");
  await page.getByRole("button", { name: "Save stylist" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit Rate stylist", exact: true })
    .click();
  await page.getByLabel("Stylist name").fill("Renamed stylist");
  await page.getByRole("button", { name: "Save stylist" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rateRow = page.getByRole("row").filter({ hasText: "Renamed stylist" });
  await expect(rateRow).toContainText("50.00%");
  await expect(rateRow).toContainText("60.00% from 2099-01-01");
  const data = (await exported(page)).data;
  expect(data.commissionRules).toHaveLength(2);
  expect(
    data.commissionRules.find((r: any) => r.effectiveFrom === "2099-01-01")
      .rateBasisPoints,
  ).toBe(6000);
  expect(
    data.commissionRules.find((r: any) => r.effectiveFrom === "0001-01-01")
      .rateBasisPoints,
  ).toBe(5000);
});
test("all lazy routes remain available offline, responsive, keyboard-accessible without runtime errors", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createProfile(page, "Offline profile");
  await page.goto("/#/");
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "",
      "daily-sales",
      "transactions",
      "stylists",
      "banking",
      "reports",
      "data",
      "settings",
    ]) {
      await page.goto("/#/" + route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await context.setOffline(false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .getByRole("button", { name: "Edit Offline profile", exact: true })
    .click();
  await expect(page.getByLabel("Shop name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("two independent owners exchange three shops, divergent edits and deletion without resurrection", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  for (const name of ["North", "Central", "South"]) await addShop(page, name);
  const source = {
    app: "Owner audit",
    version: 1,
    exportedAt: "2026-06-10T00:00:00.000Z",
    transactions: [
      {
        id: "owner-record",
        date: "2026-06-10",
        type: "Expense",
        category: "Unclassified",
        payee: "Synthetic",
        details: "Owner audit movement",
        income: 0,
        expense: 0,
        bankCredit: 0,
        bankDeposit: 0,
        bankDebit: 25,
        notes: "",
      },
    ],
  };
  await upload(page, source);

  await preview(page);
  await merge(page);
  const original = await exported(page);
  const other = await browser.newContext();
  const next = await other.newPage();
  async function editContact(p: Page, contact: string) {
    await p.goto("/#/settings");
    await p.getByRole("button", { name: "Edit North", exact: true }).click();
    await p.getByLabel("Contact details (optional)").fill(contact);
    await p.getByRole("button", { name: "Save shop" }).click();
    await expect(p.getByRole("dialog")).toHaveCount(0);
  }
  try {
    await next.goto("http://127.0.0.1:4173/");
    await createProfile(next, "Owner B", true);
    await next.goto("http://127.0.0.1:4173/#/data");
    await upload(next, original);
    await preview(next);
    await merge(next);
    await editContact(page, "Owner A");
    await editContact(next, "Owner B");
    await page.goto("/#/transactions");
    await page
      .getByRole("button", { name: "Delete Owner audit movement", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm removal", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await addShop(page, "A new shop");
    await addShop(next, "B new shop");
    const a = await exported(page);
    await upload(next, a);
    await preview(next);
    await expect(
      next.getByRole("heading", { name: "Resolve conflicting versions" }),
    ).toBeVisible();
    await expect(
      next.getByRole("button", { name: "Confirm Import", exact: true }),
    ).toBeDisabled();
    await next
      .getByRole("button", { name: "Use Imported for all conflicts" })
      .click();
    await merge(next);
    const b = await exported(next);
    expect(b.data.shops).toHaveLength(5);
    expect(b.data.transactions[0].deletedAt).toBeTruthy();
    expect(b.data.tombstones.length).toBeGreaterThan(0);
    await upload(page, b);
    await preview(page);
    await merge(page);
    const combined = await exported(page);
    expect(combined.data.shops).toHaveLength(5);
    expect(
      combined.data.shops.find((s: any) => s.name === "North").contact,
    ).toBe("Owner A");
    expect(combined.data.transactions[0].deletedAt).toBeTruthy();
    await upload(page, original);
    await preview(page);
    await merge(page);
    const repeated = await exported(page);
    expect(repeated.data.transactions[0].deletedAt).toBeTruthy();
    expect(repeated.data.shops).toHaveLength(5);
    // Missing ancestry must remain an explicit conflict, regardless of timestamps.
    const missing = structuredClone(b);
    missing.data.revisions = [];
    const north = missing.data.shops.find((s: any) => s.name === "North");
    north.revision = crypto.randomUUID();
    delete north.parentRevision;
    north.updatedAt = "2099-01-01T00:00:00.000Z";
    north.contact = "Unproven later clock";
    await upload(page, missing);
    await preview(page);
    await expect(
      page.getByRole("heading", { name: "Resolve conflicting versions" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm Import", exact: true }),
    ).toBeDisabled();
    expect(
      (await exported(next)).data.shops.find((s: any) => s.name === "North")
        .contact,
    ).toBe("Owner A");
  } finally {
    await other.close();
  }
});
