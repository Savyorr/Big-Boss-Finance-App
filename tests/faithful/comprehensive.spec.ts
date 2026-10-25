import { test, expect, type Page } from "@playwright/test";
import { unpackBackup } from "../../src/faithful/backup";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const path =
  process.env.BIG_BOSS_LEGACY_FIXTURE ??
  "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json";
async function nav(p: Page, name: string) {
  await p
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(
    p.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
  if (name === "Dashboard")
    await p.getByLabel("Dashboard month", { exact: true }).fill("2026-09");
}
async function capture(p: Page, name: string) {
  await mkdir("private/comprehensive-browser", { recursive: true });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({
    path: `private/comprehensive-browser/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function exportFile(p: Page) {
  await nav(p, "Data & Backup");
  const event = p.waitForEvent("download");
  await p
    .getByRole("button", { name: "Export Full Backup", exact: true })
    .click();
  return JSON.parse(await readFile((await (await event).path())!, "utf8"));
}
async function create(p: Page, name: string) {
  await p.goto("/");
  await p.getByLabel("Business name", { exact: true }).fill(name);
  await p.getByRole("button", { name: "Create Business", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
async function importFile(p: Page, file: any) {
  await nav(p, "Data & Backup");
  await p.getByLabel("Import JSON file", { exact: true }).setInputFiles(file);
  await expect(
    p.getByRole("heading", { name: "Review Changes", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Confirm Import", exact: true }).click();
  await expect(p.locator('p[role="status"]')).toContainText("Import complete");
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
const money = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    n / 100,
  );
const input = (n: number) => (n / 100).toFixed(2);
test("actual legacy dashboard, historical completion, live cross-tab charts, complete dark restore and isolation", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  const original = JSON.parse(await readFile(path, "utf8"));
  await create(page, "Big Boss Hair Salon");
  await importFile(page, path);
  const before = await exportFile(page),
    originalRows = before.records.filter((e: any) => e.kind === "tx");
  expect(originalRows).toHaveLength(968);
  await nav(page, "Dashboard");
  await expect(page.locator(".dashboard-sections > section > h2")).toHaveText([
    "Daily Income Graph",
    "Expense Breakdown",
    "Monthly Financial Statistics",
    "Historical Monthly Performance",
  ]);
  await expect(page.locator(".metric")).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "September 2026", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next Month", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Previous Month", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "August 2026", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next Month", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "September 2026", exact: true }),
  ).toBeVisible();
  await page.locator(".daily-chart .recharts-area-dot").first().hover();
  const point = page
    .getByRole("button", { name: /Select revenue 2026-/ })
    .first();
  await expect(point).toBeVisible();
  await point.click();
  await capture(page, "01-dashboard-light");
  const source =
    original.transactions.find(
      (t: any) =>
        t.date.startsWith("2026-09") && t.income > 0 && t.bankCredit > t.income,
    ) ??
    original.transactions.find(
      (t: any) => t.date.startsWith("2026-09") && t.income > 0,
    );
  const date = source.date;
  const sourceTotal = original.transactions
    .filter((t: any) => t.date === date)
    .reduce((a: number, t: any) => a + Math.round(t.income * 100), 0);
  const monthly = original.transactions
    .filter((t: any) => t.date.startsWith("2026-09"))
    .reduce((a: number, t: any) => a + Math.round(t.income * 100), 0);
  await page
    .getByLabel("Select revenue day", { exact: true })
    .selectOption(date);
  await expect(page.locator(".selected-income")).toContainText(
    money(sourceTotal),
  );
  await nav(page, "Daily Sales");
  await page.getByLabel("Sales date", { exact: true }).fill(date);
  await expect(
    page.getByRole("region", { name: "Recorded income for this date" }),
  ).toContainText(money(sourceTotal));
  await page
    .getByLabel("Revenue for Steven Hirmiz", { exact: true })
    .fill(input(sourceTotal - 100));
  await page.getByLabel("Product sales", { exact: true }).fill("0");
  await page
    .getByLabel("Notes", { exact: true })
    .fill(
      "Synthetic verification allocation only — not an assertion of historical individual sales",
    );
  await expect(
    page.getByRole("button", { name: "Save day", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("The breakdown does not match recorded income.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I confirm this revenue link and any difference shown above",
      exact: true,
    })
    .check();
  await capture(page, "02-historical-breakdown-confirmation");
  await page.getByRole("button", { name: "Save day", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("Saved " + date);
  const linked = await exportFile(page);
  expect(canonical(linked.records.filter((e: any) => e.kind === "tx"))).toBe(
    canonical(originalRows),
  );
  const d = linked.records.find((e: any) => e.kind === "day");
  expect(d.value.revenueLink.sources.length).toBeGreaterThan(0);
  expect(d.value.revenueLink.resolution).toBe("ledger");
  await nav(page, "Reports");
  await page.getByLabel("Report month", { exact: true }).fill("2026-09");
  await page
    .getByRole("button", { name: "Use daily sales", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Revenue source saved",
  );
  let chosen = await exportFile(page);
  expect(
    chosen.records.find((e: any) => e.kind === "day").value.revenueLink
      .resolution,
  ).toBe("daily");
  await nav(page, "Reports");
  await page.getByLabel("Report month", { exact: true }).fill("2026-09");
  await page
    .getByRole("button", { name: "Use transaction income", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Revenue source saved",
  );
  chosen = await exportFile(page);
  expect(
    chosen.records.find((e: any) => e.kind === "day").value.revenueLink
      .recordedTotal,
  ).toBe(sourceTotal);
  expect(canonical(chosen.records.filter((e: any) => e.kind === "tx"))).toBe(
    canonical(originalRows),
  );
  await nav(page, "Dashboard");
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText(money(monthly));
  // Dashboard remains open; a different tab writes to the same selected business.
  const other = await context.newPage();
  await other.goto("/");
  await other
    .getByRole("button", { name: /Big Boss Hair Salon Open business/ })
    .click();
  await nav(other, "Daily Sales");
  const missing = Array.from(
    { length: 30 },
    (_, i) => "2026-09-" + String(i + 1).padStart(2, "0"),
  ).find(
    (d) =>
      !original.transactions.some(
        (t: any) =>
          t.date === d && (t.income !== 0 || t.category === "Revenue"),
      ),
  )!;
  expect(missing).toBeTruthy();
  await other.getByLabel("Sales date", { exact: true }).fill(missing);
  await other.getByRole("button", { name: "Save day", exact: true }).click();
  await expect(other.locator('p[role="status"]')).toContainText("Saved");
  await page
    .getByLabel("Select revenue day", { exact: true })
    .selectOption(missing);
  await expect(page.locator(".selected-income")).toContainText(
    "Confirmed zero",
  );
  await other
    .getByRole("button", { name: "Edit day " + missing, exact: true })
    .click();
  await other
    .getByLabel("Revenue for Steven Hirmiz", { exact: true })
    .fill("100");
  await other.getByLabel("Product sales", { exact: true }).fill("20");
  await other
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(other.locator('p[role="status"]')).toContainText("Saved");
  await expect(page.locator(".selected-income")).toContainText("$120.00");
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText(money(monthly + 12000));
  await other
    .getByRole("button", { name: "Edit day " + missing, exact: true })
    .click();
  await other.getByLabel("Product sales", { exact: true }).fill("0");
  await other
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(other.locator('p[role="status"]')).toContainText("Saved");
  await expect(page.locator(".selected-income")).toContainText("$100.00");
  await other
    .getByRole("button", { name: "Delete day " + missing, exact: true })
    .click();
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(other.locator('p[role="status"]')).toContainText("Day deleted");
  await expect(page.locator(".selected-income")).toContainText(
    "Missing record",
  );
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText(money(monthly));
  await other.close();
  await nav(page, "Commissions");
  await page.getByRole("button", { name: "Barbers", exact: true }).click();
  for (const name of [
    "Steven Hirmiz",
    "Waseem Saleem",
    "Aeden Kajo",
    "Mattew Burns",
  ])
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  await capture(page, "03-four-original-barbers");
  await page
    .getByRole("button", { name: "Edit barber Steven Hirmiz", exact: true })
    .click();
  await page.getByLabel("Commission percent", { exact: true }).fill("60");
  await page
    .getByLabel("Rate effective from", { exact: true })
    .fill("2026-10-01");
  await page.getByRole("button", { name: "Save barber", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("Barber saved");
  await nav(page, "Daily Sales");
  await page
    .getByRole("button", { name: "Edit day " + date, exact: true })
    .click();
  await expect(
    page.getByLabel("Revenue for Steven Hirmiz", { exact: true }),
  ).toHaveValue(input(sourceTotal - 100));
  await page
    .getByText("Deposits and explicitly recorded tips", { exact: true })
    .click();
  await page
    .getByLabel("Explicitly recorded tips (optional)", { exact: true })
    .fill("1.23");
  await page
    .getByRole("checkbox", {
      name: "I confirm this revenue link and any difference shown above",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator('p[role="status"]')).toContainText("Saved");
  await nav(page, "Dashboard");
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await capture(page, "04-dashboard-charcoal-navy");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "05-dashboard-mobile-dark");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await capture(page, "05-dashboard-mobile-dark");
  await page.setViewportSize({ width: 1600, height: 1050 });
  const full = unpackBackup(await exportFile(page));
  expect(full.version).toBe(2);
  expect(full.recoveryBackups.length).toBeGreaterThan(0);
  expect(
    full.records.find((e: any) => e.kind === "settings").value.preferences
      .theme,
  ).toBe("dark");
  expect(
    full.records.find(
      (e: any) => e.kind === "staff" && e.value.name === "Steven Hirmiz",
    ).value.rateHistory,
  ).toHaveLength(1);
  expect(
    full.records.find((e: any) => e.kind === "day" && !e.deleted).value.tips,
  ).toBe(123);
  expect(canonical(full.records.filter((e: any) => e.kind === "tx"))).toBe(
    canonical(originalRows),
  );
  const fresh = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1600, height: 1050 },
    timezoneId: "America/Los_Angeles",
  });
  try {
    const restored = await fresh.newPage();
    await restored.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
    await create(restored, "Fresh restore");
    await importFile(restored, {
      name: "complete-business.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(full)),
    });
    await expect(restored.locator("html")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    const after = unpackBackup(await exportFile(restored));
    expect(canonical(after.records)).toBe(canonical(full.records));
    expect(canonical(after.sources)).toBe(canonical(full.sources));
    for (const backup of full.recoveryBackups)
      expect(after.recoveryBackups).toContainEqual(backup);
    await nav(restored, "Dashboard");
    await expect(
      restored.getByRole("region", { name: "Revenue", exact: true }),
    ).toContainText(money(monthly));
    await capture(restored, "06-complete-restoration-dark-dashboard");
  } finally {
    await fresh.close();
  }
  await page
    .getByRole("button", { name: "Switch Business", exact: true })
    .click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Independent trial shop");
  await page
    .getByRole("button", { name: "Create Business", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("region", { name: "Revenue", exact: true }),
  ).toContainText("$0.00");
  await expect(
    page.getByText("No recorded expenses in this month.", { exact: true }),
  ).toBeVisible();
  await capture(page, "07-independent-empty-profile");
});
test("dashboard charts and full backup controls remain accessible in both themes and mobile", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  await create(page, "Accessibility trial");
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  for (const dark of [false, true]) {
    if (dark)
      await page
        .getByRole("button", { name: "Use dark theme", exact: true })
        .click();
    await expect(
      page.getByRole("heading", { name: "Daily Income Graph", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
});

test("current-month chart preserves real September/October weekend records, fits mobile and restores a full backup", async ({
  page,
  browser,
}) => {
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  const original = JSON.parse(await readFile(path, "utf8"));
  await create(page, "Big Boss");
  await expect(page.getByLabel("Dashboard month", { exact: true })).toHaveValue(
    "2026-10",
  );
  await importFile(page, path);
  const before = await exportFile(page);
  await nav(page, "Dashboard");
  for (const month of ["2026-10", "2026-09"]) {
    await page.getByLabel("Dashboard month", { exact: true }).fill(month);
    const income = new Map<string, number>();
    for (const t of original.transactions)
      if (
        t.date.startsWith(month) &&
        (t.income !== 0 || t.category === "Revenue")
      )
        income.set(
          t.date,
          (income.get(t.date) ?? 0) + Math.round(t.income * 100),
        );
    await expect(page.locator(".daily-chart .recharts-area-dot")).toHaveCount(
      income.size,
    );
    await page
      .getByText("Daily income values and record coverage", { exact: true })
      .click();
    for (const [date, amount] of income) {
      const row = page
        .locator(".daily-income-panel tr")
        .filter({ has: page.getByRole("cell", { name: date, exact: true }) });
      await expect(row).toContainText(money(amount));
      await page
        .getByLabel("Select revenue day", { exact: true })
        .selectOption(date);
      await expect(page.locator(".selected-income")).toContainText(
        money(amount),
      );
    }
    if (month === "2026-10") {
      await page
        .getByLabel("Select revenue day", { exact: true })
        .selectOption("2026-10-31");
      await expect(page.locator(".selected-income")).toContainText(
        "Missing record",
      );
    }
    await page
      .getByText("Daily income values and record coverage", { exact: true })
      .click();
    await capture(page, "08-chart-" + month);
    const categories = page.locator(".expense-category");
    const colours = await categories
      .locator(".category-dot")
      .evaluateAll((es) => es.map((e) => getComputedStyle(e).backgroundColor));
    expect(new Set(colours).size).toBe(colours.length);
    if (
      original.transactions.some(
        (t: any) => t.date.startsWith(month) && t.expense !== 0,
      )
    ) {
      expect(colours.length).toBeGreaterThan(1);
      await expect(categories.first().locator("strong")).toHaveCSS(
        "color",
        "rgb(35, 50, 71)",
      );
      await expect(categories.first().locator("small")).toHaveCSS(
        "color",
        "rgb(35, 50, 71)",
      );
    } else {
      await expect(categories).toHaveCount(0);
      await expect(
        page.getByText("No recorded expenses in this month.", { exact: true }),
      ).toBeVisible();
    }
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page
          .locator(".daily-chart")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      )
      .toBe(true);
    const inside = await page.locator(".daily-chart").evaluate((e) => {
      const b = e.getBoundingClientRect();
      return [...e.querySelectorAll(".recharts-area-dot")].every((d) => {
        const r = d.getBoundingClientRect();
        return (
          r.left >= b.left &&
          r.right <= b.right &&
          r.top >= b.top &&
          r.bottom <= b.bottom
        );
      });
    });
    expect(inside).toBe(true);
    await capture(page, "09-mobile-" + month);
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await nav(page, "Data & Backup");
  await expect(
    page.getByText("Restore original backup text", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText("Import original Excel workbook", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByLabel("Restore Full Backup", { exact: true }),
  ).toBeVisible();
  await capture(page, "10-simple-data-backup");
  const backup = await exportFile(page);
  expect(canonical(backup.records)).toBe(canonical(before.records));
  const fresh = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    timezoneId: "America/Los_Angeles",
  });
  try {
    const p = await fresh.newPage();
    await create(p, "Restore test");
    await nav(p, "Data & Backup");
    await p.getByLabel("Restore Full Backup", { exact: true }).setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(
      p.getByRole("heading", { name: "Review Changes", exact: true }),
    ).toBeVisible();
    await expect(
      p.getByRole("button", { name: "Confirm Import", exact: true }),
    ).toBeDisabled();
    await p.getByLabel("Type REPLACE", { exact: true }).fill("REPLACE");
    await p
      .getByRole("button", { name: "Confirm Import", exact: true })
      .click();
    await expect(p.locator('p[role="status"]')).toContainText(
      "Import complete",
    );
    const restored = await exportFile(p);
    expect(canonical(restored.records)).toBe(canonical(backup.records));
    expect(canonical(restored.sources)).toBe(canonical(backup.sources));
  } finally {
    await fresh.close();
  }
});
