import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { chromiumPath } from '../scripts/browser-utils.mjs';
import { makeServer } from '../server/index.js';

// Exercise installation into an already-open feed, as a user loads unpacked.
// Provider errors are test doubles: no account content or live tokens are used.
let providerStatus = 401, providerCalls = 0;
const server = makeServer({ apiKey: 'test-only-placeholder' }, async () => {
  providerCalls++;
  return new Response('{}', { status: providerStatus });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
const errors = [];
try {
  context = await chromium.launchPersistentContext('', {
    executablePath: await chromiumPath(), headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging']
  });
  context.on('weberror', error => errors.push(error.error().message));
  const feed = await context.newPage();
  const tweet = '<article data-testid="tweet"><div data-testid="tweetText">Send your OTP to verify your account.</div></article>';
  await feed.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${tweet}</body></html>` }));
  await feed.goto('https://x.com/home');
  assert.equal(await feed.locator('[data-nova-host]').count(), 0);
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: resolve(process.env.NOVA_TEST_EXTENSION || 'extension') });
  await feed.locator('.wrap.high').waitFor({ state: 'visible', timeout: 15000 });
  console.log('PASS Installing unpacked adds badges to an already-open feed without a refresh');

  const worker = context.serviceWorkers().find(worker => worker.url().includes(id)) || await context.waitForEvent('serviceworker');
  const popup = await context.newPage();
  // Keep the feed active, matching a toolbar popup rather than a popup opened as a tab.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://x.com/*' });
    await chrome.tabs.update(tab.id, { active: true });
  });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('1 posts checked'));
  assert.equal(await feed.locator('[data-nova-host]').count(), 1);
  await popup.locator('#enabled').uncheck();
  await feed.waitForFunction(() => !document.querySelector('[data-nova-host]'));
  await popup.locator('#scan').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('paused'));
  await popup.locator('#enabled').check();
  await feed.locator('.wrap.high').waitFor({ state: 'visible' });
  console.log('PASS Popup scans automatically and respects paused local checks');

  const fixtures = [
    ['https://twitter.com/home', tweet],
    ...['www.facebook.com', 'facebook.com'].map(host => [`https://${host}/`, '<div role="feed"><div role="article"><div data-ad-preview="message">Guaranteed internship. Pay a registration fee to apply.</div></div></div>']),
    ...['www.instagram.com', 'instagram.com'].map(host => [`https://${host}/`, '<main><article><h1>You won a prize. Pay a processing fee to claim it.</h1></article></main>']),
    ...['www.linkedin.com', 'linkedin.com'].map(host => [`https://${host}/feed/`, '<div class="occludable-update"><div class="feed-shared-update-v2"><div class="update-components-text">Remote internship. Pay a registration fee to reserve your place.</div></div></div>'])
  ];
  for (const [url, html] of fixtures) {
    const page = await context.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${html}</body></html>` }));
    await page.goto(url);
    await page.locator('.wrap.high').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-nova-host]').count(), 1);
    await page.close();
  }
  assert.equal(providerCalls, 0);
  console.log('PASS Supported feed addresses with and without www load badges without AI calls');

  const linkedIn = await context.newPage();
  await linkedIn.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><main>
    <div data-view-name="feed-full-update"><div data-id="urn:li:activity:123"><p>Remote internship. Pay a registration fee to reserve your place.</p></div></div>
    <div data-id="urn:li:activity:456"><p>We had a lovely picnic with friends today.</p></div>
  </main></body></html>` }));
  await linkedIn.goto('https://www.linkedin.com/feed/');
  await linkedIn.locator('.wrap.high').waitFor({ state: 'visible' });
  await linkedIn.locator('.wrap.low').waitFor({ state: 'visible' });
  assert.equal(await linkedIn.locator('[data-nova-host]').count(), 2);
  assert.equal(await linkedIn.locator('[data-view-name="feed-full-update"] [data-nova-host]').count(), 1);
  await linkedIn.evaluate(() => {
    const post = document.createElement('div'); post.id = 'late-post';
    post.textContent = 'Send your OTP to verify your account.';
    document.querySelector('main').append(post);
  });
  // Let the first DOM scan run before LinkedIn assigns its post marker.
  await linkedIn.waitForTimeout(500);
  assert.equal(await linkedIn.locator('#late-post [data-nova-host]').count(), 0);
  await linkedIn.evaluate(() => document.querySelector('#late-post').setAttribute('data-view-name', 'feed-full-update'));
  await linkedIn.locator('#late-post .wrap.high').waitFor({ state: 'visible' });
  assert.equal(await linkedIn.locator('[data-nova-host]').count(), 3);
  await linkedIn.evaluate(() => document.querySelector('#late-post').firstChild.textContent = 'We had a lovely picnic with friends today.');
  await linkedIn.locator('#late-post .wrap.low').waitFor({ state: 'visible' });
  assert.equal(await linkedIn.locator('[data-nova-host]').count(), 3);
  assert.equal(providerCalls, 0);
  console.log('PASS LinkedIn attribute-based posts, nested containers and dynamically marked/reused posts show one badge each');

  const studio = await context.newPage();
  await studio.goto(`http://127.0.0.1:${server.address().port}`);
  await studio.waitForFunction(() => document.querySelector('#ai-status').textContent.includes('AI key loaded'));
  await studio.locator('#content').fill('A fictional message for setup diagnostics.');
  await studio.locator('#ai-check').click();
  await studio.waitForFunction(() => document.querySelector('#ai-status').textContent.includes('Groq rejected the API key'));
  assert.match(await studio.locator('#input-message').textContent(), /Replace GROQ_API_KEY/);
  assert.match(await studio.locator('.risk-source').textContent(), /Local check/);
  assert.equal(await studio.locator('#ai-status.ready').count(), 0);
  providerStatus = 403;
  await studio.locator('#content').fill('Another fictional diagnostic message.');
  await studio.locator('#ai-check').click();
  await studio.waitForFunction(() => document.querySelector('#ai-status').textContent.includes('Groq denied access'));
  assert.match(await studio.locator('#input-message').textContent(), /model permissions/);
  assert.match(await studio.locator('.risk-source').textContent(), /Local check/);
  assert.equal(providerCalls, 2);
  assert.deepEqual(errors, []);
  console.log('PASS Studio distinguishes rejected keys from permissions and preserves the local result');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
