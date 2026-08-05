"use strict";
/**
 * The most important test in this suite. It's a permanent regression guard
 * for two real bugs found (and fixed) while adding the ~5,000th entry to
 * this library:
 *
 *   1. MAX_IMPORT_BYTES was hardcoded to 20 MB and custom-entries.json grew
 *      past it, silently leaving the Import dialog's Run button disabled
 *      forever with no obvious error.
 *   2. persistCustomBulk() (the IndexedDB bulk write) was fire-and-forget,
 *      so a reload shortly after a large import could lose data that the
 *      UI had already reported as successfully imported -- and for
 *      auto-import specifically, the "already ran" flag was set *before*
 *      the write durably completed, so an interrupted run would never
 *      retry.
 *
 * This test drives the real Import dialog UI (not a shortcut/direct API
 * call) with the actual current custom-entries.json, then reloads and
 * verifies via the real IndexedDB record count -- not just the in-memory
 * count, which updates synchronously and would not have caught bug #2 --
 * that every entry survived.
 */
const fs = require("fs");
const { launch, fileUrl, repoPath, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function idbCount(page) {
  return page.evaluate(async () => {
    const all = await StorageService.idbGetAllEntries();
    return all.length;
  });
}

async function main() {
  const t = new Reporter("import-persistence");
  const browser = await launch();

  const customEntries = JSON.parse(fs.readFileSync(repoPath("custom-entries.json"), "utf-8"));
  const expectedCount = customEntries.length;
  const buf = fs.readFileSync(repoPath("custom-entries.json"));

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "import-persistence");

  await page.goto(fileUrl("splunk-spl-library.html"));
  await page.waitForTimeout(1000);

  await t.step("Import dialog opens and accepts the full current custom-entries.json", async () => {
    await page.click("#btnImport");
    await page.waitForTimeout(200);
    await page.setInputFiles("#importFile", { name: "custom-entries.json", mimeType: "application/json", buffer: buf });
    // Regression guard for bug #1: if this times out, MAX_IMPORT_BYTES is
    // probably smaller than the current file size again.
    await page.waitForSelector("#btnRunImport:not([disabled])", { timeout: 90000 });
  });

  await page.click("#btnRunImport");

  // Regression guard for bug #2, part A: importEntries() must resolve (i.e.
  // the awaited persistCustomBulk must complete) within a sane window, not
  // hang or silently stall.
  await t.step("import completes and in-memory custom count matches the source file", async () => {
    await page.waitForFunction(
      (expected) => typeof LibraryRepository !== "undefined" && LibraryRepository.getCustomCount() >= expected,
      expectedCount,
      { timeout: 120000 }
    );
  });

  const memCountAfterImport = await page.evaluate(() => LibraryRepository.getCustomCount());
  t.gte(memCountAfterImport, expectedCount, "in-memory custom count after import (" + memCountAfterImport + ") >= source file entry count (" + expectedCount + ")");

  // Regression guard for bug #2, part B (the actual data-loss scenario):
  // confirm the write is durably in IndexedDB *before* reloading, by reading
  // IndexedDB directly rather than trusting the in-memory count.
  let idbCountBeforeReload = -1;
  await t.step("IndexedDB itself (not just in-memory state) reflects the full import before reload", async () => {
    idbCountBeforeReload = await idbCount(page);
  });
  t.gte(idbCountBeforeReload, expectedCount, "IndexedDB record count before reload (" + idbCountBeforeReload + ") >= source file entry count (" + expectedCount + ")");

  // The actual regression scenario: reload immediately (as a user closing
  // and reopening the tab right after a big import would), then confirm
  // nothing was lost.
  await t.step("reload immediately after import, then confirm persistence via IndexedDB", async () => {
    await page.reload();
    await page.waitForFunction(
      (expected) => typeof LibraryRepository !== "undefined" && LibraryRepository.getCustomCount() >= expected,
      expectedCount,
      { timeout: 90000 }
    );
  });

  const memCountAfterReload = await page.evaluate(() => LibraryRepository.getCustomCount());
  t.gte(memCountAfterReload, expectedCount, "in-memory custom count survives reload (" + memCountAfterReload + " >= " + expectedCount + ")");

  const idbCountAfterReload = await idbCount(page);
  t.gte(idbCountAfterReload, expectedCount, "IndexedDB record count survives reload (" + idbCountAfterReload + " >= " + expectedCount + ")");

  // Spot-check that imported content actually renders, not just that the
  // count is right (a count could be right with corrupted entries).
  await t.step("an imported entry is searchable and its detail panel renders", async () => {
    const sample = customEntries[Math.floor(customEntries.length / 2)];
    await page.fill("#globalSearchInput", sample.title);
    await page.waitForTimeout(600);
    const hits = await page.locator(".entry-card").count();
    t.gte(hits, 1, "search for a sampled imported entry's title (\"" + sample.title.slice(0, 60) + "\") returns at least one hit");
    if (hits >= 1) {
      await page.locator(".entry-card").first().click();
      await page.waitForTimeout(300);
      const body = await page.locator("#detailBody").innerText();
      t.ok(body.length > 50, "detail panel renders non-trivial content for the sampled entry");
    }
  });

  t.ok(errors.length === 0, "zero console/page errors across the whole import/reload flow" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
