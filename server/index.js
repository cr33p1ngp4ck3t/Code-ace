import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, createAnalyzer, decodeDataUrl } from './analyze.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = 4317;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.wav': 'audio/wav', '.webm': 'video/webm', '.png': 'image/png' };

export function makeServer(config = {}, fetcher = fetch) {
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
      if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)) throw new AppError(403, 'Unrecognized local host.', 'FORBIDDEN');
      const origin = req.headers.origin;
      const isExtension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '') && (!allowedExtension || origin === `chrome-extension://${allowedExtension}`);
      if (origin && origin !== `http://${host}` && !isExtension) throw new AppError(403, 'This page cannot access Nova.', 'FORBIDDEN');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === '/api/status' && req.method === 'GET') return json(200, analyzer.status());
      if (url.pathname.startsWith('/api/drafts/') && req.method === 'GET') {
        const id = url.pathname.split('/').at(-1), draft = drafts.get(id);
        drafts.delete(id);
        if (!draft || draft.expires < Date.now()) throw new AppError(404, 'This review link expired. Open the post again.', 'DRAFT_EXPIRED');
        return json(200, draft.data);
      }
      if (['/api/analyze', '/api/drafts'].includes(url.pathname) && req.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new AppError(415, 'Send JSON content.', 'UNSUPPORTED_TYPE');
        const length = Number(req.headers['content-length']);
        if (length > 15000000) throw new AppError(413, 'The content is too large.', 'TOO_LARGE');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 15000000) throw new AppError(413, 'The content is too large.', 'TOO_LARGE'); chunks.push(chunk); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError(400, 'Invalid JSON content.', 'INVALID_INPUT'); }
        if (url.pathname === '/api/analyze') return json(200, await analyzer.analyze(body));
        if (!body || typeof body !== 'object' || typeof body.text !== 'string' || body.text.length > 6000 || !Array.isArray(body.links) || body.links.length > 8 || body.links.some(x => typeof x !== 'string' || x.length > 2000)) throw new AppError(400, 'Invalid post content.', 'INVALID_INPUT');
        const files = Array.isArray(body.files) ? body.files : [];
        if (files.length > 1) throw new AppError(400, 'Review one post attachment at a time.', 'INVALID_INPUT');
        for (const file of files) decodeDataUrl(file?.dataUrl, ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm', 'video/mp4', 'video/webm'], 9000000);
        for (const [id, draft] of drafts) if (draft.expires < Date.now()) drafts.delete(id);
        if (drafts.size >= 8) drafts.delete(drafts.keys().next().value);
        const id = randomUUID();
        drafts.set(id, { data: { text: body.text, links: body.links, files: files.map(f => ({ dataUrl: f.dataUrl, name: String(f.name || 'Post attachment').slice(0, 100) })), notes: Array.isArray(body.notes) ? body.notes.filter(x => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 250)) : [], hasMedia: Boolean(body.hasMedia) }, expires: Date.now() + 5 * 60000 });
        return json(201, { id });
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
  server.once('close', () => { clearInterval(draftSweep); drafts.clear(); analyzer.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = makeServer({ apiKey: process.env.GROQ_API_KEY, textModel: process.env.GROQ_TEXT_MODEL, visionModel: process.env.GROQ_VISION_MODEL, audioModel: process.env.GROQ_AUDIO_MODEL, maxDaily: process.env.MAX_AI_CHECKS_PER_DAY, maxMinute: process.env.MAX_AI_CHECKS_PER_MINUTE, maxTokens: process.env.MAX_AI_TOKENS_PER_DAY, extensionId: process.env.ALLOWED_EXTENSION_ID });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Nova studio: http://127.0.0.1:${PORT}`);
    console.log(`Practice feed: http://127.0.0.1:${PORT}/demo`);
    console.log(process.env.GROQ_API_KEY ? 'AI analysis configured. Local scanning remains free.' : 'Local mode ready. Add GROQ_API_KEY to .env to enable AI checks.');
  });
}
