// Capture private evidence for human visual review. Run against the local production
// preview; this never accesses the owner's computer or publishes financial evidence.
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const fixture = process.env.BIG_BOSS_LEGACY_FIXTURE;
if (!fixture)
  throw new Error(
    "Set BIG_BOSS_LEGACY_FIXTURE to the unchanged original backup.",
  );
const origin = process.env.BIG_BOSS_AUDIT_URL ?? "http://127.0.0.1:4173";
const output = resolve("private/browser-visual-audit");
await mkdir(output, { recursive: true });
await rm(`${output}/integrity.json`, { force: true });
const bytes = await readFile(fixture);
const digest = (value) => createHash("sha256").update(value).digest("hex");
if (
  digest(bytes) !==
  "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a"
)
  throw new Error("The reference is not the unchanged original backup.");
const source = JSON.parse(bytes);
const expectedTotals = JSON.parse(
  await readFile(
    process.env.BIG_BOSS_LEGACY_EXPECTED ??
      "private/legacy-expected-totals.json",
    "utf8",
  ),
);
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? "[" + value.map(canonical).join(",") + "]"
      : "{" +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
          .join(",") +
        "}";
const sourceDigest = (rows) =>
  digest(canonical([...rows].sort((a, b) => a.id.localeCompare(b.id))));
