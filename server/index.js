import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, createAnalyzer, decodeDataUrl } from './analyze.js';
import { createAccess } from './access.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_PORT = 4317;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.wav': 'audio/wav', '.webm': 'video/webm', '.png': 'image/png' };

export function makeServer(config = {}, fetcher = fetch) {
  const access = createAccess(config);
  const analyzer = createAnalyzer(config, fetcher), drafts = new Map();
  const draftSweep = setInterval(() => { for (const [id, draft] of drafts) if (draft.expires <= Date.now()) drafts.delete(id); }, 60000);
  draftSweep.unref();
  const allowedExtension = config.extensionId || '';
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const host = req.headers.host || '';
      const localHost = /^(?:127\.0\.0\.1|localhost):\d+$/.test(host);
      if (!localHost && host !== access.publicUrl?.host) throw new AppError(403, 'Unrecognized backend host. Check PUBLIC_URL.', 'FORBIDDEN');
      const origin = req.headers.origin;
      const isExtension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '') && (!allowedExtension || origin === `chrome-extension://${allowedExtension}`);
      const sameOrigin = origin === access.publicUrl?.origin || (localHost && origin === `http://${host}`);
      if (origin && !sameOrigin && !isExtension) throw new AppError(403, 'This page cannot access Verifeed.', 'FORBIDDEN');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }); res.end(); return; }
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === '/api/status' && req.method === 'GET') return json(200, { ...(access.authenticated(req) ? analyzer.status() : {}), requiresAccess: access.required, authenticated: access.authenticated(req) });
      if (url.pathname.startsWith('/api/') && url.pathname !== '/api/session') access.requireAccess(req);
      if (url.pathname.startsWith('/api/drafts/') && req.method === 'GET') {
        const id = url.pathname.split('/').at(-1), draft = drafts.get(id);
        drafts.delete(id);
        if (!draft || draft.expires < Date.now()) throw new AppError(404, 'This review link expired. Open the post again.', 'DRAFT_EXPIRED');
        return json(200, draft.data);
      }
      if (['/api/analyze', '/api/drafts', '/api/session', '/api/tickets'].includes(url.pathname) && req.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AppError(415, 'Send JSON content.', 'UNSUPPORTED_TYPE');
        const length = Number(req.headers['content-length']);
        const bodyLimit = ['/api/session', '/api/tickets'].includes(url.pathname) ? 2048 : 15000000;
        if (length > bodyLimit) throw new AppError(413, 'The content is too large.', 'TOO_LARGE');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > bodyLimit) throw new AppError(413, 'The content is too large.', 'TOO_LARGE'); chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError(400, 'Invalid JSON content.', 'INVALID_INPUT'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Invalid request.', 'INVALID_INPUT');
        if (url.pathname === '/api/session') { access.login(body, res); return json(200, { authenticated: true }); }
        if (url.pathname === '/api/tickets') return json(200, { ticket: access.ticket() });
        if (url.pathname === '/api/analyze') return json(200, await analyzer.analyze(body));
        if (!body || typeof body !== 'object' || typeof body.text !== 'string' || body.text.length > 6000 || !Array.isArray(body.links) || body.links.length > 8 || body.links.some(x => typeof x !== 'string' || x.length > 2000)) throw new AppError(400, 'Invalid post content.', 'INVALID_INPUT');
        const files = Array.isArray(body.files) ? body.files : [];
        if (files.length > 1) throw new AppError(400, 'Review one post attachment at a time.', 'INVALID_INPUT');
        for (const file of files) decodeDataUrl(file?.dataUrl, ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'video/mp4', 'video/webm'], 9000000);
        for (const [id, draft] of drafts) if (draft.expires < Date.now()) drafts.delete(id);
        if (drafts.size >= 8) drafts.delete(drafts.keys().next().value);
        const id = randomUUID();
        drafts.set(id, { data: { text: body.text, links: body.links, files: files.map(f => ({ dataUrl: f.dataUrl, name: String(f.name || 'Post attachment').slice(0, 100) })), notes: Array.isArray(body.notes) ? body.notes.filter(x => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 250)) : [], hasMedia: Boolean(body.hasMedia) }, expires: Date.now() + 5 * 60000 });
        return json(201, { id, ticket: access.ticket() });
      }
      if (url.pathname.startsWith('/api/')) throw new AppError(404, 'Not found.', 'NOT_FOUND');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new AppError(405, 'Method not allowed.', 'METHOD_NOT_ALLOWED');
      const pathname = decodeURIComponent(url.pathname);
      const relative = pathname === '/' ? 'web/index.html' : pathname === '/demo' ? 'web/demo.html' : pathname.startsWith('/shared/') ? `extension${pathname}` : `web${pathname}`;
      const file = resolve(ROOT, relative);
      const webRoot = resolve(ROOT, 'web') + sep, sharedRoot = resolve(ROOT, 'extension/shared') + sep;
      if ((!file.startsWith(webRoot) && !file.startsWith(sharedRoot)) || !mime[extname(file)]) throw new AppError(404, 'Not found.', 'NOT_FOUND');
      let bytes;
      try { bytes = await readFile(file); } catch { throw new AppError(404, 'Not found.', 'NOT_FOUND'); }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      if (!res.headersSent) json(status, { error: status === 500 ? 'Something went wrong. Please try again.' : error.message, code: error.code || 'INTERNAL_ERROR' });
      else res.end();
    }
  });
  server.requestTimeout = 150000;
  server.headersTimeout = 15000;
  server.once('close', () => { clearInterval(draftSweep); drafts.clear(); analyzer.close(); access.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || DEFAULT_PORT), host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.PUBLIC_URL) throw new Error('Set PUBLIC_URL and VERIFEED_ACCESS_TOKEN before binding a public interface.');
  const server = makeServer({ apiKey: process.env.GROQ_API_KEY, textModel: process.env.GROQ_TEXT_MODEL, visionModel: process.env.GROQ_VISION_MODEL, audioModel: process.env.GROQ_AUDIO_MODEL, maxDaily: process.env.MAX_AI_CHECKS_PER_DAY, maxMinute: process.env.MAX_AI_CHECKS_PER_MINUTE, maxTokens: process.env.MAX_AI_TOKENS_PER_DAY, extensionId: process.env.ALLOWED_EXTENSION_ID, publicUrl: process.env.PUBLIC_URL, accessToken: process.env.VERIFEED_ACCESS_TOKEN });
  server.listen(port, host, () => {
    const address = process.env.PUBLIC_URL || `http://127.0.0.1:${port}`;
    console.log(`Verifeed studio: ${address}`);
    console.log(`Practice feed: ${address}/demo`);
    console.log(process.env.GROQ_API_KEY ? 'AI analysis configured. Local scanning remains free.' : 'Local mode ready. Add GROQ_API_KEY to .env to enable AI checks.');
  });
}
