import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { makeServer } from '../server/index.js';

async function withServer(fn) {
  const server = makeServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('serves the app but never env, source, or traversal targets', () => withServer(async base => {
  const app = await fetch(base); assert.equal(app.status, 200); assert.match(await app.text(), /Your digital shield/);
  for (const path of ['/.env', '/server/index.js', '/package.json', '/shared/../../.env', '/%2e%2e%2f.env']) assert.equal((await fetch(`${base}${path}`)).status, 404);
  assert.equal((await fetch(`${base}/shared/rules.js`)).status, 200);
}));
test('rejects foreign origins, DNS rebinding hosts and non-JSON submissions', () => withServer(async base => {
  assert.equal((await fetch(`${base}/api/status`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  const hostileHostStatus = await new Promise((resolve, reject) => { get(`${base}/api/status`, { headers: { Host: 'evil.example:4317' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
  assert.equal(hostileHostStatus, 403);
  assert.equal((await fetch(`${base}/api/analyze`, { method: 'POST', body: 'text=hello' })).status, 415);
}));
test('drafts are opaque, consumed once and do not call AI', () => withServer(async base => {
  const response = await fetch(`${base}/api/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'A selected post for review.', links: [], files: [], hasMedia: false }) });
  assert.equal(response.status, 201); const { id } = await response.json(); assert.match(id, /^[a-f0-9-]{36}$/);
  const draft = await fetch(`${base}/api/drafts/${id}`); assert.equal((await draft.json()).text, 'A selected post for review.');
  assert.equal((await fetch(`${base}/api/drafts/${id}`)).status, 404);
}));
test('status exposes setup state without exposing credentials', () => withServer(async base => {
  const result = await (await fetch(`${base}/api/status`)).json(); assert.equal(result.configured, false); assert.equal(result.apiKey, undefined);
  const response = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Please check this message.' }) });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'AI_NOT_CONFIGURED');
}));
