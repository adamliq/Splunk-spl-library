"use strict";
/**
 * Command Reference tab: grid renders, opening a command shows its detail,
 * and every command's classification into the six documented SPL command
 * types (distributable streaming, centralized streaming, transforming,
 * generating, orchestrating, dataset processing) is visible in the UI and
 * searchable from the command search box.
 */
const { launch, fileUrl, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function main() {
  const t = new Reporter("command-reference");
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "command-reference");

  await page.goto(fileUrl("splunk-spl-library.html"));
  await page.waitForTimeout(1000);
  await page.click('a[data-route="commands"]');
  await page.waitForTimeout(500);

  const totalCount = await page.locator("#commandGrid .command-card").count();
  t.gte(totalCount, 100, "Command Reference grid renders at least 100 commands (" + totalCount + " found)");

  await t.step("a command that was already documented (stats) shows its command type in the detail panel", async () => {
    await page.fill("#commandSearchInput", "stats");
    await page.waitForTimeout(400);
    const hits = await page.locator("#commandGrid .command-card").count();
    t.gte(hits, 1, '"stats" is findable by search');
    const statsCard = page.locator('.command-card[data-cmd="stats"]');
    t.ok(await statsCard.count() > 0, "the exact \"stats\" card is present among the results");
    await statsCard.first().click();
    await page.waitForTimeout(400);
    const detailText = await page.locator("#commandDetailWrap").innerText();
    // Section headings render uppercase via CSS text-transform, so match case-insensitively.
    t.ok(/command type/i.test(detailText), "detail panel has a Command Type section");
    t.includes(detailText, "Transforming", "stats detail panel shows \"Transforming\" as its command type");
  });

  await t.step("a command that was missing from the reference (dbinspect) was added and shows its type", async () => {
    await page.fill("#commandSearchInput", "dbinspect");
    await page.waitForTimeout(400);
    const card = page.locator('.command-card[data-cmd="dbinspect"]');
    t.ok(await card.count() > 0, "dbinspect now exists as a command reference entry");
    if (await card.count() > 0) {
      await card.first().click();
      await page.waitForTimeout(400);
      const detailText = await page.locator("#commandDetailWrap").innerText();
      t.includes(detailText, "Generating", "dbinspect detail panel shows \"Generating\" as its command type");
    }
  });

  await t.step("searching by command type label narrows the grid to matching commands", async () => {
    await page.fill("#commandSearchInput", "Orchestrating");
    await page.waitForTimeout(400);
    const cards = await page.locator("#commandGrid .command-card").allTextContents();
    t.gte(cards.length, 1, 'searching "Orchestrating" returns at least one command');
    const namesLower = cards.map((c) => c.toLowerCase());
    t.ok(namesLower.some((c) => c.indexOf("noop") !== -1 || c.indexOf("localop") !== -1 || c.indexOf("lookup") !== -1),
      "search-by-type results include at least one known orchestrating-related command");
  });

  await t.step("clearing the command search restores the full grid", async () => {
    await page.fill("#commandSearchInput", "");
    await page.waitForTimeout(400);
    const restored = await page.locator("#commandGrid .command-card").count();
    t.eq(restored, totalCount, "grid count after clearing search matches the original total");
  });

  t.ok(errors.length === 0, "zero console/page errors on the Command Reference tab" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
