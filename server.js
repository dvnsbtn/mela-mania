// Mini Games Showdown — zero-dependency Node server.
// Run:  node server.js     (needs Node 18+)
// Env:  PORT (default 3000), ADMIN_PASSWORD (default "host123")

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GAMES, PARSERS, defaultContent } = require('./lib/content');
const { ENGINES } = require('./lib/games');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'host123';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const PUBLIC = path.join(__dirname, 'public');

const DEFAULT_SETTINGS = {
  eventName: 'Mini Games Showdown',
  joinUrl: '',         // optional override for the link/QR shown on the join screen
  dnfPenalty: 60,      // added on top of the time limit if a team doesn't finish
  hangmanMiss: 30,     // running out of lives on a word
  strandsHint: 30,
  krillionPrompt: 30,  // seconds per prompt
  krillionSkip: 10,
  krillionDeep: 5,     // time credit for a rare answer
  krillionAbyss: 10,   // time credit for a very rare answer
  rapidSkip: 15,
  limits: Object.fromEntries(GAMES.map(g => [g.id, g.defaultLimit])),
};

const newCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(5), b => alphabet[b % alphabet.length]).join('');
};
const id = (n = 12) => crypto.randomBytes(n).toString('base64url');

function freshState() {
  const { content, text } = defaultContent();
  return {
    session: { code: newCode(), createdAt: Date.now() },
    teams: {},
    content, text,
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    rounds: Object.fromEntries(GAMES.map(g => [g.id, { status: 'idle' }])),
    progress: Object.fromEntries(GAMES.map(g => [g.id, {}])),
    current: null,
    adminKeys: [],
  };
}

let state;
try {
  state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings, limits: { ...DEFAULT_SETTINGS.limits, ...(state.settings || {}).limits } };
  console.log('Restored saved game state.');
} catch { state = freshState(); }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFile(DATA_FILE, JSON.stringify(state), () => {});
  }, 400);
}

// ---------- scoring ----------
const round1 = x => Math.round(x * 10) / 10;

function teamRoundResult(game, teamId) {
  const r = state.rounds[game];
  if (r.status === 'idle') return null;
  const p = state.progress[game][teamId];
  const dnf = r.limit + state.settings.dnfPenalty;
  if (p && p.status === 'done') {
    const raw = (p.finishedAt - r.startedAt) / 1000;
    const time = Math.max(0, round1(raw + (p.penalty || 0) - (p.bonus || 0)));
    return { status: 'done', time, raw: round1(raw), penalty: p.penalty || 0, bonus: p.bonus || 0 };
  }
  if (p && p.status === 'failed') return { status: 'failed', time: dnf, penalty: p.penalty || 0, bonus: p.bonus || 0 };
  if (r.status === 'ended') return { status: p ? 'dnf' : 'absent', time: dnf };
  return { status: p ? 'playing' : 'waiting', time: null };
}

function leaderboard() {
  const rows = Object.values(state.teams).map(t => {
    const per = {};
    let total = 0, played = 0, live = false;
    for (const g of GAMES) {
      const res = teamRoundResult(g.id, t.id);
      per[g.id] = res;
      if (res && res.time != null) { total += res.time; played++; }
      else if (res) live = true;
    }
    return { id: t.id, name: t.name, total: round1(total), played, live, per };
  });
  rows.sort((a, b) => b.played - a.played || a.total - b.total || a.name.localeCompare(b.name));
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    const key = r.played + ':' + r.total;
    if (key !== prev) rank = i + 1;
    r.rank = rank; prev = key;
  });
  return rows;
}

