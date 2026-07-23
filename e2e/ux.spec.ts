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

/** Open a sheet — no name gate; editor is ready immediately. */
async function openSheet(page: Page, room?: string) {
  const id = room ?? `sheet-${Date.now().toString(16)}`;
  await clearAppState(page);
  await page.goto(`/?room=${id}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("dialog", { name: /display name/i }),
  ).toHaveCount(0);
  return id;
}

async function insertMode(page: Page) {
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("i");
}

async function editorText(page: Page) {
  return page.locator(".cm-content").innerText();
}

test.describe("VimTex UX shell", () => {
  test("opens directly into editor without name modal", async ({ page }) => {
    await openSheet(page);
    await expect(page.getByText("VimTex").first()).toBeVisible();
    await expect(page.locator(".cm-editor.cm-focused")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /^preview$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^new$/i })).toBeVisible();
  });

  test("preview toggle keeps editor mounted", async ({ page }) => {
    await openSheet(page);
    const preview = page.getByRole("button", { name: /^preview$/i });
    await preview.click();
    await expect(preview).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".latex-preview")).toBeVisible();
    await expect(page.locator(".cm-editor")).toBeVisible();

    await preview.click();
    await expect(preview).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".latex-preview")).toHaveCount(0);
    await expect(page.locator(".cm-editor")).toBeVisible();
  });

  test("toolbar pills meet touch target height", async ({ page }, testInfo) => {
    await openSheet(page);

    const pills = page.locator("header .vt-pill");
    const count = await pills.count();
    expect(count).toBeGreaterThan(3);

    for (let i = 0; i < count; i++) {
      const box = await pills.nth(i).boundingBox();
      expect(box, `pill ${i} has box`).toBeTruthy();
      expect(box!.height, `pill ${i} height on ${testInfo.project.name}`).toBeGreaterThanOrEqual(
        40,
      );
    }

    const brand = page.locator(".vt-brand");
    await expect(brand).toBeVisible();
    const brandBox = await brand.boundingBox();
    expect(brandBox!.width).toBeGreaterThan(40);
  });

  test("mobile header does not clip primary tools", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile-only overflow check");

    await openSheet(page);

    const toolbar = page.locator(".vt-toolbar");
    await expect(toolbar).toBeVisible();

    const newBtn = page.getByRole("button", { name: /^new$/i });
    const preview = page.getByRole("button", { name: /^preview$/i });
    await expect(newBtn).toBeVisible();
    await expect(preview).toBeVisible();

    const toolbarBox = await toolbar.boundingBox();
    const newBox = await newBtn.boundingBox();
    expect(toolbarBox).toBeTruthy();
    expect(newBox).toBeTruthy();
    expect(newBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y - 2);
    expect(newBox!.y + newBox!.height).toBeLessThanOrEqual(
      toolbarBox!.y + toolbarBox!.height + 4,
    );

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("chat stream has no message cards", async ({ page }) => {
    await openSheet(page);

    await page.getByRole("button", { name: /^chat$/i }).click();
    const chat = page.getByRole("complementary", { name: /room chat/i });
    await expect(chat).toBeVisible();

    await expect(chat.getByLabel(/model for @ai/i)).toBeVisible();
    await expect(chat.locator(".vt-chat-composer__field")).toBeVisible();

    const input = chat.getByPlaceholder(/^message/i);
    await input.fill("hello stream");
    await chat.getByRole("button", { name: /send message/i }).click();

    await expect(chat.getByText("hello stream")).toBeVisible();
    await expect(chat.locator(".vt-chat-msg")).toHaveCount(1);
    await expect(chat.locator(".vt-chat-msg .rounded-lg.border")).toHaveCount(0);
  });

  test("status bar exposes editable name", async ({ page }) => {
    await openSheet(page);

    const nameBtn = page.locator("footer button").first();
    await nameBtn.click();
    const dialog = page.getByRole("dialog", { name: /display name/i });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder(/axion/i).fill("Renamed");
    await dialog.getByRole("button", { name: /^save$/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /^renamed$/i })).toBeVisible();
  });
});

test.describe("Inline scratchpad contract", () => {
  test("prose and inline math on the same line stay separate", async ({ page }) => {
    await openSheet(page);
    await insertMode(page);
    await page.keyboard.type("hi \\frac{1}{2} there");
    await page.keyboard.press("Escape");
    await page.keyboard.press("o");

    await expect.poll(async () => editorText(page)).toContain("hi");
    await expect.poll(async () => editorText(page)).toContain("there");
    await expect(page.locator(".cm-math-widget")).toHaveCount(1);
    await expect(page.locator(".cm-math-widget")).not.toHaveClass(/cm-math-display/);
  });

  test("bare TeX renders inline without display styling", async ({ page }) => {
    await openSheet(page);
    await insertMode(page);
    await page.keyboard.type("\\frac{1}{2}");
    await page.keyboard.press("Escape");
    await page.keyboard.press("o");

    const widget = page.locator(".cm-math-widget").first();
    await expect(widget).toBeAttached({ timeout: 5_000 });
    await expect(widget).not.toHaveClass(/cm-math-display/);
  });

  test("caret inside math reveals raw source", async ({ page }) => {
    await openSheet(page);
    await insertMode(page);
    await page.keyboard.type("\\frac{1}{2}");
    await page.keyboard.press("Escape");
    await page.keyboard.press("0");

    await expect.poll(async () => editorText(page)).toContain("\\frac");

    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".cm-math-widget")).toHaveCount(0);
    await expect.poll(async () => editorText(page)).toContain("\\frac");
  });

  test("explicit display math uses display styling", async ({ page }) => {
    await openSheet(page);
    await insertMode(page);
    await page.keyboard.type("\\[E = mc^{2}\\]");
    await page.keyboard.press("Escape");
    await page.keyboard.press("o");

    const display = page.locator(".cm-math-widget.cm-math-display");
    await expect(display.first()).toBeAttached({ timeout: 5_000 });
  });

  test("invalid TeX shows non-destructive error styling", async ({ page }) => {
    await openSheet(page);
    await insertMode(page);
    await page.keyboard.type("\\badcmd{x}");
    await page.keyboard.press("Escape");
    await page.keyboard.press("o");

    await expect(page.locator(".cm-math-widget.cm-math-error").first()).toBeAttached({
      timeout: 5_000,
    });
    await expect.poll(async () => editorText(page)).toContain("\\badcmd");
  });

  test("local autosave restores after reload", async ({ page }) => {
    const room = `restore-${Date.now().toString(16)}`;
    await openSheet(page, room);
    await insertMode(page);
    await page.keyboard.type("x = 42");
    await page.keyboard.press("Escape");

    await expect.poll(async () => editorText(page)).toContain("x = 42");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => editorText(page)).toContain("x = 42");
  });

  test("rooms keep isolated local caches", async ({ page }) => {
    const roomA = `iso-a-${Date.now().toString(16)}`;
    const roomB = `iso-b-${Date.now().toString(16)}`;

    await openSheet(page, roomA);
    await insertMode(page);
    await page.keyboard.type("room-a-content");
    await page.keyboard.press("Escape");
    await expect.poll(async () => editorText(page)).toContain("room-a-content");

    await page.goto(`/?room=${roomB}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => editorText(page)).not.toContain("room-a-content");
  });

  test("new sheet starts empty in a fresh room", async ({ page }) => {
    const room = `new-${Date.now().toString(16)}`;
    await openSheet(page, room);
    await insertMode(page);
    await page.keyboard.type("to be cleared");
    await page.keyboard.press("Escape");
    await expect.poll(async () => editorText(page)).toContain("to be cleared");

    const urlBefore = page.url();
    await page.getByRole("button", { name: /^new$/i }).click();
    await expect.poll(() => page.url()).not.toBe(urlBefore);
    await expect.poll(async () => editorText(page)).not.toMatch(/to be cleared/);

    await page.goto(urlBefore, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => editorText(page)).toContain("to be cleared");
  });
});
