import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from './analyze.js';

const hash = value => createHash('sha256').update(value).digest();
export function createAccess(config = {}) {
  const secret = String(config.accessToken || '').trim();
  let publicUrl = null;
  if (config.publicUrl) {
    publicUrl = new URL(config.publicUrl);
    if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) throw new Error('PUBLIC_URL must be an HTTPS origin, such as https://verifeed.example.com');
    if (secret.length < 32) throw new Error('A public backend requires VERIFEED_ACCESS_TOKEN with at least 32 characters.');
  }
  if (secret && secret.length < 32) throw new Error('VERIFEED_ACCESS_TOKEN must have at least 32 characters.');
  const sessions = new Map(), tickets = new Map();
  const secretHash = hash(secret), required = Boolean(secret);
  const matches = value => typeof value === 'string' && value.length <= 512 && timingSafeEqual(hash(value), secretHash);
  function prune() { for (const store of [sessions, tickets]) for (const [key, expiry] of store) if (expiry <= Date.now()) store.delete(key); }
  const timer = setInterval(prune, 60000); timer.unref();
  function authenticated(req) {
    if (!required) return true;
    if (req.headers.authorization?.startsWith('Bearer ') && matches(req.headers.authorization.slice(7))) return true;
    const session = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('nova_session='))?.slice(13);
    return Boolean(session && (sessions.get(session) || 0) > Date.now());
  }
  function requireAccess(req) { if (!authenticated(req)) throw new AppError(401, 'Connect this browser using your Verifeed server access code.', 'SERVER_ACCESS_REQUIRED'); }
  function ticket() {
    if (!required) return null;
    prune(); if (tickets.size >= 100) tickets.delete(tickets.keys().next().value);
    const value = randomBytes(32).toString('base64url'); tickets.set(value, Date.now() + 60000); return value;
  }
  function login(body, res) {
    if (!required) return;
    const oneTime = typeof body.ticket === 'string' ? body.ticket : '';
    const validTicket = (tickets.get(oneTime) || 0) > Date.now(); tickets.delete(oneTime);
    if (!validTicket && !matches(body.accessToken)) throw new AppError(401, 'The server access code is incorrect or the connection link expired.', 'SERVER_ACCESS_REQUIRED');
    prune(); if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
    const id = randomBytes(32).toString('base64url'); sessions.set(id, Date.now() + 4 * 60 * 60000);
    res.setHeader('Set-Cookie', `nova_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=14400${publicUrl ? '; Secure' : ''}`);
  }
  return { publicUrl, required, authenticated, requireAccess, ticket, login, close: () => { clearInterval(timer); sessions.clear(); tickets.clear(); } };
}
