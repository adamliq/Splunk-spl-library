#!/usr/bin/env node
"use strict";
/**
 * Runs every *.test.js file in this directory as a separate child process
 * (in the order listed below -- cheapest/most-informative-on-failure
 * first), streams its output live, and exits non-zero if any test file
 * exited non-zero. This is the entry point for CI or a pre-push check.
 *
 * Usage:
 *   NODE_PATH="$(npm root -g)" node tests/run-all.js
 *   (NODE_PATH is only needed if playwright is installed globally rather
 *   than as a local devDependency -- see tests/README.md.)
 */
const { spawnSync } = require("child_process");
const path = require("path");

// Ordered so a failure surfaces the most specific/cheapest signal first:
// data integrity (no browser, seconds) before boot smoke tests, before
// the more expensive full-import and end-to-end flows.
const TEST_FILES = [
  "data-integrity.test.js",
  "app-boot.test.js",
  "search-and-filter.test.js",
  "regex-library.test.js",
  "command-reference.test.js",
  "entry-editor.test.js",
  "standalone-offline.test.js",
  "import-persistence.test.js", // slowest single-import test (imports the full multi-MB library)
  "deep-link.test.js", // slowest overall: two full-library auto-imports (standalone + http) -- runs last
];

function main() {
  const results = [];
  for (const file of TEST_FILES) {
    console.log("\n" + "=".repeat(70));
    console.log("RUNNING: " + file);
    console.log("=".repeat(70));
    const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
      stdio: "inherit",
      env: process.env,
    });
    results.push({ file, code: res.status });
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  let anyFailed = false;
  for (const r of results) {
    const ok = r.code === 0;
    if (!ok) anyFailed = true;
    console.log((ok ? "PASS" : "FAIL") + "  " + r.file + (r.code === null ? " (crashed/timed out)" : ""));
  }

  process.exit(anyFailed ? 1 : 0);
}

main();
