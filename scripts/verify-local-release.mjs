// Read-only reference files; isolated browser profile. Never load a live owner DB.
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
const root = resolve(
  process.env.BIG_BOSS_RELEASE_DIR ?? "release/Big Boss Finance",
);
const fixture =
  process.env.BIG_BOSS_LEGACY_FIXTURE ??
  "/workspace/attachments/d3e1664b-6fc9-4965-8033-ce9d39fc7678/Big_Boss_Finance_Backup_2026-10-23.json";
const raw = await readFile(fixture);
if (
  createHash("sha256").update(raw).digest("hex") !==
  "97cdf787ba0bea5fdffe42c3490ebf4819845d5b5a09497c27ac5c2696bae76a"
)
  throw Error("Original JSON checksum changed");
const expected = JSON.parse(
  await readFile(
    process.env.BIG_BOSS_LEGACY_EXPECTED ??
      "private/legacy-expected-totals.json",
    "utf8",
  ),
);
for (const name of [
  "server.mjs",
  "Start Big Boss Finance.cmd",
  "READ ME FIRST.md",
  "app/index.html",
])
  await stat(resolve(root, name));
const evidence = resolve("private/faithful-browser");
await mkdir(evidence, { recursive: true });
const folder = resolve("private/release-browser-" + randomUUID()),
  url = "http://127.0.0.1:47831";
let server, context;
async function start() {
  try {
    await fetch(url + "/__health", { signal: AbortSignal.timeout(500) });
    throw Error(
      "Port 47831 already serves a program. Close that helper before this isolated release check.",
    );
  } catch (e) {
    if (!String(e).includes("fetch failed") && !String(e).includes("aborted"))
      throw e;
  }
  server = spawn(process.execPath, [resolve(root, "server.mjs")], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw Error("Packaged server exited unexpectedly");
    try {
      const response = await fetch(url + "/__health");
      if ((await response.json()).application === "big-boss-finance-local-v1")
        return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Local release server did not start");
}
async function stop() {
  if (server && server.exitCode === null) {
    const ended = once(server, "exit");
    server.kill("SIGTERM");
    await ended;
  }
  server = undefined;
}
async function launch() {
  context = await chromium.launchPersistentContext(folder, {
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
    args: ["--no-sandbox"],
    acceptDownloads: true,
    viewport: { width: 1600, height: 1050 },
    timezoneId: "America/Los_Angeles",
  });
  return context.pages()[0] ?? (await context.newPage());
}
async function nav(page, name) {
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
}
async function exportJSON(page) {
  await nav(page, "Data & Backup");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Full Backup", exact: true })
    .click();
  const d = await event;
  if (await d.failure()) throw Error("Packaged JSON download failed");
  return JSON.parse(await readFile(await d.path(), "utf8"));
}
const canonical = (x) =>
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
try {
  await start();
  const response = await fetch(url);
  expect(response.headers.get("content-security-policy")).toContain(
    "script-src 'self'",
  );
  let page = await launch();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  await page.goto(url);
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Big Boss Hair Salon");
  await page
    .getByRole("button", { name: "Create Business", exact: true })
    .click();
  await nav(page, "Data & Backup");
  await page
    .getByLabel("Import JSON file", { exact: true })
    .setInputFiles(fixture);
  await expect(
    page.getByRole("heading", { name: "Review Changes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await expect(page.locator('p[role="status"]')).toContainText(
    "Import complete",
    { timeout: 30000 },
  );
  const before = await exportJSON(page),
    tx = before.records.filter((e) => e.kind === "tx" && !e.deleted);
  expect(tx).toHaveLength(968);
  for (const [k, v] of Object.entries(expected))
    expect(tx.reduce((s, e) => s + e.value[k], 0)).toBe(v);
  await nav(page, "Dashboard");
  await expect(page.locator(".metric")).toHaveCount(3);
  await expect(page.locator("main h2:not(.dashboard-month)")).toHaveText([
    "Daily Income Graph",
    "Expense Breakdown",
    "Monthly Financial Statistics",
    "Historical Monthly Performance",
  ]);
  await expect(page.locator(".recharts-wrapper")).toHaveCount(2);
  await expect(
    page.getByText("No recorded expenses in this month.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "October 2026", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, "13-extracted-release-dashboard.png"),
    fullPage: true,
    animations: "disabled",
  });
  // Confirm the bundled original workbook reader also works under packaged CSP.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
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
      [
        "2026-05-15",
        "Income",
        "Revenue",
        "Synthetic",
        "Synthetic release preview only",
        120,
        0,
        50,
        0,
        0,
      ],
    ]),
    "May-26",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Date", "Name", "Total Amount"],
      ["2026-05-15", "Steven Hirmiz", 100],
      ["2026-05-15", "Sale Product", 20],
    ]),
    "Journal",
  );
  await nav(page, "Data & Backup");
  await page.getByText("Advanced migration utilities", { exact: true }).click();
  await page
    .getByText("Import original Excel workbook", { exact: true })
    .click();
  await page
    .getByLabel("Original Excel workbook", { exact: true })
    .setInputFiles({
      name: "synthetic-preview.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
    });
  await expect(
    page.getByRole("heading", { name: "Review Changes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel preview", exact: true })
    .click();
  expect(errors).toEqual([]);
  await context.close();
  context = undefined;
  await stop();
  await start();
  page = await launch();
  await page.clock.install({ time: new Date("2026-10-25T19:00:00Z") });
  await page.goto(url);
  await page
    .getByRole("button", { name: /Big Boss Hair Salon Open business/ })
    .click();
  const after = await exportJSON(page);
  expect(canonical(after.records)).toBe(canonical(before.records));
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: /Big Boss Hair Salon Open business/ })
    .click();
  const offline = await exportJSON(page);
  expect(canonical(offline.records)).toBe(canonical(before.records));
  await nav(page, "Dashboard");
  await expect(page.locator(".metric")).toHaveCount(3);
  await expect(page.locator("main h2:not(.dashboard-month)")).toHaveText([
    "Daily Income Graph",
    "Expense Breakdown",
    "Monthly Financial Statistics",
    "Historical Monthly Performance",
  ]);
  await expect(page.locator(".recharts-wrapper")).toHaveCount(2);
  await expect(
    page.getByText("No recorded expenses in this month.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "October 2026", exact: true }),
  ).toBeVisible();
  await page.bringToFront();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
      ),
  );
  await page.screenshot({
    path: resolve(evidence, "14-extracted-release-offline-after-restart.png"),
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    "Extracted release verified: all 968 records/five sums, packaged CSP, Excel preview, complete JSON download, browser AND server restart, offline export and persistence.",
  );
} finally {
  if (context) await context.close();
  await stop();
}
