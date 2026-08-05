"use strict";
/**
 * Regex Library tab: grid renders, the category filter dropdown works
 * (alone and combined with text search), and the live "Try It" tester
 * produces a real match using the browser's own JS regex engine.
 */
const { launch, fileUrl, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function main() {
  const t = new Reporter("regex-library");
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "regex-library");

  await page.goto(fileUrl("splunk-spl-library.html"));
  await page.waitForTimeout(1000);
  await page.click('a[data-route="regex"]');
  await page.waitForTimeout(500);

  const totalCount = await page.locator("#regexGrid .command-card").count();
  t.gte(totalCount, 1, "Regex Library grid renders at least one pattern (" + totalCount + " found)");

  await t.step("category dropdown is populated and filtering actually narrows the grid", async () => {
    const options = await page.locator("#regexCategorySelect option").allTextContents();
    t.gte(options.length, 2, "category dropdown has more than just \"All categories\" (" + options.length + " options)");
    const target = options.find((o) => !o.startsWith("All categories"));
    if (target) {
      await page.selectOption("#regexCategorySelect", { label: target });
      await page.waitForTimeout(300);
      const filteredCount = await page.locator("#regexGrid .command-card").count();
      t.gte(totalCount, filteredCount, "filtered count (" + filteredCount + ") is <= total count (" + totalCount + ") after selecting \"" + target + "\"");
      t.gte(filteredCount, 1, "the selected category has at least one pattern");
    } else {
      t.ok(false, "at least one real category option exists to filter by");
    }
  });

  await t.step("resetting to All categories restores the full grid", async () => {
    await page.selectOption("#regexCategorySelect", { index: 0 });
    await page.waitForTimeout(300);
    const restoredCount = await page.locator("#regexGrid .command-card").count();
    t.eq(restoredCount, totalCount, "grid count after resetting the category filter matches the original total");
  });

  await t.step("opening a pattern runs the live tester and shows a real match", async () => {
    await page.fill("#regexSearchInput", "IPv4 Address");
    await page.waitForTimeout(400);
    const hits = await page.locator("#regexGrid .command-card").count();
    t.gte(hits, 1, "\"IPv4 Address\" pattern is findable by search");
    if (hits >= 1) {
      await page.locator("#regexGrid .command-card").first().click();
      await page.waitForTimeout(400);
      const autoResult = await page.locator("#regexTestResult").innerText();
      t.ok(/match/i.test(autoResult) && !/no match/i.test(autoResult), "live tester auto-runs against the example input and reports a match");

      await page.fill("#regexTestInput", "reached out to 192.168.1.1 for DNS");
      await page.click("#btnRunRegexTest");
      await page.waitForTimeout(300);
      const customResult = await page.locator("#regexTestResult").innerText();
      t.includes(customResult, "192.168.1.1", "live tester correctly matches a custom IP address typed into the test box");
    }
  });

  t.ok(errors.length === 0, "zero console/page errors on the Regex Library tab" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