const names = ["Steven Hirmiz", "Waseem Saleem", "Aeden Kajo", "Mattew Burns"];
const counts = {
  "Steven Hirmiz": 26,
  "Waseem Saleem": 28,
  "Aeden Kajo": 27,
  "Mattew Burns": 4,
};
const runtimeErrors = [];
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
  locale: "en-CA",
});
const page = await context.newPage();
page.on("pageerror", (error) => runtimeErrors.push(error.message));
const go = (path) => page.goto(origin + "/#/" + path);
const shot = async (name) => {
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(
    page.getByText("Opening workspace…", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Loading chart…", { exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${output}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  console.log(`Captured ${name}`);
};
async function createProfile(name) {
  await go("");
  const switcher = page
    .getByRole("button", { name: /Switch business profile:/ })
    .first();
  if (await switcher.isVisible()) await switcher.click();
  await expect(
    page.getByRole("heading", { name: "Choose your business", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Business name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create business profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Financial Overview", exact: true }),
  ).toBeVisible();
}
async function upload(restore = true, capture = "") {
  await go("data");
  await page
    .getByLabel("Select JSON file", { exact: true })
    .setInputFiles(fixture);
  await expect(page.getByRole("status")).toContainText("Preview ready", {
    timeout: 30000,
  });
  const roster = page.getByRole("checkbox", {
    name: /Restore the original four barbers/,
  });
  await expect(roster).toBeChecked();
  if (!restore) await roster.uncheck();
  if (capture) await shot(capture);
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply merge", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Import complete", {
    timeout: 45000,
  });
}
async function exportBusiness() {
  await go("data");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export business JSON", exact: true })
    .click();
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}
try {
  // Model an already-imported profile before the correction, without altering live storage.
  await createProfile("Big Boss");
  await upload(false);
  let data = (await exportBusiness()).data;
  expect(data.transactions).toHaveLength(968);
  expect(data.stylists).toHaveLength(0);
  await go("");
  await page
    .getByRole("button", { name: "Complete Legacy Migration", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "4 original barbers ready" }),
  ).toContainText("85 historical barber records linked", { timeout: 45000 });
  await shot("01-existing-import-completed");
  await go("stylists");
  for (const name of names)
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await shot("02-four-original-barbers");
  await go("reports");
  await expect(
    page
      .getByRole("heading", { name: "Recorded history", exact: true })
      .first(),
  ).toBeVisible();
  const money = (cents) =>
    new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(cents / 100);
  for (const [label, field] of [
    ["Recorded Revenue", "income"],
    ["Recorded Expenses", "expense"],
  ])
    await expect(
      page.getByRole("row", {
        name: `${label} ${money(expectedTotals[field])}`,
        exact: true,
      }),
    ).toBeVisible();
  await shot("03-recorded-financial-report");
  await page
    .getByRole("button", { name: "Commission Summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "New-entry commission ledger",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Historical barber payments & records",
      exact: true,
    }),
  ).toBeVisible();
  await shot("04-linked-contract-labour");
  await go("transactions");
  await expect(page.getByText("968 records ·", { exact: false })).toBeVisible();
  await shot("05-original-transactions");
  const before = (await exportBusiness()).data;
  expect(sourceDigest(before.transactions.map((t) => t.source.raw))).toBe(
    sourceDigest(source.transactions),
  );
  expect(new Set(before.transactions.map((t) => t.id)).size).toBe(968);
  for (const [field, expected] of Object.entries(expectedTotals))
    expect(
      before.transactions.reduce((sum, t) => sum + t.legacyFields[field], 0),
    ).toBe(expected);
  for (const stylist of before.stylists) {
    expect(
      before.transactions.filter((t) => t.stylistId === stylist.id),
    ).toHaveLength(counts[stylist.name]);
    for (const transaction of before.transactions.filter(
      (t) => t.stylistId === stylist.id,
    )) {
      expect(transaction.source.raw.category).toBe("Contract Labour");
      expect(transaction.source.raw.payee.trim().toLowerCase()).toBe(
        stylist.name.toLowerCase(),
      );
    }
  }
  await upload(true, "06-simple-json-preview");
  await shot("07-repeat-import-result");
  data = (await exportBusiness()).data;
  expect(data.transactions).toHaveLength(968);
  expect(sourceDigest(data.transactions)).toBe(
    sourceDigest(before.transactions),
  );
  expect(data.stylists).toHaveLength(4);
  await createProfile("Independent verification business");
  await go("transactions");
  await expect(page.getByText("0 records ·", { exact: false })).toBeVisible();
  await shot("08-independent-business-empty-transactions");
  await go("stylists");
  for (const name of names)
    await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0);
  await shot("09-independent-business-empty-barbers");
  const other = (await exportBusiness()).data;
  expect(other.transactions).toHaveLength(0);
  expect(other.stylists).toHaveLength(0);
  await page
    .getByRole("button", { name: /Switch business profile:/ })
    .first()
    .click();
  await shot("10-separate-business-chooser");
  // A fresh original import must restore the roster without a separate migration click.
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Automatic import verification");
  await page
    .getByRole("button", { name: "Create business profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Financial Overview", exact: true }),
  ).toBeVisible();
  await upload(true);
  await shot("12-fresh-import-automatic-roster-result");
  await go("stylists");
  for (const name of names)
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await shot("13-fresh-import-four-barbers-automatically");
  const automatic = (await exportBusiness()).data;
  expect(automatic.transactions).toHaveLength(968);
  expect(automatic.stylists).toHaveLength(4);
  expect(automatic.transactions.filter((t) => t.stylistId)).toHaveLength(85);
  await page
    .getByRole("button", { name: /Switch business profile:/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Big Boss Open business profile/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Financial Overview", exact: true }),
  ).toBeVisible();
  const back = (await exportBusiness()).data;
  expect(sourceDigest(back.transactions)).toBe(
    sourceDigest(before.transactions),
  );
  await go("");
  await expect(
    page.getByRole("region", { name: "Imported financial history" }),
  ).toContainText("968 imported transactions");
  await page.locator(".main-chart").scrollIntoViewIfNeeded();
  await expect(
    page.locator(".recharts-yAxis-tick-labels text").first(),
  ).toBeVisible();
  await page.locator(".main-chart").screenshot({
    path: `${output}/14-chart-currency-labels.png`,
    animations: "disabled",
  });
  await shot("11-big-boss-preserved-after-profile-switch");
  expect(runtimeErrors).toEqual([]);
  await writeFile(
    `${output}/integrity.json`,
    JSON.stringify(
      {
        scope:
          "Private local browser copy restored from original backup; not the owner computer browser",
        referenceSHA256: digest(bytes),
        originalTransactions: 968,
        uniqueTransactions: 968,
        originalRawFieldsPreserved: true,
        fiveSourceTotalsPreserved: true,
        repeatedImportUnchanged: true,
        freshImportRestoresRosterAutomatically: true,
        barbers: names,
        linkedContractLabour: counts,
        profilesIsolated: true,
        runtimeErrors,
        capturedAt: new Date().toISOString(),
        visualReview:
          "Screenshots require separate human inspection; script assertions alone are not visual approval.",
      },
      null,
      2,
    ),
  );
  console.log(
    "Private screenshots captured. Inspect every screenshot before reporting visual results.",
  );
} catch (error) {
  await page.screenshot({
    path: `${output}/capture-failure.png`,
    fullPage: true,
  });
  await writeFile(`${output}/capture-failure.html`, await page.content());
  throw error;
} finally {
  await browser.close();
}
