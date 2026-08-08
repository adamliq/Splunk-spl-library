"use strict";
/**
 * Data-integrity checks that don't need a browser: schema completeness,
 * ID uniqueness, cross-library collisions, file-size vs the app's own
 * import cap, and that the three shipped HTML builds are actually in sync
 * with each other and with custom-entries.json.
 *
 * These are cheap and fast -- run them first, before any Playwright test,
 * since a failure here usually means the Playwright tests will fail too
 * (for a much less obvious reason) or that a batch was committed without
 * being merged/regenerated correctly.
 */
const fs = require("fs");
const { repoPath } = require("./lib/paths");
const { Reporter } = require("./lib/assert");

const REQUIRED_ENTRY_KEYS = [
  "id", "title", "summary", "purpose", "spl", "category", "subcategory",
  "useCases", "commands", "platforms", "products", "dataSources", "indexes",
  "sourcetypes", "requiredFields", "optionalFields", "outputFields",
  "cimDomains", "dataModels", "macros", "lookups", "tags", "difficulty",
  "searchType", "explanationSteps", "exampleOutput", "customisationNotes",
  "performanceNotes", "prerequisites", "attack", "detection", "references",
  "relatedEntryIds", "validationStatus", "sourceType", "author", "version",
  "created", "modified", "copyCount",
];

// Mirrors ImportExportService's MAX_IMPORT_BYTES in splunk-spl-library.html --
// keep this in sync manually if that constant ever changes; a mismatch here
// is itself a signal the two have drifted.
const MAX_IMPORT_BYTES = 128 * 1024 * 1024;

function extractBuiltInLibrary(html) {
  const m = html.match(/const BUILT_IN_LIBRARY = (\[[\s\S]*?\]);\nconst COMMAND_REFERENCE_DATA/);
  if (!m) return null;
  return JSON.parse(m[1]);
}

function extractEmbeddedCustomEntries(html) {
  const m = html.match(/const EMBEDDED_CUSTOM_ENTRIES = (\[[\s\S]*?\]);\n/);
  if (!m) return null;
  return JSON.parse(m[1]);
}

function extractCommandReferenceData(html) {
  const m = html.match(/const COMMAND_REFERENCE_DATA = (\[[\s\S]*?\]);\n/);
  if (!m) return null;
  return JSON.parse(m[1]);
}

const REQUIRED_COMMAND_KEYS = [
  "command", "category", "purpose", "syntax", "example", "exampleDescription",
  "inputType", "outputType", "commonOptions", "commonMistakes",
  "performanceConsiderations", "relatedCommands", "relatedEntryIds",
];

