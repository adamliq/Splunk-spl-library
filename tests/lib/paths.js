"use strict";
// Pure path helpers with zero dependencies -- used by both the browser-based
// tests and the plain-Node data-integrity test, so the latter never needs
// Playwright installed just to find files.
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function fileUrl(...segments) {
  return "file://" + repoPath(...segments);
}

module.exports = { repoPath, fileUrl, REPO_ROOT };
