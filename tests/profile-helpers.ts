import { expect, type Page } from "@playwright/test";
export async function createProfile(page: Page, name: string, empty = false) {
  await page.goto(
    page.url().startsWith("http") ? new URL("/", page.url()).href : "/",
  );
  await expect(
    page
      .getByRole("heading", { name: "Choose your business", exact: true })
      .or(
        page.getByRole("button", { name: /Switch business profile:/ }).first(),
      ),
  ).toBeVisible();
  if (
    !(await page
      .getByRole("heading", { name: "Choose your business", exact: true })
      .count())
  )
    await page
      .getByRole("button", { name: /Switch business profile:/ })
      .first()
      .click();
  await expect(
    page.getByRole("heading", { name: "Choose your business", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Business name", { exact: true }).fill(name);
  if (empty) {
    await page
      .getByText("Restore a full app backup instead", { exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Create empty profile for full backup",
        exact: true,
      })
      .click();
  } else
    await page
      .getByRole("button", { name: "Create business profile", exact: true })
      .click();
  await expect(
    page.getByRole("heading", {
      name: empty ? "Data Management" : "Financial Overview",
      exact: true,
    }),
  ).toBeVisible();
}
export async function chooseProfile(page: Page, name: string) {
  await page.goto(
    page.url().startsWith("http") ? new URL("/", page.url()).href : "/",
  );
  await expect(
    page
      .getByRole("heading", { name: "Choose your business", exact: true })
      .or(
        page.getByRole("button", { name: /Switch business profile:/ }).first(),
      ),
  ).toBeVisible();
  if (
    !(await page
      .getByRole("heading", { name: "Choose your business", exact: true })
      .count())
  )
    await page
      .getByRole("button", { name: /Switch business profile:/ })
      .first()
      .click();
  await page
    .getByRole("button", {
      name: new RegExp("^" + name + " Open business profile"),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Financial Overview", exact: true }),
  ).toBeVisible();
}
// Older multi-location backup behavior remains covered through explicit advanced controls.
export async function addLegacyShop(page: Page, name: string) {
  await page.goto("/#/settings");
  await expect(
    page
      .getByRole("heading", { name: "Choose your business", exact: true })
      .or(page.getByRole("heading", { name: "Settings", exact: true })),
  ).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "Choose your business", exact: true })
      .count()
  ) {
    await createProfile(page, name);
    return;
  }
  if (
    (await page.locator(".legacy-location-controls").getAttribute("open")) ===
    null
  )
    await page.locator(".legacy-location-controls > summary").click();
  await page.getByRole("button", { name: "Add shop", exact: true }).click();
  await page.getByLabel("Shop name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save shop", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
export async function chooseLegacyLocation(page: Page, name: string) {
  await page.goto("/#/settings");
  if (
    (await page.locator(".legacy-location-controls").getAttribute("open")) ===
    null
  )
    await page.locator(".legacy-location-controls > summary").click();
  await page
    .locator(".legacy-location-controls")
    .getByRole("button", { name: /Select location:/ })
    .click();
  await page
    .getByRole("button", { name: new RegExp("^" + name + " ") })
    .click();
}
export async function uploadPreview(page: Page, value: unknown) {
  await page.goto("/#/data");
  await page.getByLabel("Select JSON file", { exact: true }).setInputFiles({
    name: "synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.getByRole("status")).toContainText("Preview ready");
}
