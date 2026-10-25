import { createProfile, chooseProfile } from "./profile-helpers";
import { test, expect, chromium } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const origin = "http://127.0.0.1:47831";
async function start() {
  const process = spawn("node", ["release/Big Boss Finance/server.mjs"], {
    stdio: "pipe",
  });
  let failure = "";
  process.stderr.on("data", (b) => (failure += b.toString()));
  await expect
    .poll(async () => {
      if (process.exitCode !== null) throw new Error(failure);
      try {
        return (await fetch(origin + "/__health")).status;
      } catch {
        return 0;
      }
    })
    .toBe(200);
  return process;
}
async function stop(process: ChildProcess) {
  const finished = new Promise<void>((r) => process.once("exit", () => r()));
  process.kill();
  await finished;
}
test("packaged production server, browser restart persistence, offline lazy routes and portable backup", async () => {
  test.setTimeout(90000);
  const profile = await mkdtemp(join(tmpdir(), "big-boss-release-"));
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
  let server = await start();
  let context = await launch();
  try {
    expect((await fetch(origin + "/../server.mjs")).status).toBe(404);
    expect((await fetch(origin + "/%2e%2e%2fserver.mjs")).status).toBe(400);
    expect((await fetch(origin, { method: "POST" })).status).toBe(405);
    const duplicate = spawn("node", ["release/Big Boss Finance/server.mjs"], {
      stdio: "pipe",
    });
    const code = await new Promise((r) => duplicate.once("exit", r));
    expect(code).toBe(0);
    let page = context.pages()[0];
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/");
    await createProfile(page, "Restart persistence shop");
    await page.goto(origin + "/#/banking");
    await page
      .getByRole("button", { name: "Add account", exact: true })
      .click();
    await page.getByLabel("Account name").fill("Persistent bank");
    await page.getByLabel("Opening balance", { exact: true }).fill("1000.00");
    await page.getByLabel("Opening balance date").fill("2026-01-01");
    await page.getByRole("button", { name: "Save account" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(origin + "/#/transactions");
    await page
      .getByRole("button", { name: "Add Transaction", exact: true })
      .click();
    await page.getByLabel("Date", { exact: true }).fill("2026-06-10");
    await page.getByLabel("Amount", { exact: true }).fill("12.34");
    await page.getByLabel("Category (customizable)").fill("Rent");
    await page
      .getByLabel("Financial account")
      .selectOption({ label: "Persistent bank · Chequing" });
    await page
      .getByLabel("Description", { exact: true })
      .fill("Restart-safe cost");
    await page.getByRole("button", { name: "Save transaction" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await context.close();
    await stop(server);
    server = await start();
    context = await launch();
    page = context.pages()[0];
    await page.goto(origin + "/");
    if (
      await page
        .getByRole("heading", { name: "Choose your business", exact: true })
        .count()
    )
      await chooseProfile(page, "Restart persistence shop");
    await page.goto(origin + "/#/settings");
    await expect(
      page.getByRole("heading", {
        name: "Restart persistence shop",
        exact: true,
      }),
    ).toBeVisible();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/#/transactions");
    await expect(
      page.getByText("Restart-safe cost", { exact: true }),
    ).toBeVisible();
    await page.goto(origin + "/#/banking");
    await expect(
      page.getByRole("row").filter({ hasText: "Persistent bank" }),
    ).toContainText("$987.66");
    await context.setOffline(true);
    await page.reload();
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
      await page.goto(origin + "/#/" + route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    await page.goto(origin + "/#/data");
    await page
      .getByRole("button", { name: "Export business JSON", exact: true })
      .click();
    const event = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download JSON", exact: true })
      .click();
    const backup = JSON.parse(
      await readFile((await (await event).path())!, "utf8"),
    );
    expect(backup.data.shops[0].name).toBe("Restart persistence shop");
    expect(backup.data.transactions).toHaveLength(1);
    expect(backup.data.transactions[0].amountCents).toBe(1234);
    expect(backup.data.accounts[0].openingBalanceCents).toBe(100000);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await stop(server);
    await rm(profile, { recursive: true, force: true });
  }
});
