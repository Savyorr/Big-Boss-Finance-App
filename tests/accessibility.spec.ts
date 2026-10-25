import { createProfile } from "./profile-helpers";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("eight workspaces pass automated WCAG AA checks in light and dark themes", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  const gate = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(gate.violations.map((v) => v.id)).toEqual([]);
  await createProfile(page, "Accessible business");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
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
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        `${theme}/${route}`,
      ).toEqual([]);
    }
  }
  await page.screenshot({
    path: "test-results/stage4-dark-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/stage4-dark-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Edit Accessible business", exact: true })
    .click();
  const dialog = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(dialog.violations.map((v) => v.id)).toEqual([]);
});
