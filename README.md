# Squeek Colony

A free pixel colony game driven by real ten-minute Squeekchain rounds. Choose **Forage**, **Fortify**, or **Research** once per live round. The game only reads public data; it cannot affect the wheel or hamster. There are no wallets, tokens, wagers, approvals, or payments.

## Run and rebuild

Use Node.js 22 and npm. Source uses Vite, React, and TypeScript; dependencies are pinned in `package-lock.json`.

```sh
npm ci                 # locked install; npm install is also supported
npm run dev            # open the URL printed by Vite
npm run typecheck
npm test
npm run build          # recreates dist/, including a typecheck
npm run preview        # preview the production export at the printed URL
```

`dist/index.html` and all runtime assets are included. Serve `dist/` with any static HTTP host. Vite's `base: './'`, local assets, and hash anchors support a gateway subpath without server rewrites. Dependency directories and caches are not part of the export.

## Public data and authority

The [official API reference](https://docs.squeekchain.com/developers/api/) describes the public, keyless Sepolia data used by `src/api.ts`:

| Endpoint | Used for |
| --- | --- |
| [`GET /v1/core`](https://api.squeekchain.com/v1/core) | `configuration.genesisTimestamp` and the round schedule |
| [`GET /v1/status`](https://api.squeekchain.com/v1/status) | Wheel freshness, activity, RPM, provisional open-round passes; polled every 10 seconds |
| [`GET /v1/events?category=protocol&limit=100`](https://api.squeekchain.com/v1/events?category=protocol&limit=100) | Official `system.settlement_completed` events, paged with `nextCursor`; newest events refresh every 30 seconds |

A settlement covers `previousSettledThroughRound + 1` through `settledThroughRound`, with `workAdded` accepted passes and `activeRoundCount`. Each history result links to its source transaction on **Sepolia Etherscan** and the official feed. Provisional readings never settle the game. API failures show an error; a failed status refresh stops wheel animation and labels the timestamped last reading. The round clock uses the browser's time plus monotonic elapsed time, independently of the API's cached `generatedAt` content timestamp. Keep the device clock accurate.

## Resolution and reproducibility

- **Nap:** 0 accepted passes, Research yields three times its normal ideas.
- **Jog:** 1–499 passes, Forage yields three times its normal seeds.
- **Zoomies:** 500+ passes, Forage launches larger expeditions with a seeded chance of a relic. Unshielded rooms risk damage; Fortify protects the highest-level unshielded rooms for this round only.
- A multi-round event with **zero work and zero active rounds** certifies a separate Nap for every included round. Every saved move resolves separately, retaining the original batch transaction as its source. A nonzero batch is an aggregate: individual outcomes remain **unknown**, with every saved move retained. Replay pauses there, including later state-dependent rounds, rather than inventing a distribution. This version does not derive individual positive-round counts from aggregate events.
- Each resolved round `R` with official passes `P` uses seed text `squeek-colony:v1:rounds:R-R:passes:P`. `src/engine.ts` hashes it with unsigned 32-bit FNV-1a, then uses Mulberry32 for expeditions, damage, and upgrade ties. Neighbour moves use `squeek-colony:v1:crew:R:MEMBER_ID`, independently of the outcome.
- Replay proceeds in round order. Seeds and ideas enter common stores; at most one affordable room upgrades per round, choosing the lowest level and breaking ties with the seed. Six rooms have levels 0–5. Points equal seeds + ideas + 3 × shields + 5 for a favoured move + 5 for a relic. Seasons last 432 rounds and reset the colony and scores. Full yield, cost, and damage formulas live in `src/engine.ts`.

Persistence is **local to this browser and site origin**, shared between its tabs. The seven neighbour burrows are explicitly seeded NPCs, not other visitors. The leaderboard compares your burrow with those NPCs; there is no cross-device or global multiplayer service. Web Locks serialize concurrent choices where supported; other browsers re-read and merge saved choices before accepting a move. Blocked storage is reported beside the choice.

## Check a settled round

1. Open the production preview. In **Round history**, note a resolved round number `R`, its pass count, and its transaction link. Use **Show 20 more rounds** if needed.
2. Follow **Transaction** to Sepolia Etherscan and **Official feed** to the event API. Find `system.settlement_completed` with the same `source.transactionHash` (follow `nextCursor` if it has left the latest page). Confirm `R` lies between `previousSettledThroughRound + 1` and `settledThroughRound`. For a single-round event, `P = workAdded`; for an expanded Nap span, verify `workAdded = "0"` and `activeRoundCount = "0"`. A positive batch must remain unresolved, with no individual result claimed.
3. Expand **Seed and crew** on that history row. Check `rounds:R-R:passes:P` against those official values. The row lists your move, each NPC's move, yields, points, room changes, and the FNV-1a hash. No move means your burrow sat that round out.
4. Enter `R` under **Check a settled round** and select **Check round**. The outcome, seed/hash, and official source must match the history row. Reloading with the same saved choices and events must produce the same colony. A settled positive batch instead explains why its colony outcome is pending and links its official source.

For immediate repeatable settlement testing, `npm test` covers a certified 898–899 Nap batch with both saved moves, nonzero batches, season boundaries, and normal Nap/Jog/Zoomies rounds. Optional browser checks exercise the committed export with explicitly intercepted synthetic API fixtures, never as live data:

```sh
npm install --prefix /tmp/squeek-browser-check playwright@1
/tmp/squeek-browser-check/node_modules/.bin/playwright install chromium webkit
IMD_PLAYWRIGHT=/tmp/squeek-browser-check/node_modules/playwright/index.mjs node tests/revision.browser.mjs
IMD_PLAYWRIGHT=/tmp/squeek-browser-check/node_modules/playwright/index.mjs node tests/revision.browser.mjs --webkit
```

A working Playwright browser runtime and its OS libraries are prerequisites. The script owns its temporary HTTP server under `/preview/`, closes it afterward, and writes screenshots only to ignored `test/scratch/revision/`.

## Validation

Production build, typecheck, and 17 engine tests passed. All 13 production-export interaction scenarios passed in both Chromium and WebKit. The pinned design probe passed 16/16 checks in both the API error state and a populated fixture state. A direct live API request returned HTTP 403 in this environment, so live-service availability remains unverified; browser fixtures are explicitly synthetic.

Actual commands, results, the six-domain Better Interface review, and service/browser limitations are recorded in [VALIDATION.md](VALIDATION.md), also supplied as `artifacts/validation.md`. The implemented design system is in [DESIGN.md](DESIGN.md). Revision answers are in `.imd-responses.json`.
