# Squeek Colony revision validation

Reviewed 2026-11-02. Complete for the stated revision scope. This is the worker's evidence, not an independent certification or a claim of live-service availability.

An identical root `VALIDATION.md` is included with the source so these results remain available even when the upload artifact directory is packaged separately.

## Scope and method

Preserved the accepted React/TypeScript/Vite implementation, pixel scene, CSS tokens, fonts, six rooms, rules for individual rounds, and static-hosting layout. Changes address the five reproduced reports, their necessary pending/error states, documentation, and regression checks. No wallets, transactions, backend, dependencies, ignore rules, or deployment configuration were added.

Read the pinned Better Interface workflow, core principles of all six domains, documentation method, and design-critic definitions/probe. Read the supplied wallet reference; wallet infrastructure is not applicable to this read-only game. Applied Better Interface to the changed states during implementation, then reviewed the production export. The design guidance is credited to Jakub Krehel (MIT); the documentation method to Paul Bakaus's Impeccable (Apache-2.0), as identified in the pinned inputs.

The supplied browser tool initially failed with “Chromium distribution 'chrome' is not found.” Node and browser runtimes were installed externally for validation. To respect the repository's no-node_modules constraint, `npm ci` and npm scripts ran in `/tmp/squeek-build`, a copy of the source, tests, manifest, lockfile, and configuration. Source/configuration/lockfile and resulting export were checked byte-for-byte against the repository. Runtime downloads, package caches, and temporary libraries remain outside the submission.

## Reproduction and fixes

| Report | Reproduced before changes | Fix and final evidence |
| --- | --- | --- |
| README absent (`2d05b6cb…`) | `git ls-files '*README*' '*.md'` returned no files. | Root `README.md:1` now documents sources, rules, deterministic seeds, installation/preview/rebuild, and exact settled-round verification. `DESIGN.md:1` records the implemented system. |
| Batch loses earlier choices (`e794b2cf…`) | Production export at 390px, intercepted 898–899 zero-work range, saved Forage/Research, contiguous events to 865: only Research, 17 points, one played settlement, no pending moves. | `src/engine.ts:210`, `src/engine.ts:245`, `src/engine.ts:377`: individual-only choice/result guards; expand zero-work/zero-active spans and clip season boundaries; defer ambiguous batches and subsequent state-dependent rounds. `src/App.tsx:317`, `src/App.tsx:361`, `src/App.tsx:386` retain original sources and list unresolved moves. Engine regressions and both browser engines confirm two played rounds, distinct seeds, same original source, both moves visible, and no aggregate misclassification for positive batches. |
| Clock rewinds (`8d39a04f…`) | Starting ten seconds before round 900 ended, repeating the identical status response and advancing 11010ms left Round 900 / 0:10 after the second poll. | `src/useColony.ts:40`: browser epoch plus monotonic elapsed time; content timestamps do not calibrate time. `src/useColony.ts:162`: recheck time when accepting a move, including after waiting on a lock. Both browsers now show Round 901 / approximately 9:59 and save to round 901; an initially old generatedAt also cannot move the round backward. |
| Stale activity presented as live (`57a9e219…`) | ACTIVE / 60 rpm / 123 passes followed by HTTP 503 left “Wheel turning,” one `.wheel.spinning`, and no alerts. | `src/App.tsx:105`, `src/App.tsx:134`, `src/App.tsx:640`: retained readings explicitly unavailable, with timestamp and automatic-retry text; live pass wording and spinning stop, scene description says unknown. Both browsers confirm failure, retained timestamp, no spinning, and recovery after the next successful poll. |
| Tab overwrites locked move (`707426aa…`) | Two already-open tabs allowed Forage and Research respectively; storage retained only Research, with contradictory confirmations. | `src/useColony.ts:56`, `src/useColony.ts:162`, `src/api.ts:190`: storage-event synchronization, persisted choices winning on read/merge, and Web Locks around concurrent saves. Both browsers confirm first-choice synchronization, reload persistence, simultaneous clicks, and read-before-save with storage events and Web Locks deliberately disabled in one fixture. |

