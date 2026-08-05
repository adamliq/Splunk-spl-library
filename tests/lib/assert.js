"use strict";
/**
 * Minimal, dependency-free assertion/reporting helper shared by every test
 * file in this suite. No Jest/Mocha/@playwright/test — just `playwright`
 * (already available) plus plain Node, so the suite runs anywhere this
 * repo's app itself runs: no build step, no package installs required
 * beyond `playwright` itself.
 *
 * Usage in a test file:
 *   const { Reporter } = require("./lib/assert");
 *   const t = new Reporter("my-test-name");
 *   t.ok(condition, "description of what should be true");
 *   t.eq(actual, expected, "description");
 *   ... (checks keep accumulating; nothing throws) ...
 *   t.done(); // prints summary, exits 1 if anything failed, 0 otherwise
 */

class Reporter {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }

  ok(condition, description) {
    if (condition) {
      this.passed++;
      console.log("  ✓ " + description);
    } else {
      this.failed++;
      this.failures.push(description);
      console.log("  ✗ " + description);
    }
    return condition;
  }

  eq(actual, expected, description) {
    const condition = actual === expected;
    const suffix = condition ? "" : " (expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual) + ")";
    return this.ok(condition, description + suffix);
  }

  gte(actual, floor, description) {
    const condition = typeof actual === "number" && actual >= floor;
    const suffix = condition ? "" : " (expected >= " + floor + ", got " + JSON.stringify(actual) + ")";
    return this.ok(condition, description + suffix);
  }

  includes(haystack, needle, description) {
    const condition = typeof haystack === "string" && haystack.includes(needle);
    return this.ok(condition, description);
  }

  /** Wrap a step that might throw; records a failure instead of crashing the whole run. */
  async step(description, fn) {
    try {
      await fn();
    } catch (e) {
      this.failed++;
      this.failures.push(description + " -- threw: " + (e && e.message ? e.message : String(e)));
      console.log("  ✗ " + description + " -- threw: " + (e && e.message ? e.message : String(e)));
    }
  }

  done() {
    const total = this.passed + this.failed;
    console.log("");
    console.log("[" + this.name + "] " + this.passed + "/" + total + " checks passed" + (this.failed ? ", " + this.failed + " FAILED" : ""));
    if (this.failed) {
      console.log("Failures:");
      this.failures.forEach((f) => console.log("  - " + f));
    }
    process.exit(this.failed ? 1 : 0);
  }
}

module.exports = { Reporter };
