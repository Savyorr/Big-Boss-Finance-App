import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createProfile, chooseProfile } from "./profile-helpers";
import { formatMoney } from "../src/calculations/money";
const fixture =
  process.env.BIG_BOSS_LEGACY_FIXTURE ??
  "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json";
const names = ["Steven Hirmiz", "Waseem Saleem", "Aeden Kajo", "Mattew Burns"];
async function importFile(
  page: import("@playwright/test").Page,
  restore = true,
) {
  await page.goto("/#/data");
  await page
    .getByLabel("Select JSON file", { exact: true })
    .setInputFiles(fixture);
  await expect(page.getByRole("status")).toContainText("Preview ready", {
    timeout: 20000,
  });
  const offer = page.getByRole("checkbox", {
    name: /Restore the original four barbers/,
  });
  await expect(offer).toBeChecked();
  if (!restore) await offer.uncheck();
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply merge", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Import complete", {
    timeout: 30000,
  });
}
async function exportFile(page: import("@playwright/test").Page) {
  await page.goto("/#/data");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export business JSON", exact: true })
    .click();
  return JSON.parse(await readFile((await (await event).path())!, "utf8"));
}
const canonical = (x: any): string =>
  x === null || typeof x !== "object"
    ? JSON.stringify(x)
    : Array.isArray(x)
      ? "[" + x.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(x)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(x[k]))
          .join(",") +
        "}";
const hash = (x: unknown) =>
  createHash("sha256").update(canonical(x)).digest("hex");
