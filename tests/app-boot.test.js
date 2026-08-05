"use strict";
/**
 * Both shipped builds must boot cleanly from file:// with zero console/page
 * errors and render the built-in library. This is the cheapest possible
 * smoke test and should catch any syntax error or broken reference
 * introduced anywhere in the app's inline <script>.
 */
const { launch, fileUrl, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function checkBuild(t, browser, relPath, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page, label);

  await page.goto(fileUrl(relPath));
  await page.waitForTimeout(1500);

  t.ok(errors.length === 0, label + ": zero console/page errors on boot" + (errors.length ? " (" + errors[0] + ")" : ""));

  const cardCount = await page.locator(".entry-card").count();
  t.gte(cardCount, 1, label + ": at least one entry card rendered on boot (" + cardCount + " found)");

  const idbAvailable = await page.evaluate(() => (typeof StorageService !== "undefined" ? StorageService.isIndexedDbAvailable() : false));
  t.ok(idbAvailable, label + ": IndexedDB is available on file://");

  const resultsText = await page.locator("#resultsCountText").innerText().catch(() => "");
  t.ok(resultsText.length > 0, label + ": results count text is populated (\"" + resultsText + "\")");

  await ctx.close();
  return errors;
}

async function main() {
  const t = new Reporter("app-boot");
  const browser = await launch();

  await t.step("splunk-spl-library.html boots cleanly", () => checkBuild(t, browser, "splunk-spl-library.html", "main-build"));
  await t.step("index.html boots cleanly", () => checkBuild(t, browser, "index.html", "index-html"));
  await t.step("splunk-spl-library-standalone.html boots cleanly", () => checkBuild(t, browser, "splunk-spl-library-standalone.html", "standalone-build"));

  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
