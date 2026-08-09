"use strict";
/**
 * Roles & Capabilities tab: renders every role from ROLES_DATA (extracted
 * from a user-supplied roles/capabilities reference spreadsheet), category
 * filtering works, search narrows by role name/category/description and by
 * capability name, and opening a role's detail lists its assigned
 * capabilities.
 */
const { launch, fileUrl, collectErrors } = require("./lib/browser");
const { Reporter } = require("./lib/assert");

async function main() {
  const t = new Reporter("roles");
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = collectErrors(page, "roles");

  await page.goto(fileUrl("splunk-spl-library.html"));
  await page.waitForTimeout(1000);
  await page.click('a[data-route="roles"]');
  await page.waitForTimeout(500);

  const totalCount = await page.locator("#rolesGrid .command-card").count();
  t.gte(totalCount, 20, "Roles grid renders at least 20 roles (" + totalCount + " found)");

  await t.step("category dropdown is populated and filtering narrows the grid", async () => {
    const options = await page.locator("#rolesCategorySelect option").allTextContents();
    t.gte(options.length, 2, "category dropdown has more than just \"All categories\" (" + options.length + " options)");
    const target = options.find((o) => o.startsWith("Mission Control"));
    t.ok(!!target, "a \"Mission Control\" category option exists");
    if (target) {
      await page.selectOption("#rolesCategorySelect", { label: target });
      await page.waitForTimeout(300);
      const filteredCount = await page.locator("#rolesGrid .command-card").count();
      t.gte(totalCount, filteredCount, "filtered count (" + filteredCount + ") is <= total count (" + totalCount + ")");
      t.gte(filteredCount, 1, "the Mission Control category has at least one role");
    }
  });

  await t.step("resetting to All categories restores the full grid", async () => {
    await page.selectOption("#rolesCategorySelect", { index: 0 });
    await page.waitForTimeout(300);
    const restoredCount = await page.locator("#rolesGrid .command-card").count();
    t.eq(restoredCount, totalCount, "grid count after resetting the category filter matches the original total");
  });

  await t.step("opening the Admin role's detail lists its assigned capabilities", async () => {
    await page.fill("#rolesSearchInput", "Admin");
    await page.waitForTimeout(400);
    const adminCard = page.locator('.command-card[data-role="admin"]');
    t.ok(await adminCard.count() > 0, "the exact \"Admin\" role card is present among the results");
    await adminCard.first().click();
    await page.waitForTimeout(400);
    const detailText = await page.locator("#rolesDetailWrap").innerText();
    t.ok(detailText.length > 200, "role detail panel has non-trivial content");
    t.includes(detailText, "accelerate_datamodel", "Admin role's detail lists a known assigned capability (accelerate_datamodel)");
    // Section headings render uppercase via CSS text-transform, so match case-insensitively.
    t.ok(/assigned capabilities/i.test(detailText), "role detail panel has an Assigned Capabilities section");
  });

  await t.step("copying the capability list writes non-empty text to the clipboard", async () => {
    const copyBtn = page.locator('[data-action="copy-role-capabilities"]').first();
    t.ok(await copyBtn.count() > 0, "a copy-capability-list control exists on the open role");
    await copyBtn.click();
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    t.ok(clip.length > 0, "clipboard contains non-empty text after clicking Copy capability list");
  });

  await t.step("searching by a capability name (not just role name) finds matching roles", async () => {
    await page.fill("#rolesSearchInput", "accelerate_datamodel");
    await page.waitForTimeout(400);
    const hits = await page.locator("#rolesGrid .command-card").count();
    t.gte(hits, 1, "searching by capability name \"accelerate_datamodel\" returns at least one role");
  });

  await t.step("clearing the search restores the full grid", async () => {
    await page.fill("#rolesSearchInput", "");
    await page.waitForTimeout(400);
    const restored = await page.locator("#rolesGrid .command-card").count();
    t.eq(restored, totalCount, "grid count after clearing search matches the original total");
  });

  t.ok(errors.length === 0, "zero console/page errors on the Roles tab" + (errors.length ? " (" + errors[0] + ")" : ""));

  await ctx.close();
  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
