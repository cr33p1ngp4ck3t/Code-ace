import { chromium } from 'playwright';
import { chromiumPath } from '../scripts/browser-utils.mjs';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: await chromiumPath(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const results = [];
const base = process.env.VERIFEED_LIVE_URL || 'http://127.0.0.1:4318';
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  const samples = [
    ['text', 'A suspicious offer'],
    ['image', 'An internship poster'],
    ['audio', 'A voice message'],
    ['video', 'A short video']
  ];
  for (const [kind, example] of samples) {
    if (kind === 'video') {
      console.log(JSON.stringify({ stage: 'waiting', message: 'Allowing the shared vision token window to clear before the video check.' }));
      await new Promise(resolve => setTimeout(resolve, 45000));
    }
    console.log(JSON.stringify({ stage: 'starting', kind }));
    await page.locator(`[data-kind="${kind}"]`).click();
    await page.getByRole('button', { name: example }).click();
    await page.waitForFunction(() => !document.querySelector('#ai-check').disabled, null, { timeout: 30000 });
    if (kind !== 'text') await page.waitForSelector('.media-card');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/analyze') && response.request().method() === 'POST', { timeout: 150000 });
    const started = Date.now();
    await page.locator('#ai-check').click();
    const response = await responsePromise;
    const data = await response.json();
    const result = { kind, status: response.status(), seconds: Number(((Date.now() - started) / 1000).toFixed(2)), source: data.source, risk: data.risk, cached: data.cached, coverage: data.coverage, reasons: data.reasons?.map(reason => reason.title), transcriptPresent: Boolean(data.transcript), observationsPresent: Boolean(data.observations), authenticity: data.authenticity, error: data.error, code: data.code };
    results.push(result); console.log(JSON.stringify(result));
    await page.waitForFunction(() => !document.querySelector('#ai-check').disabled);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/live-${kind}.png`, fullPage: true });
    if ([401, 403].includes(response.status()) || ['PROVIDER_AUTH', 'PROVIDER_PERMISSION', 'DAILY_LIMIT'].includes(data.code)) break;
  }
  console.log(JSON.stringify({ browserErrors: errors, completed: results.length, passed: results.filter(result => result.status === 200 && result.source === 'ai').length }));
} finally {
  await writeFile('artifacts/live-check-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), backend: base, provider: 'live Groq API', results }, null, 2));
  await browser.close();
}
