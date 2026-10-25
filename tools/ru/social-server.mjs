#!/usr/bin/env node
// Анонимные лайки и репосты для страниц пунктов. Без авторизации.
//   node tools/ru/social-server.mjs [--port 8080] [--static dist-ru/site] [--db ru-work/social/social.sqlite]
// С --static раздаёт сайт и API с одного origin (нужно для браузера).
// Rate limit по IP. Повторный лайк с тем же device-id снимает лайк (toggle).
import { createServer } from 'node:http';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const STATIC = opt('static', process.env.HLTB_SOCIAL_STATIC || '');
const PORT = Number(opt('port', process.env.HLTB_SOCIAL_PORT || (STATIC ? 8080 : 8090)));
const DB_PATH = resolve(opt('db', process.env.HLTB_SOCIAL_DB || 'ru-work/social/social.sqlite'));
const ORIGIN_OK = String(process.env.HLTB_SOCIAL_ORIGINS || 'http://127.0.0.1:8080,http://localhost:8080,https://howtolivebetter.ru,http://howtolivebetter.ru')
  .split(',').map((s) => s.trim()).filter(Boolean);
const ROOT = STATIC ? resolve(STATIC) : '';

const LIMITS = {
  ipMin: { max: 90, windowMs: 60_000 },
  likeHour: { max: 40, windowMs: 3_600_000 },
  repostHour: { max: 12, windowMs: 3_600_000 },
  repostMin: { max: 3, windowMs: 60_000 },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS likes (
    entry_key TEXT NOT NULL,
    device_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (entry_key, device_hash)
  );
  CREATE TABLE IF NOT EXISTS reposts (
    id TEXT PRIMARY KEY,
    entry_key TEXT NOT NULL,
    device_hash TEXT NOT NULL,
    title TEXT,
    url TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reposts_entry ON reposts(entry_key);
`);

const windows = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  w.count += 1;
  return {
    allowed: w.count <= max,
    limit: max,
    remaining: Math.max(0, max - w.count),
    retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)),
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
}, 60_000).unref();

const KEY_RE = /^\d+-\d+$/;
const isKey = (k) => KEY_RE.test(k);
const json = (res, code, body, extra = {}) => {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
  });
  res.end(data);
};

function cors(req, res) {
  const origin = req.headers.origin || '';
  const allow = !origin || ORIGIN_OK.includes(origin) || ORIGIN_OK.includes('*');
  if (allow && origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,x-device-id');
    res.setHeader('access-control-max-age', '86400');
  }
  return allow;
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket.remoteAddress || '0.0.0.0';
}

function deviceHash(req) {
  const raw = String(req.headers['x-device-id'] || '').trim().slice(0, 80);
  const id = raw || 'anon';
  return createHash('sha256').update(`${id}|${clientIp(req)}`).digest('hex').slice(0, 32);
}

function readBody(req, limit = 8_000) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolveBody({});
      try { resolveBody(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('invalid json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function stats(entryKey, device) {
  const likes = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE entry_key = ?').get(entryKey).n;
  const reposts = db.prepare('SELECT COUNT(*) AS n FROM reposts WHERE entry_key = ?').get(entryKey).n;
  const liked = !!db.prepare('SELECT 1 AS x FROM likes WHERE entry_key = ? AND device_hash = ?').get(entryKey, device);
  return { likes, reposts, liked: !!liked };
}

function rateHeaders(r) {
  const h = {
    'x-ratelimit-limit': String(r.limit),
    'x-ratelimit-remaining': String(r.remaining),
  };
  if (!r.allowed) h['retry-after'] = String(r.retryAfterSec);
  return h;
}

function safeStaticPath(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.includes('\0') || p.includes('..')) return null;
  if (p.endsWith('/')) p += 'index.html';
  if (p === '') p = '/index.html';
  const full = resolve(join(ROOT, p));
  if (!full.startsWith(ROOT)) return null;
  if (existsSync(full) && statSync(full).isFile()) return full;
  if (existsSync(full + '.html') && statSync(full + '.html').isFile()) return full + '.html';
  const idx = join(full, 'index.html');
  if (existsSync(idx) && statSync(idx).isFile()) return idx;
  return null;
}

function serveStatic(req, res, urlPath) {
  const file = safeStaticPath(urlPath);
  if (!file) {
    const notFound = safeStaticPath('/404.html');
    if (notFound) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      createReadStream(notFound).pipe(res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

async function handleApi(req, res, path) {
  if (!cors(req, res)) return json(res, 403, { error: 'origin not allowed' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const ip = clientIp(req);

  if (req.method === 'GET' && path === '/health') {
    return json(res, 200, { ok: true, service: 'hltb-social' });
  }

  const m = path.match(/^\/v1\/entry\/([^/]+)(?:\/(like|repost))?$/);
  if (!m) return false;
  const entryKey = decodeURIComponent(m[1]);
  const action = m[2] || null;
  if (!isKey(entryKey)) return json(res, 400, { error: 'bad entry key', code: 'bad_key' });
  const device = deviceHash(req);

  if (req.method === 'GET' && !action) {
    const readGate = hit(`read:${ip}`, 300, 60_000);
    if (!readGate.allowed) {
      return json(res, 429, { error: 'too many requests', code: 'rate_limited' }, rateHeaders(readGate));
    }
    return json(res, 200, stats(entryKey, device), rateHeaders(readGate));
  }

  const ipGate = hit(`ip:${ip}`, LIMITS.ipMin.max, LIMITS.ipMin.windowMs);
  if (!ipGate.allowed) {
    return json(res, 429, { error: 'too many requests', code: 'rate_limited' }, rateHeaders(ipGate));
  }

  if (req.method === 'POST' && action === 'like') {
    const gate = hit(`like:${ip}`, LIMITS.likeHour.max, LIMITS.likeHour.windowMs);
    if (!gate.allowed) return json(res, 429, { error: 'like rate limit', code: 'rate_limited' }, rateHeaders(gate));
    const existing = db.prepare('SELECT 1 AS x FROM likes WHERE entry_key = ? AND device_hash = ?').get(entryKey, device);
    if (existing) {
      db.prepare('DELETE FROM likes WHERE entry_key = ? AND device_hash = ?').run(entryKey, device);
    } else {
      db.prepare('INSERT INTO likes (entry_key, device_hash, created_at) VALUES (?, ?, ?)').run(entryKey, device, Date.now());
    }
    return json(res, 200, stats(entryKey, device), rateHeaders(gate));
  }

  if (req.method === 'POST' && action === 'repost') {
    const hour = hit(`repost:${ip}`, LIMITS.repostHour.max, LIMITS.repostHour.windowMs);
    if (!hour.allowed) return json(res, 429, { error: 'repost rate limit', code: 'rate_limited' }, rateHeaders(hour));
    const minute = hit(`repost-min:${ip}`, LIMITS.repostMin.max, LIMITS.repostMin.windowMs);
    if (!minute.allowed) return json(res, 429, { error: 'repost rate limit', code: 'rate_limited' }, rateHeaders(minute));
    const body = await readBody(req);
    const id = randomUUID();
    const title = String(body.title || '').slice(0, 200);
    const pageUrl = String(body.url || '').slice(0, 500);
    db.prepare('INSERT INTO reposts (id, entry_key, device_hash, title, url, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, entryKey, device, title || null, pageUrl || null, Date.now());
    return json(res, 201, { id, ...stats(entryKey, device) }, rateHeaders(minute));
  }

  return json(res, 405, { error: 'method not allowed' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' || path.startsWith('/v1/')) {
      const handled = await handleApi(req, res, path === '/' ? '/health' : path);
      if (handled === false) return json(res, 404, { error: 'not found' });
      return;
    }

    if (ROOT && (req.method === 'GET' || req.method === 'HEAD')) {
      return serveStatic(req, res, url.pathname);
    }

    if (!cors(req, res)) return json(res, 403, { error: 'origin not allowed' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (path === '/' || path === '/health') return json(res, 200, { ok: true, service: 'hltb-social' });
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    const code = e.status || 500;
    json(res, code, { error: e.message || 'error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.error(`hltb-social on http://127.0.0.1:${PORT} db=${DB_PATH}${ROOT ? ` static=${ROOT}` : ''}`);
});