async function main() {
  const t = new Reporter("data-integrity");

  const customPath = repoPath("custom-entries.json");
  const mainHtmlPath = repoPath("splunk-spl-library.html");
  const indexHtmlPath = repoPath("index.html");
  const standaloneHtmlPath = repoPath("splunk-spl-library-standalone.html");

  t.ok(fs.existsSync(customPath), "custom-entries.json exists");
  t.ok(fs.existsSync(mainHtmlPath), "splunk-spl-library.html exists");
  t.ok(fs.existsSync(indexHtmlPath), "index.html exists");
  t.ok(fs.existsSync(standaloneHtmlPath), "splunk-spl-library-standalone.html exists");

  const customRaw = fs.readFileSync(customPath, "utf-8");
  let custom = [];
  await t.step("custom-entries.json parses as valid JSON", async () => {
    custom = JSON.parse(customRaw);
    if (!Array.isArray(custom)) throw new Error("root is not an array");
  });

  t.gte(custom.length, 1, "custom-entries.json has at least one entry (" + custom.length + " found)");

  const customBytes = Buffer.byteLength(customRaw, "utf-8");
  t.ok(
    customBytes <= MAX_IMPORT_BYTES,
    "custom-entries.json (" + (customBytes / 1024 / 1024).toFixed(2) + " MB) is under the app's " +
      (MAX_IMPORT_BYTES / 1024 / 1024) + " MB import cap -- if this fails, either raise MAX_IMPORT_BYTES " +
      "in ImportExportService (splunk-spl-library.html, index.html) or stop growing this file"
  );

  // ---- schema completeness on every custom entry ----
  let missingKeyEntries = 0;
  let firstMissingExample = null;
  for (const e of custom) {
    const missing = REQUIRED_ENTRY_KEYS.filter((k) => !(k in e));
    if (missing.length) {
      missingKeyEntries++;
      if (!firstMissingExample) firstMissingExample = { id: e.id, missing };
    }
  }
  t.eq(missingKeyEntries, 0, "every custom entry has all " + REQUIRED_ENTRY_KEYS.length + " required schema keys" +
    (firstMissingExample ? " (first offender: " + JSON.stringify(firstMissingExample) + ")" : ""));

  // ---- ID integrity ----
  const missingIds = custom.filter((e) => !e.id || !String(e.id).trim()).length;
  t.eq(missingIds, 0, "every custom entry has a non-empty id");

  const customIds = custom.map((e) => e.id).filter(Boolean);
  const dupCustomIds = customIds.length - new Set(customIds).size;
  t.eq(dupCustomIds, 0, "no duplicate ids among custom entries (" + customIds.length + " total)");

  // ---- built-in library (extracted from the shipped HTML) ----
  const mainHtml = fs.readFileSync(mainHtmlPath, "utf-8");
  let builtIn = [];
  await t.step("BUILT_IN_LIBRARY extracts and parses from splunk-spl-library.html", async () => {
    builtIn = extractBuiltInLibrary(mainHtml);
    if (!builtIn) throw new Error("could not locate/parse BUILT_IN_LIBRARY literal");
  });
  t.gte(builtIn.length, 1, "built-in library has at least one entry (" + builtIn.length + " found)");

  const builtInIds = builtIn.map((e) => e.id).filter(Boolean);
  const dupBuiltInIds = builtInIds.length - new Set(builtInIds).size;
  t.eq(dupBuiltInIds, 0, "no duplicate ids within the built-in library");

  const crossCollisions = customIds.filter((id) => builtInIds.includes(id));
  t.eq(crossCollisions.length, 0, "no id collisions between custom entries and the built-in library" +
    (crossCollisions.length ? " (e.g. " + crossCollisions[0] + ")" : ""));

  // ---- build parity: index.html must mirror splunk-spl-library.html exactly ----
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
  t.ok(indexHtml === mainHtml, "index.html is byte-identical to splunk-spl-library.html " +
    "(GitHub Pages serves index.html at the root URL -- these must never drift apart)");

  // ---- standalone build freshness: its embedded data must match custom-entries.json exactly ----
  const standaloneHtml = fs.readFileSync(standaloneHtmlPath, "utf-8");
  let embedded = null;
  await t.step("EMBEDDED_CUSTOM_ENTRIES extracts and parses from the standalone build", async () => {
    embedded = extractEmbeddedCustomEntries(standaloneHtml);
    if (!embedded) throw new Error("could not locate/parse EMBEDDED_CUSTOM_ENTRIES literal");
  });
  if (embedded) {
    t.eq(embedded.length, custom.length,
      "standalone build's embedded entry count matches custom-entries.json -- if this fails, " +
      "the standalone build is stale and needs regenerating from the current splunk-spl-library.html + custom-entries.json");
    const embeddedIds = new Set(embedded.map((e) => e.id));
    const customIdSet = new Set(customIds);
    const onlyInCustom = customIds.filter((id) => !embeddedIds.has(id)).length;
    const onlyInEmbedded = [...embeddedIds].filter((id) => !customIdSet.has(id)).length;
    t.eq(onlyInCustom, 0, "no custom-entries.json ids missing from the standalone build's embedded set");
    t.eq(onlyInEmbedded, 0, "no embedded ids in the standalone build that aren't in custom-entries.json");
  }

  // ---- command reference: schema completeness, uniqueness, and command-type coverage ----
  let commandRef = [];
  await t.step("COMMAND_REFERENCE_DATA extracts and parses from splunk-spl-library.html", async () => {
    commandRef = extractCommandReferenceData(mainHtml);
    if (!commandRef) throw new Error("could not locate/parse COMMAND_REFERENCE_DATA literal");
  });
  t.gte(commandRef.length, 1, "command reference has at least one entry (" + commandRef.length + " found)");

  let missingCommandKeyEntries = 0;
  let firstMissingCommandExample = null;
  for (const c of commandRef) {
    const missing = REQUIRED_COMMAND_KEYS.filter((k) => !(k in c));
    if (missing.length) {
      missingCommandKeyEntries++;
      if (!firstMissingCommandExample) firstMissingCommandExample = { command: c.command, missing };
    }
  }
  t.eq(missingCommandKeyEntries, 0, "every command reference entry has all " + REQUIRED_COMMAND_KEYS.length + " required schema keys" +
    (firstMissingCommandExample ? " (first offender: " + JSON.stringify(firstMissingCommandExample) + ")" : ""));

  const commandNames = commandRef.map((c) => c.command).filter(Boolean);
  const dupCommandNames = commandNames.length - new Set(commandNames).size;
  t.eq(dupCommandNames, 0, "no duplicate command names in the command reference (" + commandNames.length + " total)");

  const withCommandTypes = commandRef.filter((c) => Array.isArray(c.commandTypes) && c.commandTypes.length > 0);
  t.gte(withCommandTypes.length, 90, "at least 90 command reference entries carry a commandTypes field (" + withCommandTypes.length + " found) " +
    "-- regression guard for the six-type classification (distributable streaming, centralized streaming, transforming, generating, orchestrating, dataset processing)");

  const VALID_TYPE_LABELS = new Set(["Distributable Streaming", "Centralized Streaming", "Transforming", "Generating", "Orchestrating", "Dataset Processing"]);
  const badTypeLabels = [];
  for (const c of commandRef) {
    for (const label of (c.commandTypes || [])) {
      if (!VALID_TYPE_LABELS.has(label)) badTypeLabels.push(c.command + ":" + label);
    }
  }
  t.eq(badTypeLabels.length, 0, "every commandTypes label is one of the six canonical types" +
    (badTypeLabels.length ? " (e.g. " + badTypeLabels[0] + ")" : ""));

  // Spot-check a few specific commands known to need multi-type / conditional
  // classification, so a future edit that flattens or drops the nuance is caught.
  const byCommand = {};
  for (const c of commandRef) byCommand[c.command] = c;
  t.ok(byCommand.stats && (byCommand.stats.commandTypes || []).includes("Transforming"), "stats is classified as Transforming");
  t.ok(byCommand.tstats && (byCommand.tstats.commandTypes || []).includes("Generating"), "tstats is classified as Generating");
  t.ok(byCommand.dedup && (byCommand.dedup.commandTypes || []).length >= 2, "dedup carries multiple command types (its classification depends on arguments)");
  t.ok(byCommand.dbinspect, "dbinspect exists in the command reference (was previously missing)");
  t.ok(byCommand.union, "union exists in the command reference (was previously missing)");

  // ---- the app's own JS must contain the durability fix for bulk import ----
  // (regression guard for the race condition fixed in this session: importEntries
  // must be async and must await persistCustomBulk before returning, and the
  // auto-import flag must be set *after* awaiting importEntries, not before.)
  t.includes(mainHtml, "async function importEntries(entries, mode)",
    "importEntries is declared async (regression guard: bulk-import durability fix)");
  t.includes(mainHtml, "await persistCustomBulk(newlyAdded)",
    "importEntries awaits persistCustomBulk before returning (regression guard: bulk-import durability fix)");

  t.done();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