// ---------- realtime (Server-Sent Events) ----------
const adminClients = new Set();
const teamClients = new Map(); // teamId -> Set(res)

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\n\n');
}
const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const LAN = () => Object.values(require('os').networkInterfaces()).flat()
  .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:${PORT}`);

function adminView() {
  const cur = state.current;
  const live = cur ? Object.values(state.teams).map(t => {
    const p = state.progress[cur][t.id];
    const res = teamRoundResult(cur, t.id);
    return {
      id: t.id, name: t.name,
      status: res ? res.status : 'waiting',
      time: res ? res.time : null,
      detail: p ? ENGINES[cur].progress(state.content[cur], p) : 'Not started',
    };
  }) : [];
  return {
    now: Date.now(),
    session: state.session,
    settings: state.settings,
    lan: LAN(),
    games: GAMES,
    teams: Object.values(state.teams).map(t => ({ id: t.id, name: t.name, joinedAt: t.joinedAt, online: (teamClients.get(t.id) || new Set()).size > 0 })),
    rounds: state.rounds,
    current: cur,
    live,
    leaderboard: leaderboard(),
  };
}

function teamView(t) {
  const cur = state.current;
  const base = {
    now: Date.now(),
    team: { id: t.id, name: t.name },
    eventName: state.settings.eventName,
    code: state.session.code,
    history: GAMES.map(g => ({ id: g.id, title: g.title, result: teamRoundResult(g.id, t.id) })).filter(h => h.result && h.result.time != null),
  };
  if (!cur) return { ...base, screen: 'lobby' };
  const r = state.rounds[cur];
  const meta = GAMES.find(g => g.id === cur);
  const p = state.progress[cur][t.id];
  const round = { game: cur, title: meta.title, blurb: meta.blurb, startedAt: r.startedAt, endsAt: r.endsAt, limit: r.limit, status: r.status };
  const result = teamRoundResult(cur, t.id);
  if (r.status === 'ended' || (p && p.status)) {
    return {
      ...base, screen: 'finished', round, result,
      game: p ? ENGINES[cur].view(state.content[cur], p, state.settings) : null,
    };
  }
  if (!p) return { ...base, screen: 'round', round, game: null, needsStart: true };
  return { ...base, screen: 'round', round, game: ENGINES[cur].view(state.content[cur], p, state.settings) };
}

let pushTimer = null;
function changed() {
  save();
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    const av = adminView();
    for (const res of adminClients) send(res, 'state', av);
    for (const [tid, set] of teamClients) {
      const t = state.teams[tid];
      if (!t) continue;
      const v = teamView(t);
      for (const res of set) send(res, 'state', v);
    }
  }, 40);
}

// make sure a team has progress for the live round (lazy start)
function ensureProgress(game, teamId, now) {
  const prog = state.progress[game];
  if (!prog[teamId]) prog[teamId] = { ...ENGINES[game].init(state.content[game], now), status: null };
  return prog[teamId];
}

function endRound(game) {
  const r = state.rounds[game];
  if (r.status !== 'live') return;
  r.status = 'ended';
  r.endedAt = Date.now();
  if (state.current === game) state.current = game; // keep it on screen until host moves on
  changed();
}

// server tick: timeouts and auto-end
setInterval(() => {
  const g = state.current;
  if (!g) return;
  const r = state.rounds[g];
  if (r.status !== 'live') return;
  const now = Date.now();
  let dirty = false;
  if (ENGINES[g].tick) {
    for (const p of Object.values(state.progress[g])) {
      if (ENGINES[g].tick(state.content[g], p, state.settings, now)) {
        if (p.status && !p.finishedAt) p.finishedAt = now;
        dirty = true;
      }
    }
  }
  if (now >= r.endsAt) { endRound(g); return; }
  const teamIds = Object.keys(state.teams);
  if (teamIds.length && teamIds.every(tid => state.progress[g][tid] && state.progress[g][tid].status)) { endRound(g); return; }
  if (dirty) changed();
}, 250);

// heartbeats keep proxies from closing idle streams
setInterval(() => {
  for (const res of adminClients) res.write(': ping\n\n');
  for (const set of teamClients.values()) for (const res of set) res.write(': ping\n\n');
}, 20000);

// ---------- http ----------
function body(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const teamByToken = tok => Object.values(state.teams).find(t => t.token === tok);
const isAdmin = key => key && state.adminKeys.includes(key);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? '/index.html' : pathname === '/admin' || pathname === '/admin/' ? '/admin.html' : pathname;
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { // unknown path -> player app (lets /ABCDE style links work)
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => {
        res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(d2);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const adminActions = {
  'new-code': () => { state.session.code = newCode(); },
  'remove-team': ({ teamId }) => {
    const t = state.teams[teamId];
    if (!t) return;
    delete state.teams[teamId];
    for (const g of GAMES) delete state.progress[g.id][teamId];
    for (const res of teamClients.get(teamId) || []) { send(res, 'kicked', {}); res.end(); }
    teamClients.delete(teamId);
  },
  'start-round': ({ game, limit }) => {
    if (!ENGINES[game]) throw new Error('Unknown game');
    if (state.current && state.rounds[state.current].status === 'live') throw new Error('Another round is live — end it first.');
    const secs = Math.max(30, Math.min(3600, Number(limit) || state.settings.limits[game]));
    const now = Date.now();
    state.settings.limits[game] = secs;
    state.rounds[game] = { status: 'live', startedAt: now, endsAt: now + secs * 1000, limit: secs };
    state.progress[game] = {};
    state.current = game;
  },
  'end-round': ({ game }) => endRound(game || state.current),
  'add-time': ({ seconds }) => {
    const r = state.current && state.rounds[state.current];
    if (!r || r.status !== 'live') throw new Error('No live round');
    r.endsAt += (Number(seconds) || 60) * 1000;
    r.limit += Number(seconds) || 60;
  },
  'reset-round': ({ game }) => {
    state.rounds[game] = { status: 'idle' };
    state.progress[game] = {};
    if (state.current === game) state.current = null;
  },
  'close-round': () => { // back to lobby screen for players
    if (state.current && state.rounds[state.current].status === 'live') throw new Error('End the round first.');
    state.current = null;
  },
  settings: ({ settings }) => {
    const s = state.settings;
    if (typeof settings.eventName === 'string') s.eventName = settings.eventName.slice(0, 60) || s.eventName;
    if (typeof settings.joinUrl === 'string') s.joinUrl = settings.joinUrl.trim().replace(/\/+$/, '').slice(0, 200);
    for (const k of ['dnfPenalty', 'hangmanMiss', 'strandsHint', 'krillionPrompt', 'krillionSkip', 'krillionDeep', 'krillionAbyss', 'rapidSkip']) {
      if (settings[k] != null && !isNaN(settings[k])) s[k] = Math.max(0, Math.min(3600, Number(settings[k])));
    }
    s.krillionPrompt = Math.max(5, s.krillionPrompt);
    if (settings.limits) for (const g of GAMES) if (settings.limits[g.id]) s.limits[g.id] = Math.max(30, Math.min(3600, Number(settings.limits[g.id])));
  },
  content: ({ game, text }) => {
    if (!PARSERS[game]) throw new Error('Unknown game');
    if (state.rounds[game].status === 'live') throw new Error('This round is live — end it before editing.');
    state.content[game] = PARSERS[game](String(text || ''));
    state.text[game] = String(text);
  },
  'reset-all': () => {
    const keys = state.adminKeys;
    for (const set of teamClients.values()) for (const res of set) { send(res, 'kicked', {}); res.end(); }
    teamClients.clear();
    const keepContent = { content: state.content, text: state.text, settings: state.settings };
    state = { ...freshState(), ...keepContent, adminKeys: keys };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/events/admin') {
      if (!isAdmin(url.searchParams.get('key'))) return json(res, 401, { error: 'auth' });
      sse(res); adminClients.add(res);
      send(res, 'state', adminView());
      req.on('close', () => adminClients.delete(res));
      return;
    }
    if (p === '/events/team') {
      const t = teamByToken(url.searchParams.get('token'));
      sse(res);
      if (!t) { send(res, 'kicked', {}); return res.end(); }
      if (!teamClients.has(t.id)) teamClients.set(t.id, new Set());
      teamClients.get(t.id).add(res);
      send(res, 'state', teamView(t));
      changed(); // admin sees team online
      req.on('close', () => { const s = teamClients.get(t.id); if (s) { s.delete(res); if (!s.size) teamClients.delete(t.id); } changed(); });
      return;
    }
    if (p === '/api/ping') return json(res, 200, { ok: true }); // keeps free hosts awake
    if (req.method === 'POST' && p === '/api/join') {
      const b = await body(req);
      const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (code !== state.session.code) return json(res, 400, { error: "That code doesn't match the session on screen." });
      if (name.length < 2) return json(res, 400, { error: 'Pick a team name (2+ characters).' });
      if (Object.values(state.teams).some(t => t.name.toLowerCase() === name.toLowerCase())) return json(res, 400, { error: 'That team name is taken — try another.' });
      if (Object.keys(state.teams).length >= 200) return json(res, 400, { error: 'This session is full.' });
      const t = { id: id(6), token: id(18), name, joinedAt: Date.now() };
      state.teams[t.id] = t;
      changed();
      return json(res, 200, { token: t.token });
    }
    if (req.method === 'POST' && p === '/api/action') {
      const b = await body(req);
      const t = teamByToken(b.token);
      if (!t) return json(res, 401, { error: 'kicked' });
      const g = state.current;
      if (!g || g !== b.game || state.rounds[g].status !== 'live') return json(res, 200, { ok: false, msg: 'This round is closed' });
      const now = Date.now();
      const prog = ensureProgress(g, t.id, now);
      if (b.action && b.action.type === 'start') { changed(); return json(res, 200, { ok: true }); }
      if (prog.status) return json(res, 200, { ok: false, msg: 'Already finished' });
      if (ENGINES[g].tick) ENGINES[g].tick(state.content[g], prog, state.settings, now);
      const out = prog.status ? { ok: false, msg: 'Time ran out on that one' } : ENGINES[g].act(state.content[g], prog, b.action || {}, state.settings, now);
      if (prog.status && !prog.finishedAt) prog.finishedAt = now;
      changed();
      return json(res, 200, out);
    }
    if (req.method === 'POST' && p === '/api/admin/login') {
      const b = await body(req);
      if (String(b.password || '') !== ADMIN_PASSWORD) return json(res, 401, { error: 'Wrong password' });
      const key = id(24);
      state.adminKeys = [...(state.adminKeys || []).slice(-9), key];
      save();
      return json(res, 200, { key });
    }
    if (p.startsWith('/api/admin/')) {
      const b = req.method === 'POST' ? await body(req) : {};
      const key = b.key || url.searchParams.get('key');
      if (!isAdmin(key)) return json(res, 401, { error: 'auth' });
      const action = p.slice('/api/admin/'.length);
      if (action === 'content' && req.method === 'GET') {
        return json(res, 200, { text: state.text, content: state.content });
      }
      if (action === 'preview-strands') {
        try { return json(res, 200, { ok: true, puzzle: PARSERS.strands(String(b.text || '')) }); }
        catch (e) { return json(res, 200, { ok: false, error: e.message }); }
      }
      if (!adminActions[action]) return json(res, 404, { error: 'Unknown action' });
      try { adminActions[action](b); } catch (e) { return json(res, 200, { ok: false, error: e.message }); }
      changed();
      return json(res, 200, { ok: true, content: action === 'content' ? state.content[b.game] : undefined });
    }
    if (req.method === 'GET') return serveStatic(req, res, p);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\n  Mini Games Showdown is running\n`);
  console.log(`  Admin:   http://localhost:${PORT}/admin   (password: ${ADMIN_PASSWORD === 'host123' ? 'host123 — set ADMIN_PASSWORD to change' : 'from ADMIN_PASSWORD'})`);
  console.log(`  Players: http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`           http://${ip}:${PORT}   (same Wi-Fi)`));
  console.log(`  Session code: ${state.session.code}\n`);
});
