import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
test.use({ actionTimeout: 15000 });
const fixture =
  process.env.BIG_BOSS_LEGACY_FIXTURE ??
  "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json";
const referenceHTML =
  process.env.BIG_BOSS_LEGACY_HTML ??
  "/workspace/attachments/ac7cc350-2f77-48ca-8501-3d7d7617f484/Big Boss Hair Salon – Finance.html";
const names = ["Steven Hirmiz", "Waseem Saleem", "Aeden Kajo", "Mattew Burns"];
const money = (c: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    c / 100,
  );
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
const nav = async (p: Page, name: string) => {
  await p
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
};
async function create(p: Page, name: string) {
  await p.goto("/");
  await expect(
    p.getByRole("heading", { name: "Choose a Business" }),
  ).toBeVisible();
  await p
    .getByRole("textbox", { name: "Business name", exact: true })
    .fill(name);
  await p.getByRole("button", { name: "Create Business", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
async function exportJSON(p: Page) {
  await nav(p, "Data & Backup");
  const event = p.waitForEvent("download");
  await p.getByRole("button", { name: "Export JSON", exact: true }).click();
  const d = await event;
  const failure = await d.failure();
  if (failure)
    throw Error(
      "Download failed: " + failure + "; page closed=" + p.isClosed(),
    );
  return JSON.parse(await readFile((await d.path())!, "utf8"));
}
async function importJSON(
  p: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await nav(p, "Data & Backup");
  await p.getByLabel("Import JSON file", { exact: true }).setInputFiles(file);
  await expect(
    p.getByRole("heading", { name: "Import preview", exact: true }),
  ).toBeVisible({ timeout: 20000 });
}
async function confirm(p: Page) {
  await p.getByRole("button", { name: "Confirm Import", exact: true }).click();
  await expect(p.locator('p[role="status"]')).toContainText("Import complete", {
    timeout: 30000,
  });
}
async function shot(p: Page, name: string) {
  await mkdir("private/faithful-browser", { recursive: true });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({
    path: `private/faithful-browser/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function addExpense(p: Page, amount = "10") {
  await nav(p, "Expenses & Bank");
  await p
    .getByRole("button", { name: "Add expense or transfer", exact: true })
    .click();
  await p.getByLabel("Transaction date", { exact: true }).fill("2026-10-25");
  await p.getByLabel("Category", { exact: true }).fill("Rent Expense");
  await p
    .getByLabel("Payee", { exact: true })
    .fill("Synthetic verification payee");
  await p
    .getByLabel("Details", { exact: true })
    .fill("Synthetic browser verification only");
  await p.getByLabel("Amount", { exact: true }).fill(amount);
  await p.getByRole("button", { name: "Add transaction", exact: true }).click();
  await expect(p.locator('p[role="status"]')).toContainText(
    "Transaction saved",
  );
}
test("original references, all required workflows, independent owners, safe synchronization, offline and restart", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  const raw = await readFile(fixture, "utf8"),
    original = JSON.parse(raw),
    totals = JSON.parse(
      await readFile("private/legacy-expected-totals.json", "utf8"),
    );
  expect(createHash("sha256").update(raw).digest("hex")).toBe(
    "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a",
  );
  await create(page, "Big Boss Hair Salon");
  await nav(page, "Commissions");
  await page.getByRole("button", { name: "Barbers", exact: true }).click();
  for (const name of names)
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Sale Product", exact: true }),
  ).toHaveCount(0);
  await shot(page, "03-four-original-barbers");
  await page
    .getByRole("button", { name: "Switch Business", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Business name", exact: true })
    .fill("Independent Shop");
  await page
    .getByRole("button", { name: "Create Business", exact: true })
    .click();
  await nav(page, "Expenses & Bank");
  await expect(page.getByText("0 transactions", { exact: true })).toBeVisible();
  await nav(page, "Commissions");
  await page.getByRole("button", { name: "Barbers", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: names[0], exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Switch Business", exact: true })
    .click();
  await shot(page, "01-business-selection");
  await page
    .getByRole("button", { name: /Big Boss Hair Salon Open business/ })
    .click();
  await importJSON(page, fixture);
  await shot(page, "07-json-import-preview");
  await confirm(page);
  await shot(page, "08-json-import-success");
  const saved = await exportJSON(page);
  expect(
    saved.records.filter((e: any) => e.kind === "tx" && !e.deleted),
  ).toHaveLength(968);
  const tx = saved.records.filter((e: any) => e.kind === "tx");
  expect(new Set(tx.map((e: any) => e.id)).size).toBe(968);
  for (const [k, v] of Object.entries(totals))
    expect(tx.reduce((s: number, e: any) => s + e.value[k], 0)).toBe(v);
  expect(
    tx
      .map((e: any) => e.value.raw)
      .sort((a: any, b: any) => a.id.localeCompare(b.id)),
  ).toEqual(
    original.transactions.sort((a: any, b: any) => a.id.localeCompare(b.id)),
  );
  expect(tx.filter((e: any) => e.value.staffId)).toHaveLength(85);
  await nav(page, "Dashboard");
  await expect(page.getByText("September 2026", { exact: true })).toBeVisible();
  await expect(page.locator(".metric")).toHaveCount(3);
  const sept = original.transactions.filter((t: any) =>
    t.date.startsWith("2026-09"),
  );
  const revenue = sept.reduce(
      (s: number, t: any) => s + Math.round(t.income * 100),
      0,
    ),
    expense = sept.reduce(
      (s: number, t: any) => s + Math.round(t.expense * 100),
      0,
    );
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText(money(revenue));
  await expect(
    page.getByRole("region", { name: "Expenses", exact: true }),
  ).toContainText(money(expense));
  await expect(
    page.getByRole("region", { name: "Profit", exact: true }),
  ).toContainText(money(revenue - expense));
  await expect(page.locator("main")).not.toContainText("Bank debit");
  await shot(page, "02-dashboard-three-cards");
  await nav(page, "Reports");
  await page.getByLabel("Report month", { exact: true }).fill("2026-09");
  await expect(
    page.getByRole("row", { name: "Revenue " + money(revenue), exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Expenses " + money(expense), exact: true }),
  ).toBeVisible();
  await shot(page, "06-original-style-reports");
  await nav(page, "Expenses & Bank");
  await expect(
    page.getByText("968 transactions", { exact: true }),
  ).toBeVisible();
  await shot(page, "04-imported-transactions");
  await importJSON(page, fixture);
  await confirm(page);
  const repeated = await exportJSON(page);
  expect(canonical(repeated.records)).toBe(canonical(saved.records));
  await nav(page, "Daily Sales");
  await shot(page, "05-working-daily-sales");
  // Exercise exact original daily calculation in a real browser, without changing either source file.
  const referenceContext = await browser.newContext({
    serviceWorkers: "block",
  });
  const reference = await referenceContext.newPage();
  const html = await readFile(referenceHTML, "utf8");
  await reference.route("**/original-reference", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await reference.route("https://cdnjs.cloudflare.com/**", (route) =>
    route.abort(),
  );
  await reference.goto("http://127.0.0.1:4173/original-reference");
  await reference.locator('[data-v="daily"]').click();
  await reference
    .getByLabel("Steven Hirmiz revenue", { exact: true })
    .fill("100");
  await reference
    .getByLabel("Sale Product revenue", { exact: true })
    .fill("20");
  await reference.locator("#dCard").fill("150");
  expect(await reference.locator("#dTotal").inputValue()).toBe("120.00");
  expect(await reference.locator("#dCash").inputValue()).toBe("-30.00");
  await referenceContext.close();
  await page.getByLabel("Sales date", { exact: true }).fill("2026-10-25");
  await page
    .getByLabel("Revenue for Steven Hirmiz", { exact: true })
    .fill("100");
  await page.getByLabel("Product sales", { exact: true }).fill("20");
  await page
    .getByLabel("Debit machine / card receipts", { exact: true })
    .fill("150");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Synthetic verification only — not historical business records");
  await expect(page.getByText("$50.00", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("-$30.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save day", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Saved 2026-10-25",
  );
  await page
    .getByRole("button", { name: "Edit day 2026-10-25", exact: true })
    .click();
  await page.getByLabel("Product sales", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Saved 2026-10-25",
  );
  await addExpense(page, "10");
  await page
    .getByRole("button", { name: "Add expense or transfer", exact: true })
    .click();
  await page.getByLabel("Type", { exact: true }).selectOption("Transfer");
  await page.getByLabel("Category", { exact: true }).fill("Loan Credit");
  await page.getByLabel("Amount", { exact: true }).fill("20");
  await expect(page.getByLabel("Direction", { exact: true })).toHaveValue("in");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Transaction saved",
  );
  const base = await exportJSON(page),
    testTx = base.records.find(
      (e: any) =>
        e.kind === "tx" && e.value.payee === "Synthetic verification payee",
    );
  const owner = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    timezoneId: "America/Los_Angeles",
  });
  try {
    const b = await owner.newPage();
    await create(b, "Owner B copy");
    await importJSON(b, {
      name: "shared.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(base)),
    });
    await confirm(b);
    const restored = await exportJSON(b);
    expect(canonical(restored.records)).toBe(canonical(base.records));
    await shot(b, "09-fresh-installation-restored");
    // Independent edits must conflict even though timestamps cannot establish an authoritative winner.
    for (const [p, amount] of [
      [page, "11"],
      [b, "12"],
    ] as const) {
      await nav(p, "Expenses & Bank");
      await p
        .getByRole("button", {
          name: "Edit transaction " + testTx.id,
          exact: true,
        })
        .click();
      await p.getByLabel("Amount", { exact: true }).fill(amount);
      await p
        .getByRole("button", { name: "Save transaction", exact: true })
        .click();
      await expect(p.locator('p[role="status"]')).toContainText(
        "Transaction saved",
      );
    }
    const theirs = await exportJSON(b);
    await importJSON(page, {
      name: "owner-b.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(theirs)),
    });
    await expect(
      page.getByText("Conflicting tx:", { exact: false }),
    ).toBeVisible();
    await shot(page, "10-owner-edit-conflict");
    await page
      .getByRole("radio", { name: "Use imported version", exact: true })
      .check();
    await confirm(page);
    const merged = await exportJSON(page);
    expect(
      merged.records.find((e: any) => e.id === testTx.id).value.expense,
    ).toBe(1200);
    await nav(page, "Expenses & Bank");
    await page
      .getByRole("button", {
        name: "Delete transaction " + testTx.id,
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Delete transaction?" })
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(page.locator('p[role="status"]')).toContainText(
      "Transaction deleted",
    );
    await importJSON(page, {
      name: "old-owner-export.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(merged)),
    });
    await confirm(page);
    const deleted = await exportJSON(page);
    expect(deleted.records.find((e: any) => e.id === testTx.id).deleted).toBe(
      true,
    );
  } finally {
    await owner.close();
  }
  await nav(page, "Settings");
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Big Boss Hair Salon");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Settings saved",
  );
  await nav(page, "Dashboard");
  await page.clock.setFixedTime(new Date("2027-01-01T10:00:00Z"));
  await nav(page, "Reports");
  await nav(page, "Dashboard");
  await expect(page.getByText("December 2026", { exact: true })).toBeVisible();
  await shot(page, "11-january-previous-december");
  await page.clock.setFixedTime(new Date("2026-03-01T00:30:00Z"));
  await nav(page, "Reports");
  await nav(page, "Dashboard");
  await expect(page.getByText("January 2026", { exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-10-25T19:00:00Z"));
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await nav(page, "Dashboard");
  await expect(page.locator(".metric")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await shot(page, "12-mobile-dark-dashboard");
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose a Business" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: /Big Boss Hair Salon Open business/ })
    .click();
  const offline = await exportJSON(page);
  expect(
    offline.records.filter((e: any) => e.kind === "tx" && !e.deleted),
  ).toHaveLength(969);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose a Business" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Big Boss Hair Salon Open business/ })
    .click();
  await nav(page, "Commissions");
  await page.getByRole("button", { name: "Barbers", exact: true }).click();
  for (const n of names)
    await expect(
      page.getByRole("cell", { name: n, exact: true }),
    ).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test("profile removal safeguards, live commission corrections and accessible mobile forms", async ({
  page,
}) => {
  await create(page, "Big Boss");
  await nav(page, "Daily Sales");
  await page.getByLabel("Sales date", { exact: true }).fill("2026-06-15");
  await page
    .getByLabel("Revenue for Steven Hirmiz", { exact: true })
    .fill("100");
  await page.getByRole("button", { name: "Save day", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("Saved");
  await nav(page, "Commissions");
  await page.getByLabel("Through date", { exact: true }).fill("2026-06-30");
  await page
    .getByRole("button", { name: "Add stylist payment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Transaction date", { exact: true })
    .fill("2026-06-22");
  await page
    .getByRole("dialog")
    .getByLabel("Payee", { exact: true })
    .fill("Steven Hirmiz");
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("40");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText("Payment saved");
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", { name: "Steven Hirmiz", exact: true }),
      })
      .first(),
  ).toContainText("$10.00");
  await page.getByRole("button", { name: "Adjustments", exact: true }).click();
  await page
    .getByRole("button", { name: "Add adjustment", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Adjustment date", { exact: true })
    .fill("2026-06-22");
  const select = page
    .getByRole("dialog")
    .getByLabel("Stylist", { exact: true });
  await select.selectOption({ label: "Steven Hirmiz" });
  await page
    .getByRole("dialog")
    .getByLabel("Adjustment amount (+ or −)", { exact: true })
    .fill("10");
  await page
    .getByRole("dialog")
    .getByLabel("Adjustment note", { exact: true })
    .fill("Synthetic reconciliation");
  await page
    .getByRole("button", { name: "Save adjustment", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Adjustment saved",
  );
  await page.getByRole("button", { name: "Summary", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", { name: "Steven Hirmiz", exact: true }),
      })
      .first(),
  ).toContainText("$0.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await nav(page, "Daily Sales");
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await nav(page, "Settings");
  await page.getByLabel("Business name", { exact: true }).fill("Renamed Shop");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Settings saved",
  );
  await page
    .getByRole("button", { name: "Remove Business", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Permanently remove business",
      exact: true,
    }),
  ).toBeDisabled();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Download backup before removal",
      exact: true,
    })
    .click();
  await dl;
  await page
    .getByLabel("Type business name to remove", { exact: true })
    .fill("Renamed Shop");
  await page
    .getByRole("button", { name: "Permanently remove business", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a Business" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Renamed Shop Open business/ }),
  ).toHaveCount(0);
});

test("original full backup, Excel Journal, barber corrections, day deletion and guarded replacement", async ({
  page,
}) => {
  await create(page, "Backup verification");
  const originalBackup = {
    days: [
      {
        date: "2026-06-15",
        total: 120,
        card: 50,
        deposit: 10,
        sales: { "Steven Hirmiz": 100, "Sale Product": 20 },
        notes: "Synthetic original-format verification",
      },
    ],
    tx: [
      {
        id: "synthetic-payment",
        date: "2026-06-22",
        account: "Expense",
        cat: "Contract Labour",
        name: "Steven Hirmiz",
        details: "Synthetic",
        income: 0,
        expense: 40,
        credit: 0,
        deposit: 0,
        debit: 40,
      },
    ],
    staff: [...names, "Sale Product"],
    open: 7,
    bal: {
      asOf: "2026-06-01",
      limit: 150,
      items: [{ n: "Operating Line", v: -20 }],
    },
    adj: [
      {
        id: "synthetic-adjustment",
        date: "2026-06-22",
        name: "Steven Hirmiz",
        amt: 10,
        note: "Synthetic",
      },
    ],
  };
  await nav(page, "Data & Backup");
  await page.getByText("Restore original backup text", { exact: true }).click();
  await page
    .getByLabel("Original backup text", { exact: true })
    .fill(JSON.stringify(originalBackup));
  await page
    .getByRole("button", { name: "Preview backup text", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Import preview", exact: true }),
  ).toBeVisible();
  await confirm(page);
  await nav(page, "Daily Sales");
  await page
    .getByRole("button", { name: "Edit day 2026-06-15", exact: true })
    .click();
  await expect(
    page.getByLabel("Revenue for Steven Hirmiz", { exact: true }),
  ).toHaveValue("100.00");
  await expect(page.getByLabel("Product sales", { exact: true })).toHaveValue(
    "20.00",
  );
  await nav(page, "Commissions");
  await page.getByLabel("Through date", { exact: true }).fill("2026-06-30");
  await expect(
    page
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", { name: "Steven Hirmiz", exact: true }),
      })
      .first(),
  ).toContainText("$0.00");
  await page.getByRole("button", { name: "Barbers", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit barber Steven Hirmiz", exact: true })
    .click();
  await page
    .getByLabel("Barber name", { exact: true })
    .fill("Steven Hirmiz renamed");
  await page.getByLabel("Status", { exact: true }).selectOption("false");
  await page.getByRole("button", { name: "Save barber", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("Barber saved");
  await importJSON(page, {
    name: "same-original.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(originalBackup)),
  });
  await expect(page.locator(".conflict")).toHaveCount(0);
  await confirm(page);
  let file = await exportJSON(page);
  expect(file.records.filter((e: any) => e.kind === "staff")).toHaveLength(4);
  expect(
    file.records.find(
      (e: any) =>
        e.kind === "staff" && e.value.name === "Steven Hirmiz renamed",
    ).value.active,
  ).toBe(false);
  const { utils, write: writeWorkbook } = await import("xlsx"),
    wb = utils.book_new();
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet([
      [
        "Date",
        "Account",
        "Account Name",
        "Name",
        "Details",
        "Income",
        "Expense",
        "Credits",
        "Deposits",
        "Debits",
      ],
      ["2026-05-15", "Income", "Revenue", "Synthetic", "", 120, 0, 50, 0, 0],
      [
        "2026-05-22",
        "Expense",
        "Contract Labour",
        "Waseem Saleem",
        "Synthetic",
        0,
        50,
        0,
        0,
        50,
      ],
    ]),
    "May-26",
  );
  utils.book_append_sheet(
    wb,
    utils.aoa_to_sheet([
      ["Date", "Name", "Total Amount"],
      ["2026-05-15", "1-Waseem Saleem", 100],
      ["2026-05-15", "Sale Product", 20],
    ]),
    "Journal",
  );
  await page
    .getByText("Import original Excel workbook", { exact: true })
    .click();
  await page
    .getByLabel("Original Excel workbook", { exact: true })
    .setInputFiles({
      name: "synthetic.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(
        writeWorkbook(wb, { type: "buffer", bookType: "xlsx" }),
      ),
    });
  await expect(
    page.getByRole("heading", { name: "Import preview", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Type REPLACE", { exact: true }).fill("REPLACE");
  await confirm(page);
  file = await exportJSON(page);
  expect(
    file.records.filter((e: any) => e.kind === "day" && !e.deleted),
  ).toHaveLength(1);
  await nav(page, "Daily Sales");
  await page
    .getByRole("button", { name: "Delete day 2026-05-15", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText("Day deleted");
  await importJSON(page, {
    name: "older.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await confirm(page);
  const deleted = await exportJSON(page);
  expect(
    deleted.records.filter((e: any) => e.kind === "day" && !e.deleted),
  ).toHaveLength(0);
  await importJSON(page, {
    name: "restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await page.getByText("Replace instead of merge", { exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Replace all data in this business",
      exact: true,
    })
    .check();
  await expect(
    page.getByRole("button", { name: "Confirm Import", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Type REPLACE", { exact: true }).fill("REPLACE");
  await confirm(page);
  const restored = await exportJSON(page);
  expect(canonical(restored.records)).toBe(canonical(file.records));
  await nav(page, "Data & Backup");
  await page.getByText("Show five recorded totals", { exact: true }).click();
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
});

test("full Chromium process restart preserves the business database", async ({}, info) => {
  const { chromium } = await import("@playwright/test");
  const options = {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
    baseURL: "http://127.0.0.1:4173",
    acceptDownloads: true,
    downloadsPath: info.outputPath("downloads"),
  };
  const folder = info.outputPath("persistent-browser");
  let context = await chromium.launchPersistentContext(folder, options);
  let snapshot: any;
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await create(page, "Persistent Shop");
    await addExpense(page, "12.34");
    snapshot = await exportJSON(page);
  } finally {
    await context.close();
  }
  context = await chromium.launchPersistentContext(folder, options);
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Choose a Business" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Persistent Shop Open business/ })
      .click();
    const after = await exportJSON(page);
    expect(canonical(after.records)).toBe(canonical(snapshot.records));
  } finally {
    await context.close();
  }
});
