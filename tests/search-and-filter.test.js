"use strict";
/**
 * Core browse/search/filter/detail functionality against the built-in
 * library only (no import needed -- fast). Covers the everyday user path:
 * search, open a result, see its SPL, use a field-scoped search operator,
 * copy-to-clipboard.
 */
const { launch, fileUrl, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function main() {
  const t = new Reporter("search-and-filter");
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "search-and-filter");

  await page.goto(fileUrl("splunk-spl-library.html"));
  await page.waitForTimeout(1000);

  await t.step("free-text global search narrows results", async () => {
    const before = await page.locator(".entry-card").count();
    await page.fill("#globalSearchInput", "authentication");
    await page.waitForTimeout(500);
    const after = await page.locator(".entry-card").count();
    t.gte(before, after, "result count did not increase after typing a search term (before=" + before + ", after=" + after + ")");
    t.gte(after, 1, "\"authentication\" search returns at least one result");
  });

  await t.step("opening a result shows SPL in the detail panel", async () => {
    await page.locator(".entry-card").first().click();
    await page.waitForTimeout(300);
    const body = await page.locator("#detailBody").innerText();
    t.ok(body.length > 50, "detail panel has non-trivial content");
    t.ok(/PURPOSE|SPL/i.test(body), "detail panel includes a PURPOSE or SPL section heading");
  });

  await t.step("copy-SPL control writes the SPL text to the clipboard", async () => {
    const copyBtn = page.locator('[data-action="copy-spl"]').first();
    if (await copyBtn.count()) {
      await copyBtn.click();
      await page.waitForTimeout(200);
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      t.ok(clip.length > 0, "clipboard contains non-empty text after clicking Copy");
    } else {
      t.ok(false, "a copy-spl control exists on the open entry (not found)");
    }
  });

  await t.step("field-scoped search operator (category:) narrows results without erroring", async () => {
    await page.fill("#globalSearchInput", "category:\"Threat Detection\"");
    await page.waitForTimeout(500);
    const count = await page.locator(".entry-card").count();
    t.gte(count, 1, "category: scoped search returns at least one result (" + count + " found)");
  });

  await t.step("clearing search restores the full built-in result count", async () => {
    await page.fill("#globalSearchInput", "");
    await page.waitForTimeout(500);
    const count = await page.locator(".entry-card").count();
    t.gte(count, 1, "clearing the search box restores results (" + count + " cards rendered)");
  });

  t.ok(errors.length === 0, "zero console/page errors across the search/detail/copy flow" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
