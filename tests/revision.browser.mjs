/** Production-export regression checks. Install Playwright externally; see README. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const { chromium, webkit } = await import(process.env.IMD_PLAYWRIGHT || 'playwright');
const engine = process.argv.includes('--webkit') ? webkit : chromium;
const root = resolve('dist');
const output = resolve('test/scratch/revision');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!path.startsWith('/preview/')) { res.writeHead(404).end(); return; }
    const file = resolve(root, '.' + path.slice('/preview'.length) + (path.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const genesis = 1793022600;
const start = (genesis + 899 * 600 + 590) * 1000;
const choiceKey = 'squeek-colony:choices:v1';
const event = (round, from = round, passes = 0) => ({
  type: 'system.settlement_completed', occurredAt: new Date(start).toISOString(),
  source: { transactionHash: `0x${round.toString(16).padStart(64, '0')}`, blockNumber: '12000000' },
  payload: { previousSettledThroughRound: String(from - 1), settledThroughRound: String(round), workAdded: String(passes), activeRoundCount: passes > 0 ? '1' : '0', blockHeight: '1' },
});
const earlier = Array.from({ length: 33 }, (_, i) => event(897 - i));
const core = { configuration: { genesisTimestamp: String(genesis), roundDuration: '600' }, core: { settledThroughRound: '899' }, installationId: 'browser-test-fixture' };
const status = { generatedAt: new Date(start).toISOString(), measurement: { freshness: 'online', coreStatus: 'ACTIVE', rpmMilli: 60000 }, builder: { status: 'available', queued: { openRoundWorkUnits: '123' }, anchor: { settledThroughRound: '899' } } };
let browser;
let checked = 0;
const localErrors = [];
const pollUntil = async (read, predicate, message) => {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((done) => setTimeout(done, 20));
  }
  assert.fail(message);
};
async function fixture({ choices = {}, events = [event(899, 898), ...earlier], time = start, generatedAt = status.generatedAt, coreFails = false, feedFails = false, statusFails = false, width = 390, reducedMotion = 'no-preference', storageBlocked = false, locksDisabled = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion });
  const state = { coreFails, feedFails, statusFails, polls: 0, events };
  context.on('page', (page) => {
    page.on('pageerror', (error) => localErrors.push(error.message));
    page.on('response', (response) => { if (response.url().startsWith(url) && response.status() >= 400) localErrors.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', (request) => { if (request.url().startsWith(url) && !request.failure()?.errorText.includes('ABORTED')) localErrors.push(request.failure()?.errorText); });
  });
  // All data in this test is synthetic and intercepted; the game ships no fixtures.
  await context.route('https://api.squeekchain.com/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const fail = () => route.fulfill({ status: 503, json: { error: 'database_unavailable' } });
    if (path === '/v1/core') return state.coreFails ? fail() : route.fulfill({ json: core });
    if (path === '/v1/status') {
      state.polls++;
      return state.statusFails ? fail() : route.fulfill({ json: { ...status, generatedAt } });
    }
    return state.feedFails ? fail() : route.fulfill({ json: { status: 'available', events: state.events, nextCursor: null } });
  });
  await context.addInitScript(({ choiceKey, choices, storageBlocked, locksDisabled }) => {
    if (location.protocol !== 'http:') return; // Do not seed opaque about:blank documents.
    if (localStorage.getItem(choiceKey) === null) localStorage.setItem(choiceKey, JSON.stringify(choices));
    if (storageBlocked) Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    if (locksDisabled) Object.defineProperty(navigator, 'locks', { value: undefined });
  }, { choiceKey, choices, storageBlocked, locksDisabled });
  const open = async () => {
    const page = await context.newPage();
    await page.clock.install({ time });
    await page.goto(url);
    await page.locator('#round-title').waitFor();
    await pollUntil(() => page.locator('#round-title').innerText(), (s) => s !== 'Loading round', 'Core did not load');
    if (!state.coreFails && !state.feedFails && state.events.length) await page.locator('.history-row').first().waitFor();
    return page;
  };
  return { context, page: await open(), open, state };
}
async function run(name, fn) {
  await fn(); checked++; console.log(`PASS ${name}`);
}
const forage = (page) => page.getByRole('button', { name: 'Forage Seeds, best on a Jog', exact: true });
const research = (page) => page.getByRole('button', { name: 'Research Ideas, best on a Nap', exact: true });
const tick = async (page, state) => {
  const before = state.polls;
  await page.clock.runFor(11010);
  await pollUntil(() => state.polls, (n) => n > before, 'Status did not poll');
};
try {
  browser = await engine.launch();
  await run('zero-work batch resolves and audits both saved choices', async () => {
    const { context, page } = await fixture({ choices: { 898: 'forage', 899: 'research' } });
    assert.match(await page.locator('#round-898').innerText(), /You chose Forage/);
    assert.match(await page.locator('#round-899').innerText(), /You chose Research/);
    assert.equal(await page.locator('.board tr.you td').last().textContent(), '2');
    assert.equal(await page.locator('.round .pending').count(), 0);
    for (const round of [898, 899]) {
      const row = page.locator(`#round-${round}`);
      assert.match(await row.innerText(), /certifies zero work across rounds 898 to 899/);
      assert.equal(await row.locator('a').first().getAttribute('href'), `https://sepolia.etherscan.io/tx/${event(899).source.transactionHash}`);
      await row.locator('summary').click();
      assert.match(await row.locator('code').first().innerText(), new RegExp(`rounds:${round}-${round}:passes:0`));
    }
    await page.getByLabel('Round number', { exact: true }).fill('898');
    await page.getByRole('button', { name: 'Check round', exact: true }).click();
    assert.match(await page.locator('.verify-out').innerText(), /Round 898.*Nap/s);
    await context.close();
  });
  await run('positive batch stays unknown with both saved choices and subsequent rounds pending', async () => {
    const { context, page } = await fixture({ choices: { 898: 'forage', 899: 'research', 900: 'fortify' }, time: start + 600000, events: [event(900), event(899, 898, 600), ...earlier] });
    const batch = page.locator('#round-899');
    assert.match(await batch.innerText(), /Official batch total: 600 passes.*Individual round results are unknown/s);
    assert.match(await batch.innerText(), /Round 898: Forage, saved and unresolved/);
    assert.match(await batch.innerText(), /Round 899: Research, saved and unresolved/);
    assert.equal(await batch.locator('.tag').count(), 0);
    assert.equal(await page.locator('.board tr.you td').last().textContent(), '0');
    assert.match(await page.locator('#round-900').innerText(), /waiting on an earlier batch/);
    assert.equal(await page.locator('.round .pending li').count(), 3);
    await page.getByLabel('Round number', { exact: true }).fill('898');
    await page.getByRole('button', { name: 'Check round', exact: true }).click();
    assert.match(await page.locator('#verify-error').innerText(), /settled, but its colony outcome is pending/);
    assert.equal(await page.locator('#verify a').first().getAttribute('href'), `https://sepolia.etherscan.io/tx/${event(899).source.transactionHash}`);
    await page.screenshot({ path: `${output}/${engine.name()}-batch.png`, fullPage: true });
    await context.close();
  });
  await run('unchanged status cannot rewind a round boundary', async () => {
    const { context, page, state } = await fixture();
    await tick(page, state);
    await pollUntil(() => page.locator('#round-title').innerText(), (s) => s === 'Round 901', 'Round did not advance');
    assert.match(await page.locator('.clock').innerText(), /9:5[89] left/);
    await forage(page).click();
    await pollUntil(() => page.locator('.note[role=status]').innerText(), (s) => s.includes('round 901'), 'Move did not target new round');
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), choiceKey);
    assert.equal(stored[901], 'forage'); assert.equal(stored[900], undefined);
    await context.close();
  });
  await run('initial stale content timestamp is not used as current time', async () => {
    const { context, page } = await fixture({ generatedAt: new Date(start - 3600000).toISOString() });
    assert.equal(await page.locator('#round-title').innerText(), 'Round 900');
    assert.match(await page.locator('.clock').innerText(), /0:10 left/);
    await context.close();
  });
  await run('failed refresh stops activity, labels timestamped last reading, and recovers', async () => {
    const { context, page, state } = await fixture();
    assert.equal(await page.locator('.wheel.spinning').count(), 1);
    state.statusFails = true;
    await tick(page, state);
    await pollUntil(() => page.locator('.live-line').innerText(), (s) => s.includes('unavailable'), 'Failure did not display');
    assert.match(await page.getByRole('alert').innerText(), /Wheel status unavailable. Showing the last reading./);
    assert.equal(await page.locator('.wheel.spinning').count(), 0);
    assert.equal(await page.locator('.round time').getAttribute('datetime'), status.generatedAt);
    assert.doesNotMatch(await page.locator('.live-line').innerText(), /so far|Wheel turning/);
    assert.match(await page.locator('.scene').getAttribute('aria-label'), /wheel is unknown/);
    await page.screenshot({ path: `${output}/${engine.name()}-stale.png` });
    state.statusFails = false;
    await tick(page, state);
    await pollUntil(() => page.locator('.live-line').innerText(), (s) => s.includes('Wheel turning'), 'Status did not recover');
    assert.equal(await page.locator('.wheel.spinning').count(), 1);
    assert.equal(await page.getByRole('alert').count(), 0);
    await context.close();
  });
  await run('two open tabs synchronize the first locked move and persist it on reload', async () => {
    const { context, page: a, open } = await fixture();
    const b = await open();
    await forage(a).click();
    await pollUntil(() => forage(b).getAttribute('aria-pressed'), (s) => s === 'true', 'Second tab did not synchronize');
    assert.equal(await research(b).isDisabled(), true);
    await a.reload();
    await pollUntil(() => forage(a).getAttribute('aria-pressed'), (s) => s === 'true', 'Choice lost on reload');
    assert.equal(await forage(b).getAttribute('aria-pressed'), 'true');
    await context.close();
  });
  await run('a stale tab re-reads storage before saving, even without storage events or Web Locks', async () => {
    const { context, page: a, open } = await fixture({ locksDisabled: true });
    // Deliberately drop the listener in tab B to exercise the independent read-before-save safeguard.
    await context.addInitScript(() => {
      const add = window.addEventListener;
      window.addEventListener = function (name, ...args) { if (name !== 'storage') return add.call(this, name, ...args); };
    });
    const b = await open();
    await forage(a).click();
    await research(b).click();
    await pollUntil(() => forage(b).getAttribute('aria-pressed'), (s) => s === 'true', 'Stored first move was overwritten');
    assert.equal(await a.evaluate((key) => JSON.parse(localStorage.getItem(key))[900], choiceKey), 'forage');
    await context.close();
  });
  await run('simultaneous tab clicks settle on one consistent stored move', async () => {
    const { context, page: a, open } = await fixture();
    const b = await open();
    // Dispatch both handlers in parallel without Playwright waiting on disabled state.
    await Promise.all([forage(a).evaluate((button) => button.click()), research(b).evaluate((button) => button.click())]);
    const move = await pollUntil(() => a.evaluate((key) => JSON.parse(localStorage.getItem(key))[900], choiceKey), Boolean, 'No move saved');
    for (const page of [a, b]) {
      await pollUntil(() => page.locator(`.choice-${move}`).getAttribute('aria-pressed'), (s) => s === 'true', 'Tabs disagree after concurrent clicks');
      assert.equal(await page.locator('.choice[aria-pressed=true]').count(), 1);
    }
    await context.close();
  });
  await run('blocked storage reports the persistence limitation beside the locked choice', async () => {
    const { context, page } = await fixture({ storageBlocked: true });
    await forage(page).click();
    await pollUntil(() => page.locator('.round').innerText(), (s) => s.includes('blocked storage'), 'Missing storage warning');
    assert.equal(await forage(page).getAttribute('aria-pressed'), 'true');
    await context.close();
  });
  await run('core and feed failure retry, first-load status failure, and empty history are explicit', async () => {
    const { context, page, state } = await fixture({ coreFails: true, feedFails: true, statusFails: true });
    assert.equal(await page.locator('#round-title').innerText(), 'Round unavailable');
    assert.equal(await page.locator('.wheel.spinning').count(), 0);
    assert.equal(await forage(page).count(), 0);
    state.coreFails = false; state.feedFails = false; state.events = [];
    await page.getByRole('button', { name: 'Try again', exact: true }).first().click();
    await pollUntil(() => page.locator('#round-title').innerText(), (s) => s === 'Round 900', 'Retry did not recover core');
    await pollUntil(() => page.locator('#history .empty').innerText(), (s) => s.includes('No rounds have settled'), 'Missing empty state');
    assert.match(await page.locator('.live-line').innerText(), /Wheel status unavailable/);
    assert.equal(await forage(page).isEnabled(), true);
    await context.close();
  });
  await run('history paging, keyboard choice, seed disclosure, and verification errors work', async () => {
    const { context, page } = await fixture();
    assert.equal(await page.locator('.history-row').count(), 10);
    await page.getByRole('button', { name: 'Show 20 more rounds', exact: true }).click();
    assert.equal(await page.locator('.history-row').count(), 30);
    await page.getByLabel('Round number', { exact: true }).fill('oops');
    await page.getByRole('button', { name: 'Check round', exact: true }).click();
    assert.equal(await page.getByLabel('Round number', { exact: true }).getAttribute('aria-invalid'), 'true');
    assert.equal(await page.getByLabel('Round number', { exact: true }).evaluate((el) => el === document.activeElement), true);
    await page.getByLabel('Round number', { exact: true }).fill('898');
    await page.getByRole('button', { name: 'Check round', exact: true }).click();
    assert.equal(await page.getByLabel('Round number', { exact: true }).getAttribute('aria-invalid'), 'false');
    const summary = page.locator('.history-row').first().locator('summary');
    await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.history-row').first().locator('details').getAttribute('open'), '');
    await page.locator('.skip').focus();
    // Focus the native choice by keyboard and confirm its visible focus treatment.
    for (let i = 0; i < 15 && !(await forage(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    assert.equal(await forage(page).evaluate((el) => el === document.activeElement), true);
    const outline = await forage(page).evaluate((el) => getComputedStyle(el).outlineWidth);
    assert.equal(outline, '3px');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `${output}/${engine.name()}-focus.png` });
    await page.keyboard.press('Enter');
    await pollUntil(() => forage(page).getAttribute('aria-pressed'), (s) => s === 'true', 'Keyboard move did not lock');
    await context.close();
  });
  await run('responsive export loads at 320, 390, 720, 960 and 1440; all three moves are on the first phone screen', async () => {
    for (const width of [320, 390, 720, 960, 1440]) {
      const { context, page } = await fixture({ width });
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth, font: document.fonts.check('600 22px "Pixelify Sans"'), title: document.title }));
      assert.ok(metrics.content <= metrics.viewport, `Horizontal overflow at ${width}: ${metrics.content}`);
      assert.equal(metrics.font, true);
      if (width === 390) {
        for (const button of [forage(page), page.getByRole('button', { name: 'Fortify Shields rooms this round', exact: true }), research(page)]) {
          const box = await button.boundingBox(); assert.ok(box.y >= 0 && box.y + box.height <= 844, 'A primary move is below the first phone screen');
        }
      }
      await page.screenshot({ path: `${output}/${engine.name()}-${width}.png` });
      if ([390, 1440].includes(width)) await page.screenshot({ path: `${output}/${engine.name()}-${width}-full.png`, fullPage: true });
      await context.close();
    }
  });
  await run('reduced motion stops all infinite scene animation', async () => {
    const { context, page } = await fixture({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length), 0);
    await context.close();
  });
  assert.deepEqual(localErrors, [], 'Script/local asset failures');
  console.log(`${checked} interaction scenarios passed in ${engine.name()}; zero script or local asset errors.`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
