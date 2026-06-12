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
  // answer (game ends, still 14 used); either way the counter moved.
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
  await page.locator("#classic-view button[data-back]").click();
  await expect(page.locator("#menu-view")).toBeVisible();
});

test("past-days dialog opens and lists at least today", async ({ page }) => {
  await page.locator('[data-past-days="classic"]').click();
  await expect(page.locator("#past-days-dialog")).toBeVisible();
  await expect(page.locator("#past-days-grid .past-day-btn")).not.toHaveCount(0);
});

test("deep link to a past daily loads that exact date", async ({ page }) => {
  await page.goto("/#classic/daily/2026-05-25");
  await page.reload(); // a hash-only goto is same-document; reload re-runs the router
  await expect(page.locator("#classic-view")).toBeVisible();
  await expect(page.locator("#puzzle-date")).toHaveText("25/05/2026");
});

test("random game generates a seed, shows it, and puts it in the URL", async ({ page }) => {
  await page.locator('[data-mode="classic-random"]').click();
  await expect(page.locator("#classic-view")).toBeVisible();
  await expect(page.locator("#puzzle-date")).toContainText("código:");
  await expect(page).toHaveURL(/#classic\/random\/.+/);
});

test("deep link to a random seed reopens the same seed", async ({ page }) => {
  await page.goto("/#crossword/random/abc123");
  await page.reload(); // a hash-only goto is same-document; reload re-runs the router
  await expect(page.locator("#crossword-view")).toBeVisible();
  await expect(page.locator("#cw-puzzle-date")).toHaveText("código: abc123");
  await expect(page).toHaveURL(/#crossword\/random\/abc123$/);
});

test("seed dialog plays the pasted seed", async ({ page }) => {
  await page.locator('[data-seed-input="classic"]').click();
  await expect(page.locator("#seed-dialog")).toBeVisible();
  await page.locator("#seed-dialog-input").fill("deadbeef");
  await page.locator("#seed-form button[type=submit]").click();
  await expect(page.locator("#classic-view")).toBeVisible();
  await expect(page.locator("#puzzle-date")).toHaveText("código: deadbeef");
  await expect(page).toHaveURL(/#classic\/random\/deadbeef$/);
});

test("seed dialog shows an error for invalid input and stays open", async ({ page }) => {
  await page.locator('[data-seed-input="classic"]').click();
  await page.locator("#seed-dialog-input").fill("qualquer dica");
  await page.locator("#seed-form button[type=submit]").click();
  await expect(page.locator("#seed-error")).toBeVisible();
  await expect(page.locator("#seed-dialog")).toBeVisible();
  await expect(page.locator("#menu-view")).toBeVisible();
  // typing again clears the error
  await page.locator("#seed-dialog-input").fill("ok123");
  await expect(page.locator("#seed-error")).toBeHidden();
});

test("clicking the title returns to the menu", async ({ page }) => {
  await page.locator('[data-mode="classic-daily"]').click();
  await expect(page.locator("#classic-view")).toBeVisible();
  // Not started yet, so no confirmation: the title is a back trigger.
  await page.locator("#classic-view h1.topbar-home").click();
  await expect(page.locator("#menu-view")).toBeVisible();
});

test("leaving an in-progress random game asks to confirm and shows the code", async ({ page }) => {
  await page.locator('[data-mode="classic-random"]').click();
  await expect(page.locator("#classic-view")).toBeVisible();
  const seed = (await page.locator("#puzzle-date").textContent()).replace("código: ", "").trim();

  await page.locator("#guess-input").fill("porta");
  await page.locator("#guess-input").press("Enter");

  await page.locator("#classic-view button[data-back]").click();
  await expect(page.locator("#exit-dialog")).toBeVisible();
  await expect(page.locator("#exit-code")).toHaveText(seed);

  // Cancelling keeps us in the game.
  await page.locator("#exit-cancel").click();
  await expect(page.locator("#exit-dialog")).toBeHidden();
  await expect(page.locator("#classic-view")).toBeVisible();

  // Confirming leaves to the menu.
  await page.locator("#classic-view button[data-back]").click();
  await page.locator("#exit-confirm").click();
  await expect(page.locator("#menu-view")).toBeVisible();
});

test("leaving an in-progress daily game hides the code/link row", async ({ page }) => {
  // Daily games have no shareable code, so the code/link row must stay hidden.
  // (A CSS display:flex once overrode the `hidden` attribute, leaving an empty
  // box and a dead "Copiar link" button.)
  await page.locator('[data-mode="classic-daily"]').click();
  await expect(page.locator("#classic-view")).toBeVisible();

  await page.locator("#guess-input").fill("porta");
  await page.locator("#guess-input").press("Enter");

  await page.locator("#classic-view button[data-back]").click();
  await expect(page.locator("#exit-dialog")).toBeVisible();
  await expect(page.locator("#exit-code-row")).toBeHidden();
});

test("OS back button on an in-progress game triggers the confirm dialog", async ({ page }) => {
  await page.locator('[data-mode="classic-random"]').click();
  await expect(page.locator("#classic-view")).toBeVisible();
  await page.locator("#guess-input").fill("porta");
  await page.locator("#guess-input").press("Enter");

  // Browser/OS back: intercepted, stays in the game, prompts.
  await page.goBack();
  await expect(page.locator("#exit-dialog")).toBeVisible();
  await expect(page.locator("#classic-view")).toBeVisible();

  await page.locator("#exit-confirm").click();
  await expect(page.locator("#menu-view")).toBeVisible();
});