test("original HTML-authorized roster completes an existing import, links every barber history and preserves source data across repeat/restore/offline", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  const raw = await readFile(fixture);
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a",
  );
  const source = JSON.parse(raw.toString());
  const expected = JSON.parse(
    await readFile(
      process.env.BIG_BOSS_LEGACY_EXPECTED ??
        "private/legacy-expected-totals.json",
      "utf8",
    ),
  );
  await createProfile(page, "Existing migration business");
  await importFile(page, false);
  let exported = await exportFile(page);
  expect(exported.data.stylists).toHaveLength(0);
  expect(exported.data.transactions).toHaveLength(968);
  await page.goto("/#/");
  await expect(
    page.getByRole("button", {
      name: "Complete Legacy Migration",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete Legacy Migration", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Complete Legacy Migration",
      exact: true,
    }),
  ).toHaveCount(0, { timeout: 30000 });
  await expect(
    page.getByRole("status").filter({ hasText: "4 original barbers ready" }),
  ).toContainText("85 historical barber records linked", { timeout: 15000 });
  await page.goto("/#/stylists");
  for (const name of names)
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Sale Product", exact: true }),
  ).toHaveCount(0);
  for (const name of names) {
    await expect(
      page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name, exact: true }) }),
    ).toContainText("50.00%");
  }
  await page
    .getByRole("button", { name: "History Waseem Saleem", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Historical barber payments & records",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", { name: "Waseem Saleem", exact: true }),
      })
      .first(),
  ).toContainText("28");
  await expect(
    page.getByText(
      "Historical commission earned and outstanding cannot be reconstructed from payments alone.",
      { exact: false },
    ),
  ).toBeVisible();
  exported = await exportFile(page);
  expect(exported.data.stylists).toHaveLength(4);
  expect(
    exported.data.transactions.filter((t: any) => t.stylistId),
  ).toHaveLength(85);
  expect(exported.data.commissionPayments).toHaveLength(0);
  const counts: Record<string, number> = {
    "Waseem Saleem": 28,
    "Aeden Kajo": 27,
    "Steven Hirmiz": 26,
    "Mattew Burns": 4,
  };
  for (const s of exported.data.stylists)
    expect(
      exported.data.transactions.filter((t: any) => t.stylistId === s.id),
    ).toHaveLength(counts[s.name]);
  const originals = exported.data.transactions
    .map((t: any) => t.source.raw)
    .sort((a: any, b: any) => a.id.localeCompare(b.id));
  expect(hash(originals)).toBe(
    hash(
      source.transactions.sort((a: any, b: any) => a.id.localeCompare(b.id)),
    ),
  );
  for (const [field, total] of Object.entries(expected))
    expect(
      exported.data.transactions.reduce(
        (s: number, t: any) => s + t.legacyFields[field],
        0,
      ),
    ).toBe(total);
  await page.goto("/#/reports");
  await expect(
    page.getByRole("button", { name: "Recorded history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: `Recorded Revenue ${formatMoney(expected.income)}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", {
      name: `Recorded Expenses ${formatMoney(expected.expense)}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Verified Profit & Loss", exact: true })
    .click();
  await expect(
    page.getByRole("row", { name: "Revenue $0.00", exact: true }),
  ).toBeVisible();
  await importFile(page);
  const repeated = await exportFile(page);
  expect(repeated.data.stylists).toHaveLength(4);
  expect(repeated.data.transactions).toHaveLength(968);
  expect(hash(repeated.data.transactions)).toBe(
    hash(exported.data.transactions),
  );
  // Daily sales still use actual per-barber service allocations, and products receive no commission.
  await page.goto("/#/banking");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Account name").fill("New cash till");
  await page.getByLabel("Account type").selectOption("Cash");
  await page.getByLabel("Opening balance", { exact: true }).fill("0");
  await page.getByLabel("Opening balance date").fill("2026-01-01");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/#/daily-sales");
  await page.getByRole("button", { name: "Record Today's Sales" }).click();
  for (const name of names)
    await expect(page.getByLabel(`Service revenue for ${name}`)).toBeVisible();
  await page.getByLabel("Sales date").fill("2026-10-25");
  await page.getByLabel("Service revenue for Steven Hirmiz").fill("100");
  await page.getByLabel("Product sales", { exact: true }).fill("20");
  await page
    .getByLabel("Cash receipt account")
    .selectOption({ label: "New cash till" });
  await page
    .getByRole("button", { name: "Save daily sales", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const final = await exportFile(page);
  expect(
    final.data.earnings.reduce((s: number, e: any) => s + e.amountCents, 0),
  ).toBe(5000);
  expect(final.data.transactions).toHaveLength(969);
  const fresh = await browser.newContext();
  try {
    const next = await fresh.newPage();
    await next.goto("http://127.0.0.1:4173/");
    await createProfile(next, "Restored migrated business", true);
    await next.getByLabel("Select JSON file", { exact: true }).setInputFiles({
      name: "migrated.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(final)),
    });
    await expect(next.getByRole("status")).toContainText("Preview ready", {
      timeout: 20000,
    });
    await next
      .getByRole("button", { name: "Confirm Import", exact: true })
      .click();
    await next
      .getByRole("button", { name: "Apply merge", exact: true })
      .click();
    await expect(next.getByRole("status")).toContainText("Import complete", {
      timeout: 30000,
    });
    const restored = await exportFile(next);
    expect(restored.data.stylists).toHaveLength(4);
    expect(hash(restored.data.transactions)).toBe(
      hash(final.data.transactions),
    );
  } finally {
    await fresh.close();
  }
  await createProfile(page, "Unrelated business");
  await page.goto("/#/stylists");
  for (const name of names)
    await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0);
  await chooseProfile(page, "Existing migration business");
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.goto("/#/stylists");
  await expect(
    page.getByRole("cell", { name: "Steven Hirmiz", exact: true }),
  ).toBeVisible();
  await exportFile(page);
  await context.setOffline(false);
});

test("automatic original roster preview, payment history and provisional reporting are accessible and responsive", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await createProfile(page, "Synthetic original workflow");
  await page.goto("/#/data");
  const synthetic = {
    app: "Big Boss Hair Salon Finance",
    version: 1,
    exportedAt: "2026-06-10T00:00:00.000Z",
    transactions: [
      {
        id: "synthetic-original-record",
        date: "2026-06-10",
        type: "Expense",
        category: "Contract Labour",
        payee: "Steven Hirmiz",
        details: "Synthetic bank payment",
        income: 0,
        expense: 100,
        bankCredit: 0,
        bankDeposit: 0,
        bankDebit: 100,
        notes: "",
      },
    ],
  };
  await page.getByLabel("Select JSON file", { exact: true }).setInputFiles({
    name: "synthetic-original.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(synthetic)),
  });
  await expect(page.getByRole("status")).toContainText("Preview ready");
  await expect(
    page.getByRole("checkbox", { name: /Restore the original four barbers/ }),
  ).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply merge", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Import complete", {
    timeout: 15000,
  });
  await page.goto("/#/stylists");
  for (const name of names)
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "History Steven Hirmiz", exact: true })
    .click();
  await expect(
    page.getByText("Bank payment recorded", { exact: false }).first(),
  ).toBeVisible();
  axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: "test-results/synthetic-original-barber-history-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#/");
  await expect(
    page.getByRole("region", { name: "Imported financial history" }),
  ).toContainText("$100.00");
  await page.screenshot({
    path: "test-results/synthetic-original-recorded-dashboard.png",
    fullPage: true,
  });
});
