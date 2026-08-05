"use strict";
/**
 * The standalone build's entire reason to exist is working fully offline
 * with zero network dependency and no separate download. Verify that
 * directly: zero requests fire when it loads, all embedded custom entries
 * auto-import, and everything survives a reload.
 */
const fs = require("fs");
const { launch, fileUrl, repoPath, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function main() {
  const t = new Reporter("standalone-offline");
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "standalone-offline");

  const customEntries = JSON.parse(fs.readFileSync(repoPath("custom-entries.json"), "utf-8"));
  const expectedCount = customEntries.length;

  const nonFileRequests = [];
  page.on("request", (req) => {
    if (!req.url().startsWith("file://")) nonFileRequests.push(req.url());
  });

  await page.goto(fileUrl("splunk-spl-library-standalone.html"));
  await page.waitForFunction(
    (expected) => typeof LibraryRepository !== "undefined" && LibraryRepository.getCustomCount() >= expected,
    expectedCount,
    { timeout: 90000 }
  );
  await page.waitForTimeout(1500);

  t.eq(nonFileRequests.length, 0, "zero non-file:// network requests during boot and auto-import" +
    (nonFileRequests.length ? " (e.g. " + nonFileRequests[0] + ")" : ""));

  const customCount = await page.evaluate(() => LibraryRepository.getCustomCount());
  t.gte(customCount, expectedCount, "auto-imported custom entry count (" + customCount + ") >= embedded source count (" + expectedCount + ")");

  const builtInCount = await page.evaluate(() => LibraryRepository.getBuiltInCount());
  t.gte(builtInCount, 1, "built-in library also present alongside embedded custom entries (" + builtInCount + ")");

  await t.step("a sampled embedded entry is searchable", async () => {
    const sample = customEntries[0];
    await page.fill("#globalSearchInput", sample.title);
    await page.waitForTimeout(600);
    const hits = await page.locator(".entry-card").count();
    t.gte(hits, 1, "search for \"" + sample.title.slice(0, 50) + "\" returns at least one hit");
  });

  await t.step("reload persists everything without re-fetching anything", async () => {
    nonFileRequests.length = 0;
    await page.reload();
    await page.waitForFunction(
      (expected) => typeof LibraryRepository !== "undefined" && LibraryRepository.getCustomCount() >= expected,
      expectedCount,
      { timeout: 90000 }
    );
    await page.waitForTimeout(1000);
    t.eq(nonFileRequests.length, 0, "zero non-file:// network requests on reload either");
    const countAfterReload = await page.evaluate(() => LibraryRepository.getCustomCount());
    t.gte(countAfterReload, expectedCount, "custom count after reload (" + countAfterReload + ") >= expected (" + expectedCount + ")");
  });

  t.ok(errors.length === 0, "zero console/page errors" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
