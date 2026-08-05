"use strict";
/**
 * Create-a-custom-entry flow via the real UI (the EntryEditor dialog), not
 * a shortcut API call. Exercises the single-entry persist path
 * (LibraryRepository.saveNew -> persistCustom), separate from the bulk-
 * import path covered by import-persistence.test.js, and confirms the new
 * entry is searchable and survives a reload.
 */
const { launch, fileUrl, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function main() {
  const t = new Reporter("entry-editor");
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "entry-editor");

  await page.goto(fileUrl("splunk-spl-library.html"));
  await page.waitForTimeout(1000);

  const uniqueTitle = "Regression Suite Test Entry " + Date.now();
  const uniqueSpl = "index=regression_suite_test | stats count by _time";

  await t.step("create a new custom entry via the Add Entry dialog", async () => {
    await page.click("#btnAddEntry");
    await page.waitForTimeout(300);
    await page.fill("#fTitle", uniqueTitle);
    await page.fill("#fSummary", "Created by the automated regression suite.");
    await page.fill("#fCategory", "Core SPL");
    await page.fill("#fSpl", uniqueSpl);
    await page.waitForTimeout(400); // let debounced input listeners sync the draft object
    await page.click("#btnEditorSave");
    await page.waitForTimeout(500);
  });

  const dialogStillOpen = await page.locator("#dlgEntryEditor").isVisible().catch(() => false);
  t.ok(!dialogStillOpen, "editor dialog closes after a successful save (validation passed)");

  await t.step("the new entry is immediately searchable", async () => {
    await page.fill("#globalSearchInput", uniqueTitle);
    await page.waitForTimeout(600);
    const hits = await page.locator(".entry-card").count();
    t.gte(hits, 1, "new entry is findable by its unique title immediately after saving (" + hits + " hits)");
  });

  const countBeforeReload = await page.evaluate(() => LibraryRepository.getCustomCount());

  await t.step("the new entry survives a reload (single-entry persist path)", async () => {
    await page.reload();
    await page.waitForTimeout(1500);
    const countAfterReload = await page.evaluate(() => LibraryRepository.getCustomCount());
    t.eq(countAfterReload, countBeforeReload, "custom count unchanged across reload (" + countAfterReload + ")");

    await page.fill("#globalSearchInput", uniqueTitle);
    await page.waitForTimeout(600);
    const hits = await page.locator(".entry-card").count();
    t.gte(hits, 1, "new entry is still findable after reload (" + hits + " hits)");
    if (hits >= 1) {
      await page.locator(".entry-card").first().click();
      await page.waitForTimeout(300);
      const body = await page.locator("#detailBody").innerText();
      t.includes(body, "regression_suite_test", "reloaded entry's detail panel contains the original SPL");
    }
  });

  await t.step("clean up: delete the test entry so repeated runs don't accumulate junk", async () => {
    await page.fill("#globalSearchInput", uniqueTitle);
    await page.waitForTimeout(500);
    const hits = await page.locator(".entry-card").count();
    if (hits >= 1) {
      await page.locator(".entry-card").first().click();
      await page.waitForTimeout(300);
      const deleteBtn = page.locator('[data-action="delete-entry"]');
      if (await deleteBtn.count()) {
        await deleteBtn.click();
        await page.waitForTimeout(200);
        await page.click("#btnConfirmOk");
        await page.waitForTimeout(500);
      }
    }
    await page.fill("#globalSearchInput", uniqueTitle);
    await page.waitForTimeout(500);
    const remaining = await page.locator(".entry-card").count();
    t.eq(remaining, 0, "test entry no longer appears after cleanup (this browser session's IndexedDB is discarded anyway, but this also validates delete-entry works)");
  });

  t.ok(errors.length === 0, "zero console/page errors across create/search/reload/delete" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
