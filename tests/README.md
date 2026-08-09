# Regression test suite

Automated tests for the standalone Splunk SPL Library app
(`splunk-spl-library.html`, `index.html`, `splunk-spl-library-standalone.html`,
`custom-entries.json`). No build step, no bundler, no framework beyond
plain Node.js and `playwright` — the same way the app itself has no build
step.

## Running

```bash
# If playwright is installed globally (as it is in this project's dev
# environment) rather than as a local devDependency:
NODE_PATH="$(npm root -g)" node tests/run-all.js

# If you've instead run `npm install -D playwright` inside tests/, or have
# it as a devDependency at the repo root:
node tests/run-all.js
```

Run a single test file the same way, directly:

```bash
NODE_PATH="$(npm root -g)" node tests/import-persistence.test.js
```

Each test file exits `0` on success and `1` on any failed check, and
prints a `✓`/`✗` line per check plus a summary — there's no separate
reporter to configure. `run-all.js` runs every `*.test.js` file in order
and exits non-zero if any of them failed.

## What's covered

| File | Covers |
|---|---|
| `data-integrity.test.js` | No browser. Schema completeness and unique/non-colliding IDs across the full library, `custom-entries.json` size vs the app's import cap, that `index.html` mirrors `splunk-spl-library.html` exactly, and that the standalone build's embedded data is in sync with `custom-entries.json`. |
| `app-boot.test.js` | All three shipped HTML files boot cleanly from `file://` with zero console/page errors and render the built-in library. |
| `search-and-filter.test.js` | Global search, field-scoped search (`category:"..."`), detail-panel rendering, copy-to-clipboard. |
| `regex-library.test.js` | Regex Library grid, category filter (alone and combined with search), the live pattern tester. |
| `command-reference.test.js` | Command Reference grid, opening a command's detail (including previously-existing commands like `stats`), the six-type SPL command classification (`commandTypes`) rendering in the detail panel, that commands added for type coverage (e.g. `dbinspect`) are present, and that command-type labels are searchable. |
| `entry-editor.test.js` | Creating a custom entry through the real UI, persistence across reload (the single-entry save path), delete. |
| `standalone-offline.test.js` | The standalone build makes **zero** network requests on boot or reload, and all embedded entries auto-import and persist. |
| `import-persistence.test.js` | The most important test — imports the full current `custom-entries.json` through the real Import dialog and verifies durability via IndexedDB directly (not just in-memory state), including surviving an immediate reload. See "Why `import-persistence.test.js` exists" below. |
| `deep-link.test.js` | The "Copy Link" button produces a well-formed `#entry/<id>` URL, and loading such a URL opens straight to that entry — for a built-in entry immediately, and for a *custom* entry on a completely fresh browser (empty IndexedDB/localStorage) for both the standalone build and an http-served main build (simulating GitHub Pages). See "Why `deep-link.test.js` exists" below. |

## Why `import-persistence.test.js` exists

While growing this library past ~5,000 entries, two real bugs surfaced —
both invisible at small scale and both about the gap between "the UI says
it worked" and "the data is actually safely on disk":

1. **`MAX_IMPORT_BYTES` was hardcoded to 20 MB.** Once `custom-entries.json`
   grew past that, the Import dialog's Run button stayed silently disabled
   with no clear error.
2. **The bulk IndexedDB write was fire-and-forget.** `persistCustomBulk()`
   wasn't awaited, so the app would report "Import complete" — and, for
   auto-import, permanently mark itself as having already run — *before*
   the write durably committed. A reload or tab close shortly after a large
   import could silently lose data, with no retry on the next load.

Both are now fixed (see the two `t.includes(...)` regression guards at the
bottom of `data-integrity.test.js`, which check the fix's actual source
lines are still present, and `import-persistence.test.js`, which exercises
the real failure scenario end-to-end: import through the UI, confirm via
IndexedDB directly, reload immediately, confirm again).

If you ever see `import-persistence.test.js` start failing again after a
refactor of `ImportExportService` or `LibraryRepository.importEntries`,
treat it as a real regression, not a flaky test — this exact class of bug
is exactly what it exists to catch.

## Why `deep-link.test.js` exists

Every entry has a "Copy Link" button that puts a `#entry/<id>` URL on the
clipboard, meant to be pasted into another webpage to jump straight to that
SPL. The tricky case is a *custom* entry opened by a **completely fresh
visitor** (empty IndexedDB/localStorage): `Router.init()` resolves the
initial `#entry/<id>` hash and looks the entry up before custom-entry
auto-import has had any chance to run, so that first lookup fails and
silently bounces back to the library view — the shared link would appear
broken. `AppController.init()` remembers the requested id and retries the
navigation once auto-import finishes; `deep-link.test.js` is the regression
guard for that retry, exercised against both the standalone build (`file://`,
embedded entries) and an http-served main build via a throwaway local static
server (`tests/lib/staticServer.js`), which is what actually stands in for
the real GitHub Pages deployment — `file://` alone can't, since browsers
block `fetch()` of local files there and the main build's auto-import never
runs at all in that case.

If this test starts failing after a change to `Router`, `handleRouteChange`,
`openEntryInPanel`, or the deep-link retry block in `AppController.init()`,
treat it as a real regression — it means shared links to custom entries are
broken for anyone visiting for the first time.

## Adding a new test

1. Create `tests/your-thing.test.js` following the pattern in an existing
   file: `require("./lib/browser")` for `launch`/`fileUrl`/`collectErrors`
   (or just `./lib/paths` if you don't need a browser at all), and
   `require("./lib/assert")` for the `Reporter` (`t.ok`, `t.eq`, `t.gte`,
   `t.includes`, `t.step`). Call `t.done()` at the end.
2. Add the filename to the `TEST_FILES` array in `run-all.js`, roughly in
   order of cost (cheap/no-browser tests first).
3. Every test that mutates data (creates entries, imports, etc.) should
   run against a fresh Playwright context/page and clean up after itself
   where practical (see `entry-editor.test.js`'s cleanup step) — each
   Playwright browser context has isolated storage, but files on disk
   (i.e. don't have a test write to `custom-entries.json` itself).

## What this suite intentionally does not cover

- Whether the SPL in any given library entry is syntactically valid
  Splunk SPL or would actually run against a real Splunk instance — this
  app never executes SPL, and neither does this test suite.
- Visual/pixel regression — no screenshot diffing.
- Cross-browser testing — Chromium only, matching how the app itself is
  primarily verified throughout this project.
