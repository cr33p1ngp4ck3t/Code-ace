import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/shared/rules.js';
import '../extension/shared/writing.js';
import '../extension/shared/website.js';
import { isRedirect } from '../extension/website-navigation.js';
import { createAnalyzer } from '../server/analyze.js';
const scan = globalThis.VerifeedWebsite.scan;
test('only committed top-level HTTP(S) redirects trigger the website guard', () => {
  const navigation = { frameId: 0, tabId: 7, url: 'https://destination.example/', transitionQualifiers: ['server_redirect'] };
  assert.equal(isRedirect(navigation), true);
  assert.equal(isRedirect({ ...navigation, transitionQualifiers: ['client_redirect'] }), true);
  for (const overrides of [{ frameId: 2 }, { tabId: -1 }, { url: 'chrome://settings/' }, { transitionQualifiers: [] }, { transitionQualifiers: ['forward_back'] }]) assert.equal(Boolean(isRedirect({ ...navigation, ...overrides })), false);
});
test('ordinary website login instructions do not become an unsafe-site warning', () => {
  const result = scan({ text: 'Welcome back. Enter your password to sign in to your account.' });
  assert.equal(result.warningKind, null); assert.equal(result.risk, 'low');
  assert.equal(scan({ text: 'Send your OTP to our support agent immediately.' }).warningKind, 'high');
  assert.equal(scan({ text: 'You won a prize. Pay a processing fee to claim it.' }).warningKind, 'high');
});
test('AI-style destination text produces a writing notice, never an unsafe-site claim', () => {
  const text = "In today's fast-paced world, unlock your potential and revolutionize the way you work. This game-changer will help you delve into new opportunities. Our solution offers meaningful progress for every team and every challenge, with a future full of possibilities.";
  const result = scan({ text }); assert.equal(result.warningKind, 'writing'); assert.equal(result.risk, 'low'); assert.equal(result.writing.authorship, 'unverified');
  assert.equal(scan({ text: 'Never share your password. Beware of scam websites asking for a prize processing fee.' }).warningKind, null);
});
test('website scope prevents a local login false positive from overriding an AI review', async () => {
  const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ risk: 'low', reasons: [], action: 'Use the official sign-in page.', writing: { signals: [] } }) } }] })));
  try { const result = await analyzer.analyze({ context: 'website', text: 'Enter your password to sign in.' }); assert.equal(result.risk, 'low'); }
  finally { analyzer.close(); }
});
