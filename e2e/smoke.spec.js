import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Start from a clean slate so saved daily progress never affects assertions.
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
});

test("menu is the initial view and shows both modes", async ({ page }) => {
  await expect(page.locator("#menu-view")).toBeVisible();
  await expect(page.getByRole("button", { name: "Do dia" })).toHaveCount(2);
  await expect(page.locator("#classic-view")).toBeHidden();
  await expect(page.locator("#crossword-view")).toBeHidden();
});

test("classic: a valid guess is accepted and consumes a turn", async ({ page }) => {
  await page.locator('[data-mode="classic-daily"]').click();
  await expect(page.locator("#classic-view")).toBeVisible();
  await expect(page.locator("#guesses-left")).toHaveText("15");

  await page.locator("#guess-input").fill("porta");
  await page.locator("#guess-input").press("Enter");

  // Either the guess narrowed the range (14 left) or it happened to be the
  // answer (game ends, still 14 used) — either way the counter moved.
  await expect(page.locator("#guesses-left")).toHaveText("14");
});

test("classic: invalid input is rejected with a toast and no turn lost", async ({ page }) => {
  await page.locator('[data-mode="classic-daily"]').click();
  await page.locator("#guess-input").fill("abc");
  await page.locator("#guess-input").press("Enter");

  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#guesses-left")).toHaveText("15");
});

test("crossword: board renders a grid of cells", async ({ page }) => {
  await page.locator('[data-mode="crossword-daily"]').click();
  await expect(page.locator("#crossword-view")).toBeVisible();
  await expect(page.locator("#cw-grid .cw-cell").first()).toBeVisible();
  await expect(page.locator("#cw-guesses-left")).toHaveText("50");
});

test("navigation: back button returns to the menu", async ({ page }) => {
  await page.locator('[data-mode="classic-daily"]').click();
  await expect(page.locator("#classic-view")).toBeVisible();
  await page.locator("#classic-view [data-back]").click();
  await expect(page.locator("#menu-view")).toBeVisible();
});

test("past-days dialog opens and lists at least today", async ({ page }) => {
  await page.locator('[data-past-days="classic"]').click();
  await expect(page.locator("#past-days-dialog")).toBeVisible();
  await expect(page.locator("#past-days-grid .past-day-btn")).not.toHaveCount(0);
});
