import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { chromium } from 'playwright';
import { chromiumPath } from '../scripts/browser-utils.mjs';
const checks = [];
const scam = 'You won a prize. Pay a processing fee to claim your reward immediately.';
const formulaic = "In today's fast-paced world, unlock your potential and revolutionize the way you work. This game-changer will help you delve into new opportunities. Our solution offers meaningful progress for every team and every challenge, with a future full of possibilities.";
const pages = {
  '/scam': `<main><h1>A message for the winner</h1><p>${scam}</p><input value="PRIVATE_INPUT"><textarea>PRIVATE_TEXTAREA</textarea><div contenteditable="true">PRIVATE_EDITOR</div></main>`,
  '/writing': `<main><h1>A brighter future</h1><p>${formulaic}</p></main>`,
  '/login': '<main><h1>Welcome back</h1><p>Enter your password to sign in to your account.</p><form><input type="password" value="PRIVATE_PASSWORD"></form></main>',
  '/delayed': `<main><h1>Loading</h1></main><script>setTimeout(() => document.querySelector('main').append(Object.assign(document.createElement('p'), {textContent:${JSON.stringify(scam)}})), 1200)</script>`,
  '/script-redirect': '<script>location.replace("/scam")</script>',
  '/frame': '<main>A normal website with an embedded frame.</main><iframe src="/redirect?to=/scam"></iframe>',
};
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/redirect') { res.writeHead(302, { Location: url.searchParams.get('to') || '/scam' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html><body style="font:18px Arial;padding:50px">${pages[url.pathname] || '<main>Ordinary page</main>'}</body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
// Grant the optional browser permissions in this isolated test copy. The real
// extension requests them through its toggle; no production permission is changed.
const directory = await mkdtemp(join(tmpdir(), 'verifeed-redirect-test-'));
const extension = join(directory, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
const manifestPath = join(extension, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.permissions.push('webNavigation'); manifest.optional_permissions = []; manifest.host_permissions.push('http://*/*', 'https://*/*');
await writeFile(manifestPath, JSON.stringify(manifest));
let context;
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
try {
  context = await chromium.launchPersistentContext('', { executablePath: await chromiumPath(), headless: true, viewport: { width: 1200, height: 850 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host; let aiRequests = 0;
  context.on('request', request => { if (/\/api\/analyze|api\.groq\.com/.test(request.url())) aiRequests++; });
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`); await popup.locator('.website-settings summary').click();
  assert.equal(await popup.locator('#website-guard').isChecked(), false);
  const disabled = await context.newPage(); await disabled.goto(`${base}/redirect`); await disabled.waitForTimeout(1000); assert.equal(await disabled.locator('[data-verifeed-site-warning]').count(), 0);
  await popup.locator('#website-guard').check(); await popup.locator('#website-guard-status').filter({ hasText: 'Enabled.' }).waitFor();
  const page = await context.newPage(); await page.goto(`${base}/redirect`); await page.locator('[data-verifeed-site-warning] h2').waitFor();
  assert.match(await page.locator('[data-verifeed-site-warning] h2').textContent(), /may be unsafe/); assert.ok((await page.locator('[data-verifeed-site-warning]').boundingBox()).x < 30); assert.equal(aiRequests, 0);
  await page.screenshot({ path: 'artifacts/redirect-warning.png' }); pass('Optional guard detects a real HTTP redirect and shows a local warning on the left');
  await page.mouse.click(900, 500); await page.keyboard.press('Escape'); assert.ok(await page.locator('[data-verifeed-site-warning]').isVisible());
  const tabCount = context.pages().length; await page.getByRole('button', { name: 'Review this page', exact: true }).click(); const review = page.frameLocator('[data-verifeed-panel] iframe');
  await review.locator('#scam.high').waitFor(); const selected = await review.locator('#post-text').textContent(); assert.ok(!selected.includes('PRIVATE_')); assert.equal(context.pages().length, tabCount); assert.equal(aiRequests, 0);
  await page.getByRole('button', { name: 'Close review', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss website warning', exact: true }).click();
  await page.evaluate(() => document.querySelector('main').append(document.createTextNode(' A new paragraph.'))); await page.waitForTimeout(1200); assert.equal(await page.locator('[data-verifeed-site-warning]').count(), 0);
  pass('Warning closes only with ×, stays dismissed, and reviews omit input/editor values');
  await page.goto(`${base}/redirect?to=/writing`); await page.locator('[data-verifeed-site-warning] .writing').waitFor(); assert.match(await page.locator('[data-verifeed-site-warning] h2').textContent(), /AI-style/); assert.doesNotMatch(await page.locator('[data-verifeed-site-warning]').textContent(), /This site may be unsafe/);
  pass('AI-style writing receives its own notice without an unsafe-site verdict');
  for (const path of ['/redirect?to=/login', '/scam', '/frame']) { await page.goto(`${base}${path}`); await page.waitForTimeout(1000); assert.equal(await page.locator('[data-verifeed-site-warning]').count(), 0); }
  pass('Normal sign-in, direct navigation, and iframe redirects do not raise a website warning');
  await page.goto(`${base}/script-redirect`); await page.waitForURL(`${base}/scam`); await page.locator('[data-verifeed-site-warning] h2').waitFor();
  await page.goto(`${base}/redirect?to=/delayed`); await page.locator('[data-verifeed-site-warning] h2').waitFor(); pass('JavaScript redirects and delayed destination content are checked');
  await popup.locator('#website-guard').uncheck(); await page.locator('[data-verifeed-site-warning]').waitFor({ state: 'detached' });
  assert.equal(aiRequests, 0); pass('Disabling the feature removes active warnings; all automatic checks spend zero AI calls');
  await writeFile('artifacts/website-guard-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), checks, aiRequests }, null, 2));
} catch (error) { if (context) for (const [i, page] of context.pages().entries()) await page.screenshot({ path: `artifacts/website-failure-${i}.png` }).catch(() => {}); throw error; }
finally { await context?.close(); await new Promise(resolve => server.close(resolve)); assert.equal(dirname(directory), tmpdir()); await rm(directory, { recursive: true, force: true }); }
