import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server/index.js';
import { normalizeBackend, studioUrl, getBackend } from '../extension/backend.js';
const secret = 'test-only-server-access-code-0123456789abcdef';
async function serverTest(fn, config = {}) {
  const server = makeServer({ accessToken: secret, ...config }, () => assert.fail('Authentication checks must never call Groq'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (base, path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('backend addresses allow HTTPS and local SSH tunnels; reject credentials and public HTTP', () => {
  assert.equal(normalizeBackend(' https://verifeed.example.com/ '), 'https://verifeed.example.com');
  assert.equal(normalizeBackend('http://127.0.0.1:4318'), 'http://127.0.0.1:4318');
  for (const url of ['http://84.235.240.141:4317', 'https://user:password@example.com', 'https://example.com/api', 'https://example.com/#token', 'file:///etc/passwd']) assert.throws(() => normalizeBackend(url));
  const url = studioUrl('https://example.com', { draft: 'draft-id', ticket: 'one-time-ticket' });
  assert.equal(new URL(url).hash, '#ticket=one-time-ticket'); assert.equal(new URL(url).searchParams.get('draft'), 'draft-id');
});
test('server credentials cannot be sent to a different saved backend', async () => {
  globalThis.chrome = { storage: { local: { get: async () => ({ backendUrl: 'https://new.example.com' }) }, session: { get: async () => ({ backendToken: { url: 'https://old.example.com', token: secret } }) } } };
  try { assert.deepEqual(await getBackend(), { url: 'https://new.example.com', token: '' }); } finally { delete globalThis.chrome; }
});
test('public deployment requires HTTPS and a strong server access code', () => {
  assert.throws(() => makeServer({ publicUrl: 'https://verifeed.example.com' }), /at least 32/);
  assert.throws(() => makeServer({ publicUrl: 'http://verifeed.example.com', accessToken: secret }), /HTTPS origin/);
});
test('protected backend hides private status and rejects unauthorized analysis and drafts', () => serverTest(async base => {
  const status = await (await fetch(`${base}/api/status`)).json(); assert.equal(status.requiresAccess, true); assert.equal(status.authenticated, false); assert.equal(status.configured, undefined);
  for (const path of ['/api/analyze', '/api/drafts', '/api/tickets']) assert.equal((await post(base, path, {})).status, 401);
  assert.equal((await fetch(`${base}/api/drafts/unknown`)).status, 401);
  const accepted = await (await fetch(`${base}/api/status`, { headers: { Authorization: `Bearer ${secret}` } })).json(); assert.equal(accepted.authenticated, true);
}));
test('connection tickets are single use and establish a secure, HttpOnly session', () => serverTest(async base => {
  const response = await post(base, '/api/tickets', {}, { Authorization: `Bearer ${secret}` }); assert.equal(response.status, 200);
  const { ticket } = await response.json(); assert.ok(ticket.length >= 32);
  const login = await post(base, '/api/session', { ticket }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/); assert.ok(!cookie.includes(secret));
  assert.equal((await post(base, '/api/session', { ticket })).status, 401);
  assert.equal((await (await fetch(`${base}/api/status`, { headers: { Cookie: cookie.split(';')[0] } })).json()).authenticated, true);
  assert.equal((await post(base, '/api/session', { accessToken: 'wrong' })).status, 401);
}, { publicUrl: 'https://verifeed.example.com' }));
test('extension CORS permits Authorization but rejects unrelated websites', () => serverTest(async base => {
  const extension = `chrome-extension://${'a'.repeat(32)}`;
  const response = await fetch(`${base}/api/tickets`, { method: 'OPTIONS', headers: { Origin: extension, 'Access-Control-Request-Headers': 'Authorization' } });
  assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), extension); assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
  assert.equal((await post(base, '/api/session', { accessToken: secret }, { Origin: 'https://evil.example' })).status, 403);
}));
