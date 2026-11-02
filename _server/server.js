/**
 * zju大英造梦室 · 极简后端
 * ---------------------------------------------------------------
 * 零依赖：只用 Node 内置模块。数据落在一个 JSON 文件里，适合一个班级/一门课的规模。
 *
 * 启动：
 *     node _server/server.js            # 默认 http://127.0.0.1:8787
 *     PORT=9000 node _server/server.js
 *
 * 它同时做两件事：
 *   1) 把上一层的 index.html 当静态页发出去（只放行白名单后缀，server.js 和 data/ 不对外）
 *   2) 提供 /api/* 接口：注册、鉴权、单词本读写
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ------------------------------ 存储 ------------------------------ */
let DB = { accounts: {}, books: {} };

function loadDb(){
  try {
    DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    DB.accounts = DB.accounts || {};
    DB.books = DB.books || {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[db] 读取失败，按空库启动：', e.message);
    DB = { accounts: {}, books: {} };
  }
}

let writing = false, dirty = false;
function saveDb(){
  if (writing) { dirty = true; return; }
  writing = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(DB));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('[db] 写入失败：', e.message);
  } finally {
    writing = false;
    if (dirty) { dirty = false; saveDb(); }
  }
}

/* ------------------------------ 工具 ------------------------------ */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newId(){
  for (;;) {
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
    const id = 'ZJU-' + s;
    if (!DB.accounts[id]) return id;
  }
}
const newToken = () => crypto.randomBytes(24).toString('hex');

/** 昵称归一化：去首尾空白、压缩连续空格；比较时大小写不敏感 */
const cleanNick = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const nickKey = s => cleanNick(s).toLowerCase();

function byNick(key){
  for (const id of Object.keys(DB.accounts)) {
    if (DB.accounts[id].key === key) return DB.accounts[id];
  }
  return null;
}
function byToken(tok){
  if (!tok) return null;
  for (const id of Object.keys(DB.accounts)) {
    if (DB.accounts[id].token === tok) return DB.accounts[id];
  }
  return null;
}

/* --------------------------- 限流（按 IP） --------------------------- */
const hits = new Map();
const claims = new Map();          /* 认领接口单独限流：防止有人瞎猜 ID */
function rateLimited(ip){
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 90;            // 每分钟 90 次，够一个班级用
}

