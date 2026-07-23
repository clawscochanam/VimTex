import { expect, test, type Page } from "@playwright/test";

async function clearAppState(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

async function openSheet(page: Page, room?: string) {
  const id = room ?? `tex-${Date.now().toString(16)}`;
  await clearAppState(page);
  await page.goto(`/?room=${id}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
  return id;
}

async function vimInsertAtEnd(page: Page) {
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+G");
  await page.keyboard.press("o");
}

async function editorText(page: Page) {
  return page.locator(".cm-content").innerText();
}

test.describe("LaTeX tab completion", () => {
  test("\\frac + Tab inserts {}{}", async ({ page }) => {
    await openSheet(page);
    await vimInsertAtEnd(page);

    await page.keyboard.type("\\frac");
    await page.keyboard.press("Tab");

    await expect.poll(async () => editorText(page)).toContain("\\frac{}{}");
  });

  test("\\sqrt + Tab inserts {}", async ({ page }) => {
    await openSheet(page);
    await vimInsertAtEnd(page);

    await page.keyboard.type("\\sqrt");
    await page.keyboard.press("Tab");

    await expect.poll(async () => editorText(page)).toContain("\\sqrt{}");
  });

  test("\\fr suggests frac and Tab expands braces", async ({ page }) => {
    await openSheet(page);
    await vimInsertAtEnd(page);

    await page.keyboard.type("\\fr");
    await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("\\frac");

    await page.keyboard.press("Tab");
    await expect.poll(async () => editorText(page)).toContain("\\frac{}{}");
  });

  test("Enter jumps through \\frac{}{} brace fields", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "Mobile emulation routes Enter inconsistently in headless tests",
    );

    await openSheet(page);
    await vimInsertAtEnd(page);

    await page.keyboard.type("\\frac");
    await page.keyboard.press("Tab");
    await page.keyboard.type("a");
    await page.keyboard.press("Enter");
    await page.keyboard.type("b");

    await expect.poll(async () => editorText(page)).toContain("\\frac{a}{b}");
  });
});
