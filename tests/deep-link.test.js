"use strict";
/**
 * "Copy Link" deep-linking: every entry's detail panel has a Copy Link
 * button that puts a "#entry/<id>" URL on the clipboard, and loading a URL
 * shaped like that must open straight to that entry -- including on a
 * completely fresh browser (empty IndexedDB/localStorage), which is the
 * whole point of a link meant to be pasted into another webpage.
 *
 * That fresh-visit case is non-trivial for *custom* entries specifically:
 * Router.init() resolves the initial "#entry/<id>" hash and looks the
 * entry up *before* the custom-entries auto-import (from custom-entries.json
 * over http, or from the embedded array in the standalone build) has had a
 * chance to run, so the first lookup fails and bounces back to the library
 * view. AppController.init() retries the navigation once auto-import
 * finishes -- this file is the regression guard for that retry.
 */
const fs = require("fs");
const { launch, fileUrl, repoPath, collectErrors } = require("./lib/browser");
const { startStaticServer } = require("./lib/staticServer");
const { Reporter } = require("./lib/assert");

async function waitForResolvedDetail(page, timeout) {
  return page.waitForFunction(() => {
    const t = document.getElementById("detailTitle");
    return !!(t && t.textContent && t.textContent.trim() !== "" && t.textContent.trim() !== "Select an entry");
  }, null, { timeout: timeout || 30000 }).catch(() => {});
}

async function main() {
  const t = new Reporter("deep-link");
  const browser = await launch();

  const customEntries = JSON.parse(fs.readFileSync(repoPath("custom-entries.json"), "utf-8"));
  const customId = customEntries.find((e) => e.id === "SPL-find-corrupt-buckets") ? "SPL-find-corrupt-buckets" : customEntries[0].id;

  // --- Copy Link produces a well-formed "#entry/<id>" URL and puts it on the clipboard ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await ctx.newPage();
    const errors = collectErrors(page, "deep-link/copy-button");

    await page.goto(fileUrl("splunk-spl-library.html"));
    await page.waitForTimeout(1000);

    await t.step("opening an entry and clicking Copy Link puts a matching #entry/<id> URL on the clipboard", async () => {
      await page.locator(".entry-card").first().click();
      await page.waitForTimeout(300);
      const id = await page.evaluate(() => document.querySelector(".entry-card.selected").getAttribute("data-id"));
      const copyLinkBtn = page.locator('[data-action="copy-link"]').first();
      t.ok(await copyLinkBtn.count() > 0, "a Copy Link control exists on the open entry");
      await copyLinkBtn.click();
      await page.waitForTimeout(200);
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      t.ok(clip.length > 0, "clipboard contains non-empty text after clicking Copy Link");
      t.ok(clip.indexOf("#entry/" + encodeURIComponent(id)) !== -1, "copied link ends with #entry/<id> for the open entry (" + clip + ")");
    });

    t.ok(errors.length === 0, "zero console/page errors on the copy-link flow" + (errors.length ? " (" + errors[0] + ")" : ""));
    await ctx.close();
  }

  // --- Deep link to a BUILT-IN entry resolves immediately (no import needed) ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = collectErrors(page, "deep-link/builtin");
    await page.goto(fileUrl("splunk-spl-library.html") + "#entry/core-search");
    await waitForResolvedDetail(page, 10000);
    const title = await page.locator("#detailTitle").textContent().catch(() => "");
    t.ok(title.trim() !== "" && title.trim() !== "Select an entry", "deep link to a built-in entry (core-search) resolves on first visit (" + JSON.stringify(title) + ")");
    t.ok(errors.length === 0, "zero console/page errors on built-in deep link" + (errors.length ? " (" + errors[0] + ")" : ""));
    await ctx.close();
  }

  // --- Deep link to a CUSTOM entry on the standalone build (file://) resolves on a fresh visit ---
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = collectErrors(page, "deep-link/standalone");
    await page.goto(fileUrl("splunk-spl-library-standalone.html") + "#entry/" + encodeURIComponent(customId));
    // Auto-import of the full embedded library (5000+ entries) into IndexedDB
    // takes real time; give it a generous window, matching import-persistence.test.js.
    await waitForResolvedDetail(page, 90000);
    const title = await page.locator("#detailTitle").textContent().catch(() => "");
    const body = await page.locator("#detailBody").innerText().catch(() => "");
    t.ok(title.trim() !== "" && title.trim() !== "Select an entry", "deep link to a custom entry on the standalone build resolves on a fresh visit (title=" + JSON.stringify(title) + ")");
    t.includes(body, customId, "resolved entry's detail body contains its own id");
    t.ok(errors.length === 0, "zero console/page errors on standalone deep link" + (errors.length ? " (" + errors[0] + ")" : ""));
    await ctx.close();
  }

  // --- Deep link to a CUSTOM entry served over http (simulating GitHub Pages) resolves on a fresh visit ---
  {
    const server = await startStaticServer();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = collectErrors(page, "deep-link/http");
    try {
      await page.goto(server.url + "/index.html#entry/" + encodeURIComponent(customId));
      await waitForResolvedDetail(page, 90000);
      const title = await page.locator("#detailTitle").textContent().catch(() => "");
      const body = await page.locator("#detailBody").innerText().catch(() => "");
      t.ok(title.trim() !== "" && title.trim() !== "Select an entry", "deep link to a custom entry served over http resolves on a fresh visit (title=" + JSON.stringify(title) + ")");
      t.includes(body, customId, "resolved entry's detail body contains its own id (http)");
      t.ok(errors.length === 0, "zero console/page errors on http deep link" + (errors.length ? " (" + errors[0] + ")" : ""));
    } finally {
      await ctx.close();
      await server.close();
    }
  }

  await browser.close();
  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