function claimLimited(ip){
  const now = Date.now();
  const arr = (claims.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  claims.set(ip, arr);
  if (claims.size > 5000) claims.clear();
  return arr.length > 12;            // 认领：每分钟最多 12 次
}

/* ------------------------------ HTTP ------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};
const ALLOW = new Set(Object.keys(MIME));

function send(res, code, obj, extra){
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  }, extra || {}));
  res.end(body);
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

const tokenOf = req => {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+([a-f0-9]{16,})$/.exec(h);
  return m ? m[1] : '';
};

function sanitizeBook(items){
  if (!Array.isArray(items)) return [];
  return items.slice(0, 600).map(x => ({
    w: String(x && x.w || '').slice(0, 80),
    i: String(x && x.i || '').slice(0, 80),
    p: String(x && x.p || '').slice(0, 40),
    c: String(x && x.c || '').slice(0, 160),
    u: String(x && x.u || '').slice(0, 4),
    b: (x && x.b === 'I') ? 'I' : 'II',
  })).filter(x => x.w);
}

/* ------------------------------ 路由 ------------------------------ */
async function handleApi(req, res, url){
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/ping') {
    return send(res, 200, { ok: true, service: 'zju-ce-room', accounts: Object.keys(DB.accounts).length });
  }

  if (req.method === 'POST' && p === '/api/register') {
    const body = await readBody(req);
    const nick = cleanNick(body.nick);
    if (!nick) return send(res, 400, { error: 'nick_empty', message: '昵称不能为空' });
    if ([...nick].length > 16) return send(res, 400, { error: 'nick_long', message: '昵称最多 16 个字' });
    if (byNick(nickKey(nick))) return send(res, 409, { error: 'nick_taken', message: '该昵称已存在，请更换昵称' });

    const id = newId();
    const acc = { id, nick, key: nickKey(nick), token: newToken(), t: Date.now() };
    DB.accounts[id] = acc;
    DB.books[id] = [];
    saveDb();
    return send(res, 201, { id: acc.id, nick: acc.nick, token: acc.token, t: acc.t });
  }

  if (req.method === 'POST' && p === '/api/login') {
    const body = await readBody(req);
    const id = String(body.id || '').trim();
    const token = String(body.token || '').trim();
    const acc = DB.accounts[id];
    if (!acc || acc.token !== token) return send(res, 401, { error: 'bad_credentials' });
    return send(res, 200, { id: acc.id, nick: acc.nick, token: acc.token, t: acc.t });
  }

  if (req.method === 'POST' && p === '/api/claim') {
    const body = await readBody(req);
    let id = String(body.id || '').trim().toUpperCase().replace(/\s+/g, '');
    if (id && !id.startsWith('ZJU-')) id = 'ZJU-' + id;
    if (!/^ZJU-[A-Z0-9]{5}$/.test(id)) {
      return send(res, 400, { error: 'bad_id', message: 'ID 格式不对，应该形如 ZJU-ABC12' });
    }
    const target = DB.accounts[id];
    if (!target) {
      return send(res, 404, { error: 'no_such_id', message: '没有这个 ID' });
    }
    /* 认领不换 token：同一个账号可以在手机和电脑上同时用 */
    target.claimed = (target.claimed || 0) + 1;
    target.lastClaim = Date.now();
    saveDb();
    return send(res, 200, {
      id: target.id, nick: target.nick, token: target.token, t: target.t,
      claimed: target.claimed,
    });
  }

  const acc = byToken(tokenOf(req));
  if (!acc) return send(res, 401, { error: 'unauthorized' });

  if (req.method === 'GET' && p === '/api/me') {
    return send(res, 200, { id: acc.id, nick: acc.nick, t: acc.t, book: (DB.books[acc.id] || []).length });
  }

  if (req.method === 'GET' && p === '/api/book') {
    return send(res, 200, { items: DB.books[acc.id] || [] });
  }

  if (req.method === 'PUT' && p === '/api/book') {
    const body = await readBody(req);
    DB.books[acc.id] = sanitizeBook(body.items);
    saveDb();
    return send(res, 200, { ok: true, count: DB.books[acc.id].length });
  }

  return send(res, 404, { error: 'not_found' });
}

function serveStatic(req, res, url){
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  /* 只放行站点根目录里的静态文件：下划线/点开头的目录（_server、_site、_生成脚本…）一律不对外 */
  const segs = rel.split('/').filter(Boolean);
  if (segs.some(s => s.startsWith('_') || s.startsWith('.'))) {
    res.writeHead(404); return res.end('not found');
  }

  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('forbidden'); }

  const ext = path.extname(file).toLowerCase();
  if (!ALLOW.has(ext)) { res.writeHead(404); return res.end('not found'); }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const ip = req.socket.remoteAddress || '?';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (url.pathname.startsWith('/api/')) {
    if (rateLimited(ip)) return send(res, 429, { error: 'too_many_requests' });
    if (url.pathname === '/api/claim' && claimLimited(ip)) {
      return send(res, 429, { error: 'too_many_claims', message: '试得太频繁了，歇一分钟再来' });
    }
    try {
      await handleApi(req, res, url);
    } catch (e) {
      console.error('[api]', e.message);
      if (!res.headersSent) send(res, 400, { error: 'bad_request', message: e.message });
    }
    return;
  }

  serveStatic(req, res, url);
});

function lanAddresses(){
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

loadDb();
server.listen(PORT, HOST, () => {
  const n = Object.keys(DB.accounts).length;
  const lans = lanAddresses();
  console.log('');
  console.log('  zju大英造梦室 · 后端已启动');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  本机      http://127.0.0.1:${PORT}/`);
  if (lans.length) {
    console.log('  校园网    （同一 WiFi / 校园网的同学用这些）');
    for (const l of lans) console.log(`            http://${l.address}:${PORT}/    [${l.name}]`);
  } else {
    console.log('  校园网    没检测到局域网地址，先连上 WiFi');
  }
  console.log(`  公网      另开一个窗口运行：cloudflared tunnel --url http://127.0.0.1:${PORT}`);
  console.log(`            或直接双击「启动公网隧道.bat」`);
  console.log('  ─────────────────────────────────────────────');
  console.log(`  数据      ${DB_FILE}（已注册 ${n} 个账号）`);
  console.log('');
});
