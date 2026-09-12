import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chromiumPath } from '../scripts/browser-utils.mjs';
import { makeServer } from '../server/index.js';
const calls = [], checks = []; let fail = false;
const provider = async (url, options) => {
  calls.push(url); if (fail) return new Response('{}', { status: 429, headers: { 'retry-after': '10' } });
  const raw = url.endsWith('audio/transcriptions') ? { text: 'Send your OTP to verify your account.' } : JSON.parse(options.body).model.startsWith('qwen/') ? { visible_text: 'Pay a registration fee to apply for this internship.', observations: ['A fee is requested.'], limitations: 'Origin unknown.' } : { risk: 'low', reasons: [], action: 'Check independently.', writing: { signals: [] } };
  return new Response(JSON.stringify(url.endsWith('audio/transcriptions') ? raw : { choices: [{ message: { content: JSON.stringify(raw) }, finish_reason: 'stop' }] }));
};
const server = makeServer({ apiKey: 'test-only-placeholder', maxMinute: 30, maxTokens: 500000 }, provider);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const extension = resolve('extension'); let context;
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
try {
  context = await chromium.launchPersistentContext('', { executablePath: await chromiumPath(), headless: true, viewport: { width: 1280, height: 950 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--autoplay-policy=no-user-gesture-required'] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'); await worker.evaluate(url => chrome.storage.local.set({ backendUrl: url }), base);
  const feed = await context.newPage(); const errors = []; feed.on('pageerror', error => errors.push(error.message));
  await feed.goto(`${base}/demo`); await feed.waitForSelector('#post-internship [data-nova-host]');
  const badge = feed.locator('#post-internship [data-nova-host]'); assert.equal(await badge.getByRole('button').count(), 1); assert.ok((await badge.boundingBox()).height <= 32);
  const pageCount = context.pages().length; assert.equal(calls.length, 0);
  await feed.screenshot({ path: 'artifacts/compact-feed.png', fullPage: true }); pass('One compact control per post; scrolling makes no AI calls');
  await badge.getByRole('button').click(); const panel = feed.frameLocator('[data-verifeed-panel] iframe');
  await panel.locator('#risk-title').waitFor(); assert.match(await panel.locator('#status').textContent(), /Local patterns/); assert.equal(context.pages().length, pageCount); assert.equal(calls.length, 0);
  await feed.mouse.click(8, 8); assert.ok(await feed.locator('dialog').isVisible());
  await panel.locator('#analyze').focus(); await feed.keyboard.press('Escape'); assert.ok(await feed.locator('dialog').isVisible());
  pass('Same-tab dialog survives outside clicks and Escape, including focus inside the frame');
  await panel.locator('#analyze').click(); await panel.locator('#status').filter({ hasText: 'AI-assisted' }).waitFor(); assert.equal(calls.length, 1);
  assert.ok(await panel.locator('#writing').isVisible()); assert.ok(await panel.locator('#scam').isVisible());
  await feed.screenshot({ path: 'artifacts/inline-review.png' });
  await feed.getByRole('button', { name: 'Close review', exact: true }).click(); assert.equal(await feed.locator('[data-verifeed-panel]').count(), 0);
  pass('Explicit analysis shows separate scam and writing results; only × dismisses it');
  for (const [id, expected] of [['post-image', 'image'], ['post-voice', 'speech'], ['post-video', 'video frames']]) {
    await feed.locator(`#${id} [data-nova-host] button`).click(); const review = feed.frameLocator('[data-verifeed-panel] iframe');
    await review.locator('#analyze:enabled').waitFor({ timeout: 30000 });
    if (id === 'post-image') await review.locator('#media-preview img').waitFor();
    else await review.locator('#media-preview audio').waitFor({ timeout: 30000 });
    await review.locator('#analyze').click(); await review.locator('#status').filter({ hasText: 'AI-assisted' }).waitFor(); assert.match(await review.locator('#coverage').textContent(), new RegExp(expected));
    await feed.getByRole('button', { name: 'Close review', exact: true }).click();
  }
  pass('Images, audio, and video prepare and analyze inside the same-tab panel');
  await feed.evaluate(() => { const article = document.createElement('article'); article.dataset.novaPost = ''; article.id = 'writing-fixture'; const text = document.createElement('p'); text.dataset.postText = ''; text.textContent = "In today's fast-paced world, unlock your potential and revolutionize the way you work. This game-changer will help you delve into new opportunities. Our solution offers meaningful progress for every team and every challenge, with a future full of possibilities."; article.append(text); document.querySelector('#post-ordinary').after(article); });
  await feed.waitForSelector('#writing-fixture .writing'); await feed.locator('#writing-fixture button').click();
  const stylePanel = feed.frameLocator('[data-verifeed-panel] iframe'); await stylePanel.locator('#writing.signals').waitFor(); assert.ok(await stylePanel.locator('#scam.low').isVisible());
  fail = true; await stylePanel.locator('#analyze').click(); await stylePanel.locator('#error').filter({ hasText: 'busy' }).waitFor(); assert.ok(await stylePanel.locator('#writing.signals').isVisible());
  await feed.getByRole('button', { name: 'Close review', exact: true }).click(); pass('Writing cue stays separate from scam risk, and provider errors preserve local evidence');
  assert.deepEqual(errors, []); await writeFile('artifacts/panel-checks.json', JSON.stringify({ checkedAt: new Date().toISOString(), provider: 'test double', checks }, null, 2));
} catch (error) { if (context) for (const [i, page] of context.pages().entries()) await page.screenshot({ path: `artifacts/panel-failure-${i}.png` }).catch(() => {}); throw error; }
finally { await context?.close(); await new Promise(resolve => server.close(resolve)); }
