import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { chromiumPath } from '../scripts/browser-utils.mjs';
import { makeServer } from '../server/index.js';

await mkdir('artifacts', { recursive: true });
const providerCalls = [];
let providerFails = false;
const provider = async (url, options) => {
  providerCalls.push({ url, options });
  if (providerFails) return new Response('{}', { status: 429, headers: { 'retry-after': '10' } });
  if (url.endsWith('audio/transcriptions')) return new Response(JSON.stringify({ text: 'Please send your one time password to verify your account immediately.' }));
  const body = JSON.parse(options.body);
  const value = body.model.startsWith('qwen/') ? { visible_text: 'Pay a registration fee for this internship.', observations: ['The poster ties an internship to an upfront payment.'], limitations: 'Media origin was not established.' } : { risk: 'caution', reasons: [{ title: 'A request worth checking', detail: 'The supplied content asks for something sensitive.', evidence: '<img src=x onerror="window.novaInjected=true">' }], action: 'Contact the organization using its official app.' };
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { total_tokens: 100 } }));
};
const server = makeServer({ apiKey: 'test-only-placeholder', maxMinute: 30, maxTokens: 500000 }, provider);
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = await chromiumPath();
const extension = resolve('extension');
let context;
const checks = [];
function passed(name) { checks.push(name); console.log(`PASS ${name}`); }
try {
  context = await chromium.launchPersistentContext('', { executablePath, headless: true, viewport: { width: 1440, height: 1100 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--autoplay-policy=no-user-gesture-required'] });
  const worker = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension:')) || await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(url => chrome.storage.local.set({ backendUrl: url }), base);
  passed('Manifest V3 extension loads with its service worker');
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#ai-status').textContent.includes('AI key loaded'));
  await page.screenshot({ path: 'artifacts/studio-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'A suspicious offer' }).click();
  await page.locator('#local-check').click();
  await page.waitForSelector('.risk-high'); assert.equal(providerCalls.length, 0);
  await page.getByRole('button', { name: 'Flag for my review' }).click(); assert.equal(await page.locator('#saved-count').textContent(), '1');
  await page.locator('[data-view="saved"]').click(); assert.equal(await page.locator('.saved-card').count(), 1);
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); assert.equal(await page.locator('.saved-card').count(), 0);
  await page.locator('[data-view="studio"]').click();
  passed('Local warnings and private saving work without cloud calls');

  await page.locator('#language').selectOption('ur'); assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  await page.getByRole('button', { name: 'ایک مشکوک پیشکش' }).click(); await page.locator('#local-check').click(); await page.waitForSelector('.risk-high');
  assert.match(await page.locator('.risk-row h2').textContent(), /دھوکے/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'artifacts/studio-urdu-mobile.png', fullPage: true });
  await page.locator('#language').selectOption('en'); await page.setViewportSize({ width: 1440, height: 1100 });
  passed('Urdu interface, Urdu rules and mobile layout work');

  await page.locator('[data-kind="image"]').click(); await page.getByRole('button', { name: 'An internship poster' }).click();
  await page.waitForSelector('.media-thumbnails img'); await page.waitForFunction(() => !document.querySelector('#ai-check').disabled);
  assert.equal(providerCalls.length, 0); await page.locator('#local-check').click(); await page.waitForSelector('.risk-unknown');
  await page.locator('#ai-check').click(); await page.waitForSelector('.risk-high');
  assert.equal(providerCalls.length, 2); assert.match(await page.locator('.coverage').textContent(), /1 image/);
  assert.equal(await page.evaluate(() => window.novaInjected), undefined); assert.equal(await page.locator('.result-body img').count(), 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/studio-image-result.png', fullPage: true });
  await page.locator('#ai-check').click(); await page.waitForFunction(() => document.querySelector('.risk-source')?.textContent.includes('Reused recent result'));
  assert.equal(providerCalls.length, 2);
  passed('Images are resized locally, checked on demand, safely rendered and cached');

  await page.locator('[data-kind="audio"]').click(); await page.getByRole('button', { name: 'A voice message' }).click();
  await page.waitForSelector('.media-card audio'); await page.waitForFunction(() => !document.querySelector('#ai-check').disabled);
  assert.equal(providerCalls.length, 2); await page.locator('#ai-check').click(); await page.waitForSelector('.risk-high');
  assert.equal(providerCalls.length, 4); assert.match(await page.locator('.coverage').textContent(), /seconds of speech/);
  assert.match(await page.locator('.origin-note').textContent(), /unverified/);
  passed('Audio is converted to bounded WAV, transcribed and checked');

  await page.locator('[data-kind="video"]').click(); await page.getByRole('button', { name: 'A short video' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.media-thumbnails img').length === 2, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#ai-check').disabled);
  assert.equal(providerCalls.length, 4); await page.locator('#ai-check').click(); await page.waitForSelector('.risk-high');
  assert.equal(providerCalls.length, 7); assert.match(await page.locator('.coverage').textContent(), /2 sampled video frames/);
  assert.match(await page.locator('.coverage').textContent(), /seconds of speech/);
  passed('Video checks use two actual frames and extracted speech');

  const silentVideo = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 240;
    const drawing = canvas.getContext('2d'), stream = canvas.captureStream(8);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks = [];
    const complete = new Promise(resolve => { recorder.ondataavailable = event => chunks.push(event.data); recorder.onstop = resolve; });
    recorder.start(); const interval = setInterval(() => { drawing.fillStyle = '#244c3c'; drawing.fillRect(0, 0, 400, 240); drawing.fillStyle = '#fff'; drawing.font = '24px Arial'; drawing.fillText('A silent practice video', 30, 120); }, 100);
    await new Promise(resolve => setTimeout(resolve, 1200)); recorder.stop(); await complete; clearInterval(interval); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
  });
  await page.locator('#file').setInputFiles({ name: 'silent.webm', mimeType: 'video/webm', buffer: Buffer.from(silentVideo) });
  await page.waitForFunction(() => document.querySelector('.media-card')?.textContent.includes('audio could not be extracted'));
  const beforeSilent = providerCalls.length; await page.locator('#ai-check').click(); await page.waitForSelector('.risk-high');
  assert.equal(providerCalls.length, beforeSilent + 2); assert.doesNotMatch(await page.locator('.coverage').textContent(), /seconds of speech/);
  assert.match(await page.locator('.coverage-notes').textContent(), /Only sampled frames/);
  passed('A video without audio has an explicit omission and never claims speech was checked');

  await page.locator('[data-kind="text"]').click(); await page.locator('#content').fill('Please check this different message.'); providerFails = true;
  await page.locator('#ai-check').click(); await page.waitForFunction(() => document.querySelector('#input-message').textContent.includes('busy'));
  assert.match(await page.locator('.risk-source').textContent(), /Local check/); providerFails = false;
  passed('Provider failures show an error and preserve a labeled local result');

  const feed = await context.newPage(); await feed.goto(`${base}/demo`);
  await feed.waitForFunction(() => document.querySelectorAll('[data-nova-host]').length === 7);
  assert.equal(await feed.locator('#post-internship .wrap.high').count(), 1);
  assert.equal(await feed.locator('#post-ordinary .wrap.low').count(), 1);
  assert.equal(await feed.locator('#post-image .wrap.unknown').count(), 1);
  const before = providerCalls.length; await feed.locator('#load-post').click(); await feed.waitForFunction(() => document.querySelectorAll('[data-nova-host]').length === 8); assert.equal(providerCalls.length, before);
  await feed.screenshot({ path: 'artifacts/extension-practice-feed.png', fullPage: true });
  passed('Real extension adds risk badges, handles dynamic posts and makes no AI calls');

  const tabCount = context.pages().length;
  await feed.locator('#post-image [data-nova-host] button').click();
  const imported = feed.frameLocator('[data-verifeed-panel] iframe'); await imported.locator('#media-preview img').waitFor();
  assert.equal(providerCalls.length, before); assert.equal(context.pages().length, tabCount); assert.match(await imported.locator('#post-text').textContent(), /poster/);
  await feed.getByRole('button', { name: 'Close review', exact: true }).click();
  passed('Extension imports a post image into the same-tab panel without automatically analyzing it');

  const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#enabled').uncheck(); await feed.waitForFunction(() => !document.querySelector('[data-nova-host]'));
  await popup.locator('#enabled').check(); await feed.waitForFunction(() => document.querySelectorAll('[data-nova-host]').length === 8);
  await popup.screenshot({ path: 'artifacts/extension-popup.png' });
  passed('Popup can pause and resume automatic scanning');

  const fixtures = [
    ['https://x.com/home', '<article data-testid="tweet"><div data-testid="tweetText">Send your OTP to verify your account.</div></article>'],
    ['https://www.facebook.com/', '<div role="feed"><div role="article"><div data-ad-preview="message">Guaranteed internship. Pay a registration fee to apply.</div></div></div>'],
    ['https://www.instagram.com/', '<main><article><h1>You won a prize. Pay a processing fee to claim it.</h1></article></main>'],
    ['https://www.linkedin.com/feed/', '<div class="occludable-update"><div class="feed-shared-update-v2"><div class="update-components-text">Remote internship. Pay a registration fee to reserve your place.</div></div></div>']
  ];
  for (const [url, html] of fixtures) {
    const fixture = await context.newPage(); await fixture.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${html}</body></html>` }));
    await fixture.goto(url); await fixture.waitForSelector('[data-nova-host]'); assert.equal(await fixture.locator('[data-nova-host]').count(), 1); assert.equal(await fixture.locator('.wrap.high').count(), 1); await fixture.close();
  }
  passed('All four platform adapters work against representative DOM fixtures (not live accounts)');
  assert.deepEqual(errors, []); passed('Studio has no uncaught browser errors');
  await writeFile('artifacts/browser-checks.json', JSON.stringify({ testedAt: new Date().toISOString(), browser: executablePath, checks, provider: 'test double — no live API calls', platformVerification: 'representative DOM fixtures, not authenticated live feeds' }, null, 2));
} catch (error) {
  if (context) for (const [i, page] of context.pages().entries()) await page.screenshot({ path: `artifacts/failure-${i}.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context?.close(); await new Promise(resolve => server.close(resolve));
}