The old `tests/engine.test.ts:80` explicitly asserted the faulty “latest choice in batch” rule. That one test now checks that batches cannot select a single move, and separately checks correct individual-round selection. Other existing tests were preserved. Seven additional regressions cover both contributions, source/seed auditability, equivalence to individual certifications, positive-batch deferral, invalid batch resolution, certification consistency, season clipping, and normal result determinism.

## Commands and actual results

Commands below used the external Node/browser runtime on PATH. Playwright's module path was supplied using `IMD_PLAYWRIGHT`; temporary browser libraries were supplied to its loader. No runtime setup is required by the static export.

| Command/check | Actual result |
| --- | --- |
| `npm ci --prefix /tmp/squeek-build --cache /tmp/squeek-tooling/npm-cache --no-audit --no-fund` | Exit 0; 105 locked project packages installed externally. No manifest/lockfile changes. |
| Original `npm test --prefix /tmp/squeek-build` | Exit 0; original 10 tests passed even though browser reproductions demonstrated the defects. |
| `node test/scratch/reproduce.mjs` against the original export | Exit 0; reproduced batch loss, clock rewind, stale activity, and contradictory tab locks. Log in temporary `test/scratch/reproduction.log`. |
| Final `npm run typecheck --prefix /tmp/squeek-build` | Exit 0; strict TypeScript check passed. |
| Final `npm test --prefix /tmp/squeek-build` | Exit 0; 17/17 tests, two files passed. |
| Final `npm run build --prefix /tmp/squeek-build` | Exit 0; TypeScript and Vite 6.4.5 passed, 32 modules. Output copied to `dist/`; export byte comparison passed. |
| `node tests/revision.browser.mjs` | Exit 0; 13/13 scenarios in Chromium, no script/local-asset failures. |
| `node tests/revision.browser.mjs --webkit` | Exit 0; 13/13 scenarios in WebKit, no script/local-asset failures. |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0, 16/16 checks on the final export in its actual API error state. Measurements retained temporarily in `test/scratch/taste-api-error/`. |
| Same pinned probe, with an external Playwright adapter intercepting API reads with the same explicitly synthetic ready-state fixture | Exit 0, 16/16 checks. Final ready-state measurements/screenshots in `test/scratch/taste/`. The pinned probe and production files were not edited. |
| Direct `curl -fsSL --max-time 30 https://api.squeekchain.com/v1/status` | HTTP 403 / curl exit 22. No live settlement or current wheel reading is claimed as verified. |
| Export/source consistency, relative asset URLs, metadata, JSON responses, and size checks | Passed; details below. |

The browser suite uses Playwright 1.64.1, the committed production export served under `/preview/`, and generated synthetic fixtures in the test only. It tests saved Nap choices and official-source links; unresolved positive batches and later rounds; clock boundary and old content timestamps; status outage/recovery; cross-tab and concurrent saves; blocked storage; core/feed retry and empty history; history paging; keyboard activation and visible focus; seed disclosure; validation errors and round lookup; five responsive widths; and reduced motion. The HTTP server and browsers close within each foreground command.

During test development, two harness defects failed assertions: sequential keyboard navigation started at the previous form position, and fixture seeding accessed storage on opaque about:blank documents. The harness now starts the keyboard walk at the skip link and seeds only HTTP documents. Those failures were repaired and the complete checks passed. Initial WebKit launches lacked OS libraries/software EGL support; external runtime setup repaired that, after which all WebKit checks ran successfully.

## Better Interface coverage

