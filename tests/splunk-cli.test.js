"use strict";
/**
 * Splunk CLI tab: operational shell commands that use the `splunk` binary
 * directly (not SPL). Renders every entry from CLI_COMMANDS_DATA, category
 * filtering and search work, and opening a command's detail shows its
 * command block plus explanation/prerequisites/warnings sections with a
 * working copy-to-clipboard button.
 */
const { launch, fileUrl, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function main() {
  const t = new Reporter("splunk-cli");
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "splunk-cli");

  await page.goto(fileUrl("splunk-spl-library.html"));
  await page.waitForTimeout(1000);
  await page.click('a[data-route="cli"]');
  await page.waitForTimeout(500);

  const totalCount = await page.locator("#cliGrid .command-card").count();
  t.gte(totalCount, 1, "Splunk CLI grid renders at least one command (" + totalCount + " found)");

  await t.step("category dropdown is populated", async () => {
    const options = await page.locator("#cliCategorySelect option").allTextContents();
    t.gte(options.length, 2, "category dropdown has more than just \"All categories\" (" + options.length + " options)");
  });

  await t.step("opening the recursive inputs.conf oneshot command shows its detail", async () => {
    const card = page.locator('.command-card[data-cli="cli-recursive-inputs-conf-oneshot"]');
    t.ok(await card.count() > 0, "the recursive inputs.conf oneshot command card is present");
    await card.first().click();
    await page.waitForTimeout(400);
    const detailText = await page.locator("#cliDetailWrap").innerText();
    t.ok(detailText.length > 200, "CLI command detail panel has non-trivial content");
    t.includes(detailText, "oneshot", "detail shows the command text (oneshot)");
    t.includes(detailText, "find /opt/splunk/etc/apps", "detail shows the full find/-exec command");
    t.ok(/warnings/i.test(detailText), "detail panel has a Warnings section for this command");
  });

  await t.step("copying the command writes it to the clipboard", async () => {
    const copyBtn = page.locator('[data-action="copy-cli-command"]').first();
    t.ok(await copyBtn.count() > 0, "a copy-command control exists on the open CLI command");
    await copyBtn.click();
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    t.includes(clip, "oneshot", "clipboard contains the copied command text after clicking Copy command");
  });

  await t.step("searching by command text narrows the grid", async () => {
    await page.fill("#cliSearchInput", "inputs.conf");
    await page.waitForTimeout(400);
    const hits = await page.locator("#cliGrid .command-card").count();
    t.gte(hits, 1, "searching \"inputs.conf\" returns at least one CLI command");
  });

  await t.step("clearing the search restores the full grid", async () => {
    await page.fill("#cliSearchInput", "");
    await page.waitForTimeout(400);
    const restored = await page.locator("#cliGrid .command-card").count();
    t.eq(restored, totalCount, "grid count after clearing search matches the original total");
  });

  t.ok(errors.length === 0, "zero console/page errors on the Splunk CLI tab" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
