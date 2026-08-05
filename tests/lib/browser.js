"use strict";
const { repoPath, fileUrl, REPO_ROOT } = require("./paths");

// Resolve playwright the same way every test in this session's ad-hoc scripts
// did: it's installed globally in this environment, not as a local
// devDependency. If you're running this suite somewhere else and have
// `playwright` as a local dependency instead, this require() still works
// unmodified -- Node's resolution finds the local copy first.
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error(
    "Could not load the 'playwright' package. Either:\n" +
    "  - run with NODE_PATH set to your global npm root (e.g. NODE_PATH=\"$(npm root -g)\" node ...), or\n" +
    "  - run `npm install -D playwright` inside tests/ and run from there.\n" +
    "Original error: " + e.message
  );
  process.exit(1);
}

const EXECUTABLE_PATH = process.env.PW_CHROMIUM_PATH || findDefaultChromium();

function findDefaultChromium() {
  // This environment ships Chromium at a fixed path outside the usual
  // Playwright cache; fall back to letting Playwright find its own if unset.
  const fs = require("fs");
  const guess = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  return fs.existsSync(guess) ? guess : undefined;
}

async function launch() {
  const launchOpts = {};
  if (EXECUTABLE_PATH) launchOpts.executablePath = EXECUTABLE_PATH;
  return chromium.launch(launchOpts);
}

/** Attach console/pageerror collectors to a page; returns the array they push into. */
function collectErrors(page, label) {
  const errors = [];
  page.on("pageerror", (e) => errors.push((label ? label + " " : "") + "PAGEERROR: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push((label ? label + " " : "") + "CONSOLE ERROR: " + msg.text());
  });
  return errors;
}

module.exports = { launch, repoPath, fileUrl, collectErrors, REPO_ROOT };