| Domain | Coverage and observations | Limits |
| --- | --- | --- |
| Accessibility | **Checked.** Native controls/fieldset, accessible names, disabled/pressed state, skip link, tab/Enter keyboard move, visible focus screenshot, input error association/focus, status/alert semantics, table headings, and reduced-motion behavior. All 38 ready-state controls meet the probe's 24px/spacing minimum; primary moves are at least 48px tall. | No screen-reader session, axe scan, forced-colors test, physical phone, or native browser 200% zoom. Thirty inline history/disclosure controls are below the comfortable 44px guideline but pass the measured minimum; existing styles preserved. |
| Layout | **Checked.** Chromium and WebKit at 320, 390, 720, 960, 1440px. No document horizontal overflow. Probe found no text overlaps, clipped text, or floating controls covering text at 320/390/1440. Screenshots confirm the scene and all three primary moves on the initial 390 × 844 ready screen. Deferred/error explanations flow without fixed-height clipping. | Error/pending copy can extend the move panel below the first screen; the first action remains reachable on it. No exhaustive width/locale, RTL, or native zoom coverage. |
| Writing | **Checked.** Retained readings now say unavailable and identify their timestamp/retry. Pending saved moves remain explicit after official batch settlement. Unknown aggregates never receive Nap/Jog/Zoomies labels. Source and NPC/local-persistence disclosures remain visible. README contains the reviewer procedure. | English only; no localization review. |
| Typography | **Checked.** Six declared token sizes, natural tracking, descending heading roles, tabular countdown, wrapping seed text, locally bundled Pixelify 600 face with successful browser load checks. Populated probe measures five sizes at mobile, six including the desktop display heading; no casing/tracking/type-scale failures. | No native text enlargement or OS/font-platform matrix. |
| Colors | **Checked.** Existing tokens unchanged. Rendered solid-background text pairs measured by the probe pass 4.5:1 (3:1 large). At 390px it measured live text 14.14:1, secondary live passes 8.76:1, Forage/Fortify/Research labels 8.20/6.88/6.94:1, Nap badge 8.94:1, and transaction links 10.82:1. Viewed the blue focus outline over the move panel. | Single dark theme. Measurements do not certify every transient state or the decorative art palette; no universal contrast/compliance claim. |
| UI | **Checked.** Loading, ready, locked, pending, unavailable, retry/recovery, storage-blocked, invalid-input, valid-round and empty-history states. Native disclosures and paging work. Probe reports no border-plus-shadow surfaces, nested cards, gradient text, or transition:all. Nine ready-state infinite animations reduce to zero under reduced motion. | No 10%-speed Animations-panel inspection. No dialog/wallet/payment component exists or was needed. |

No further first-screen or repeated design defect was reproduced. The accepted visual system was preserved; the findings fixed here are behavior, state wording, auditability, and missing documentation. `DESIGN.md` was extracted after the final source corrections and checked against the source and rendered views.

## Rendered evidence

Screenshots were made and inspected during this run. They live only in `test/scratch/`, which the assignment removes before submission; they are not delivered runtime assets.

- `test/scratch/revision/chromium-390.png`, `chromium-1440.png`, and `chromium-320.png`: ready game, mobile actions, desktop layout, narrow reflow.
- `test/scratch/revision/webkit-390.png`, `webkit-1440.png`, `webkit-focus.png`: second-engine rendering and visible keyboard outline.
- `test/scratch/revision/chromium-stale.png`: unavailable alert, timestamped last reading, stopped wheel.
- `test/scratch/revision/chromium-batch.png` / `webkit-batch.png`: positive aggregate and retained unresolved moves.
- `test/scratch/taste/shots/390.png` and `1440.png`, plus full-page variants: populated export measured by the pinned probe. First-screen prose measured 32 words at 390 and 83 at 1440, below its 60/90 limits.

## Export integrity and remaining limits

`dist/` contains seven necessary files totaling **245,353 bytes**: entry HTML, one JS bundle, CSS, WOFF/WOFF2, favicon, and share image. The superseded generated JS file was removed. Local entry assets use `./` URLs; title, description, favicon, og:title, and og:image exist. Static subpath serving is exercised by the browser suite. Source, lockfile, original public assets, tests, required docs, and `.imd-responses.json` are retained. No ignore-file changes, vendored registry, package archives, caches, dependency directories, or submodules are included. The complete source/export submission is well below 8 MiB.

Live API availability and independently fetching a real settlement remain unverified because the external service returned 403. Controlled fixtures verify behavior, not the current hamster activity or the availability of someone else's service. The game continues to require the official public data and displays errors instead of synthetic fallback results.

Nonzero multi-round events intentionally remain unresolved without authoritative individual results; later colony state pauses accordingly. No guessed division of work or provisional measurement is used. Persistence and the seeded-neighbour leaderboard remain browser/origin local. Accurate device time is required. Browsers without Web Locks get read/merge protection for an already stored choice, but atomic simultaneous writes in those legacy environments are not guaranteed. Publishing/hosting is the downstream static-export delivery step and was not performed here.
