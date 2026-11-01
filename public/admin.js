(() => {
  const $app = document.getElementById('app');
  const KEY = 'mg_admin_key';
  let key = null; try { key = localStorage.getItem(KEY); } catch {}
  let S = null, offset = 0, es = null;
  let view = 'join';
  let editorGame = 'hangman', contentCache = null;
  const limitDraft = {};
  let prevLive = {};
  const now = () => Date.now() + offset;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = secs => {
    if (secs == null) return '—';
    const neg = secs < 0; secs = Math.abs(secs);
    const m = Math.floor(secs / 60), s = secs - m * 60;
    return (neg ? '−' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  };
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n) + 's';
  const clock = secs => { secs = Math.max(0, Math.ceil(secs)); return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); };

  const ICON = {
    hangman: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 21h9M7 21V3h9v3"/><circle cx="16" cy="9" r="2.5"/><path d="M16 11.5V16m0-3l-2.5 2.5M16 13l2.5 2.5M16 16l-2 3m2-3l2 3"/></svg>',
    connections: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2" opacity=".55"/><rect x="3" y="13" width="8" height="8" rx="2" opacity=".55"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
    wordle: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="8" width="6" height="8" rx="1.5"/><rect x="9" y="8" width="6" height="8" rx="1.5" opacity=".55"/><rect x="16" y="8" width="6" height="8" rx="1.5" opacity=".3"/></svg>',
    krillion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity=".6"/><path d="M3 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity=".3"/></svg>',
    strands: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l5 4-2 6 7 4 4-6"/><circle cx="5" cy="5" r="2" fill="currentColor"/><circle cx="19" cy="13" r="2" fill="currentColor"/></svg>',
    rapid: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
    melale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/></svg>',
  };
  const NAVICON = {
    join: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M20 20h-3"/></svg>',
    rounds: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
    live: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
    board: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 6h3v2a3 3 0 01-3 3M7 6H4v2a3 3 0 003 3"/></svg>',
    puzzles: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
    settings: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  };
  const gcolor = id => `var(--${id})`;

  let toastT;
  const toast = (m, bad) => { const t = document.getElementById('toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 2200); };

  async function api(action, payload = {}) {
    const r = await fetch('/api/admin/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...payload }) });
    if (r.status === 401) { logout(); return {}; }
    const j = await r.json();
    if (j.ok === false && j.error) toast(j.error, true);
    return j;
  }

  // ---------------- auth ----------------
  function renderLogin(err) {
    $app.innerHTML = `<div class="login"><form id="lf">
      <div class="brand" style="padding:0"><div class="logo"><i>M</i><i>E</i><i>L</i><i>A</i></div>Host Console</div>
      <h1>Ready to run the show?</h1>
      <input class="field" type="password" id="pw" placeholder="Host password" autofocus>
      <button class="btn big" style="justify-content:center">Enter console</button>
      <div class="err">${esc(err || '')}</div></form></div>`;
    document.getElementById('lf').onsubmit = async e => {
      e.preventDefault();
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value }) });
      const j = await r.json();
      if (!r.ok) return renderLogin(j.error || 'Wrong password');
      key = j.key; try { localStorage.setItem(KEY, key); } catch {}
      connect();
    };
  }
  function logout() { if (es) es.close(); key = null; try { localStorage.removeItem(KEY); } catch {} renderLogin(); }

  function connect() {
    if (es) es.close();
    es = new EventSource('/events/admin?key=' + encodeURIComponent(key));
    let got = false;
    es.addEventListener('state', e => {
      got = true;
      const prev = S;
      S = JSON.parse(e.data); offset = S.now - Date.now();
      if (!prev) buildShell();
      if (prev && S.current && S.rounds[S.current].status === 'live' && (!prev.current || prev.rounds[S.current].status !== 'live')) view = 'live';
      render();
    });
    es.onerror = () => { if (!got) { es.close(); fetch('/events/admin?key=' + encodeURIComponent(key)).then(r => { if (r.status === 401) logout(); }); } };
  }

  // ---------------- shell ----------------
  const NAV = [['join', 'Join screen', 'J'], ['rounds', 'Rounds', 'R'], ['live', 'Live round', 'L'], ['board', 'Leaderboard', 'B'], ['puzzles', 'Puzzles', ''], ['settings', 'Settings', '']];
  function buildShell() {
    $app.innerHTML = `
      <div class="shell">
        <aside class="side">
          <div class="brand"><div class="logo"><i>M</i><i>E</i><i>L</i><i>A</i></div><span id="ev"></span></div>
          <nav class="nav" id="nav">${NAV.map(([id, label, k]) => `<button data-v="${id}">${NAVICON[id]}${label}${id === 'live' ? '<span class="live-dot" id="ldot" hidden></span>' : k ? `<kbd>${k}</kbd>` : ''}</button>`).join('')}</nav>
          <div class="side-code"><small>Session code</small><b id="sc"></b>
            <div class="row"><span id="tc"></span><button class="btn ghost" style="height:30px;padding:0 10px;font-size:12px" id="newcode">New code</button></div></div>
          <button class="present-btn" id="present"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>Present mode <span style="opacity:.5;font-family:var(--mono);font-size:12px">P</span></button>
        </aside>
        <main class="main"><div class="stage" id="stage"></div></main>
      </div>
      <button class="exit-present" id="exitp">Exit present mode (Esc)</button>`;
    document.getElementById('nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.v); };
    document.getElementById('present').onclick = () => document.body.classList.add('present');
    document.getElementById('exitp').onclick = () => document.body.classList.remove('present');
    document.getElementById('newcode').onclick = async () => { if (confirm('Generate a new session code? Teams already in stay in.')) await api('new-code'); };
  }

  function go(v) { view = v; mountedView = null; render(); document.querySelector('.main').scrollTop = 0; }

  document.addEventListener('keydown', e => {
    if (!S || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'p') document.body.classList.toggle('present');
    else if (k === 'escape') document.body.classList.remove('present');
    else if (k === 'j') go('join'); else if (k === 'r') go('rounds'); else if (k === 'l') go('live'); else if (k === 'b') go('board');
  });

  let mountedView = null;
  function render() {
    if (!S) return;
    document.getElementById('ev').textContent = S.settings.eventName;
    document.getElementById('sc').textContent = S.session.code;
    document.getElementById('tc').textContent = `${S.teams.length} team${S.teams.length === 1 ? '' : 's'}`;
    const isLive = S.current && S.rounds[S.current].status === 'live';
    document.getElementById('ldot').hidden = !isLive;
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    document.title = `${S.settings.eventName} · Host`;
    const stage = document.getElementById('stage');
    ({ join: renderJoin, rounds: renderRounds, live: renderLive, board: renderBoard, puzzles: renderPuzzles, settings: renderSettings })[view](stage);
    mountedView = view;
  }

  // ---------------- join screen ----------------
  const qrCache = {};
  function joinBase() {
    if (S.settings.joinUrl) return S.settings.joinUrl;
    const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
    if (local && S.lan.length) return S.lan[0];
    return location.origin;
  }
  function qrFor(url) {
    if (qrCache[url]) return qrCache[url];
    const d = document.createElement('div');
    try {
      const q = qrcode(0, 'M'); q.addData(url); q.make();
      d.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0 });
      const svg = d.firstElementChild; svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = svg.style.height = '212px';
    } catch { d.textContent = url; }
    return (qrCache[url] = d);
  }
  function renderJoin(stage) {
    const base = joinBase();
    const display = base.replace(/^https?:\/\//, '');
    const link = base + '/?code=' + S.session.code;
    const sig = [S.session.code, base, S.settings.eventName, S.settings.tagline].join('|');
    if (mountedView !== 'join' || stage.dataset.sig !== sig) {
      stage.dataset.sig = sig;
      stage.innerHTML = `
        <div class="head"><div><div class="eyebrow">${esc(S.settings.tagline || 'Join the game')}</div><h1 class="h1">${esc(S.settings.eventName)}</h1></div>
          <div class="btns ctl"><button class="btn ghost" id="copy">Copy join link</button><button class="btn" id="tor">Go to rounds →</button></div></div>
        <div class="join-grid">
          <div class="join-card">
            <div><div class="eyebrow">On your phone, open</div><div class="join-url">${esc(display)}</div></div>
            <div><div class="eyebrow" style="margin-bottom:12px">and enter code</div><div class="code-tiles">${S.session.code.split('').map(c => `<span>${c}</span>`).join('')}</div></div>
            <div class="qr-row"><div class="qr" id="qr"></div><p>Or scan to jump straight in.<br>One phone per team — pick a name that'll look good on the leaderboard.</p></div>
          </div>
          <div class="panel" style="display:flex;flex-direction:column">
            <div class="teams-head"><div class="eyebrow">Teams in the room</div><div class="n" id="tn"></div></div>
            <div class="team-cloud" id="cloud"></div>
          </div>
        </div>`;
      const q = qrFor(link); document.getElementById('qr').appendChild(q);
      document.getElementById('copy').onclick = () => { navigator.clipboard.writeText(link).then(() => toast('Join link copied')); };
      document.getElementById('tor').onclick = () => go('rounds');
      document.getElementById('cloud').onclick = async e => {
        const x = e.target.closest('.x'); if (!x) return;
        const t = S.teams.find(t => t.id === x.dataset.id);
        if (t && confirm(`Remove "${t.name}" from the session?`)) { await api('remove-team', { teamId: t.id }); toast(`Removed ${t.name}`); }
      };
    }
    document.getElementById('tn').innerHTML = `${S.teams.length}<small>team${S.teams.length === 1 ? '' : 's'}</small>`;
    const cloud = document.getElementById('cloud');
    const have = new Set([...cloud.children].map(c => c.dataset.id));
    const want = new Set(S.teams.map(t => t.id));
    [...cloud.children].forEach(c => { if (!want.has(c.dataset.id)) c.remove(); });
    S.teams.forEach(t => {
      let el = cloud.querySelector(`[data-id="${t.id}"]`);
      if (!el) {
        el = document.createElement('div'); el.className = 'team'; el.dataset.id = t.id;
        el.innerHTML = `<span class="on"></span><span class="tname"></span><button class="x" data-id="${t.id}" title="Remove team"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
        el.querySelector('.tname').textContent = t.name;
        cloud.appendChild(el);
      }
      el.querySelector('.on').classList.toggle('off', !t.online);
      el.title = t.online ? 'Connected' : 'Offline';
    });
    if (!S.teams.length && !cloud.querySelector('.empty')) cloud.innerHTML = '<div class="empty" style="width:100%">Teams will pop up here as they join.</div>';
    if (S.teams.length) cloud.querySelector('.empty')?.remove();
  }

  // ---------------- rounds ----------------
  function roundStats(id) {
    const r = S.rounds[id];
    if (r.status === 'idle') return 'Not played yet';
    if (id === 'rapid') { const best = S.leaderboard.slice().sort((a, b) => (a.per.rapid?.time ?? 0) - (b.per.rapid?.time ?? 0))[0]; return best ? `Best: ${esc(best.name)} ${signed(best.per.rapid.time)}` : 'Played'; }
    const fin = S.leaderboard.filter(t => t.per[id] && t.per[id].status === 'done');
    const best = fin.reduce((m, t) => Math.min(m, t.per[id].time), Infinity);
    return `${fin.length}/${S.teams.length} finished${fin.length ? ` · best ${fmt(best)}` : ''}`;
  }
  function renderRounds(stage) {
    if (mountedView === 'rounds' && stage.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const liveId = S.current && S.rounds[S.current].status === 'live' ? S.current : null;
    stage.innerHTML = `
      <div class="head"><div><div class="eyebrow">${S.games.length} mini games</div><h1 class="h1">Rounds</h1></div>
        <div class="btns ctl">${S.current && !liveId ? '<button class="btn ghost" id="lobby">Send players back to lobby</button>' : ''}</div></div>
      <div class="game-grid">${S.games.map(g => {
        const r = S.rounds[g.id];
        const lim = limitDraft[g.id] != null ? limitDraft[g.id] : (S.settings.limits[g.id] / 60);
        const chip = r.status === 'live' ? '<span class="chip live">Live</span>' : r.status === 'ended' ? '<span class="chip done">Played</span>' : '<span class="chip">Ready</span>';
        let btns = '';
        if (r.status === 'live') btns = `<button class="btn" data-a="view">View live</button>`;
        else if (r.status === 'ended') btns = `<button class="btn ghost ctl" data-a="reset">Replay</button><button class="btn ghost" data-a="results">Results</button>`;
        else btns = `<button class="btn go ctl" data-a="start" ${liveId ? 'disabled' : ''}>Start round</button>`;
        return `<div class="gcard ${r.status === 'live' ? 'is-live' : ''}" style="--g:${gcolor(g.id)}" data-g="${g.id}">
          <div class="t"><h3><span class="gicon">${ICON[g.id]}</span>${esc(g.title)}</h3>${chip}</div>
          <p>${esc(g.blurb)}</p>
          ${r.status === 'idle' && g.id === 'rapid' ? `<div class="stat">Host-paced · ${S.settings.rapidAnswer}s to answer after buzzing</div>` : r.status === 'idle' ? `<label class="limit ctl">Time limit <input type="number" min="0.5" max="60" step="0.5" value="${lim}" data-limit="${g.id}"> min</label>` : `<div class="stat">${roundStats(g.id)}</div>`}
          <div class="foot"><span class="stat">${r.status === 'idle' || g.id === 'rapid' ? '' : 'Limit ' + clock(r.limit)}</span><div class="btns">${btns}</div></div>
        </div>`;
      }).join('')}</div>`;
    stage.querySelectorAll('[data-limit]').forEach(i => i.oninput = () => { limitDraft[i.dataset.limit] = i.value; });
    stage.querySelector('#lobby')?.addEventListener('click', () => api('close-round'));
    stage.querySelector('.game-grid').onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const id = b.closest('.gcard').dataset.g, a = b.dataset.a;
      if (a === 'start') {
        if (!S.teams.length && !confirm('No teams have joined yet. Start anyway?')) return;
        const mins = Number(limitDraft[id] || S.settings.limits[id] / 60);
        const r = await api('start-round', { game: id, limit: Math.round(mins * 60) });
        if (r.ok) { delete limitDraft[id]; view = 'live'; mountedView = null; render(); }
      }
      if (a === 'view') go('live');
      if (a === 'results') { await api('close-round'); go('board'); }
      if (a === 'reset' && confirm('Clear this round\'s results so it can be played again?')) await api('reset-round', { game: id });
    };
  }

  // ---------------- live ----------------
  let liveRaf = null;
  function renderLive(stage) {
    const id = S.current;
    if (!id) {
      stage.innerHTML = `<div class="head"><div><div class="eyebrow">Live round</div><h1 class="h1">Nothing live right now</h1></div></div>
        <div class="empty">Start a round from the Rounds screen and it'll show up here with a big timer and every team's progress.<br><br><button class="btn ctl" id="tor">Go to rounds</button></div>`;
      stage.querySelector('#tor').onclick = () => go('rounds');
      return;
    }
    if (id === 'rapid') return renderBuzz(stage);
    const g = S.games.find(x => x.id === id), r = S.rounds[id];
    const live = r.status === 'live';
    const key = id + ':' + r.startedAt + ':' + r.status;
    if (mountedView !== 'live' || stage.dataset.key !== key) {
      stage.dataset.key = key;
      stage.style.setProperty('--g', gcolor(id));
      stage.innerHTML = `
        <div class="live-top">
          <div><div class="eyebrow" style="display:flex;gap:10px;align-items:center">${live ? '<span class="chip live">Live</span>' : '<span class="chip done">Round over</span>'} Round ${Object.values(S.rounds).filter(x => x.status !== 'idle').length} of ${S.games.length}</div>
            <div class="live-title" style="margin-top:12px"><span class="gicon" style="--g:${gcolor(id)}">${ICON[id]}</span><h1 class="h1" style="margin:0">${esc(g.title)}</h1></div></div>
          <div class="timer"><div class="eyebrow">${live ? 'Time left' : 'Final'}</div><div class="big" id="tbig">${live ? '' : 'Done'}</div></div>
        </div>
        <div class="tbar"><i id="tbar"></i></div>
        <div class="live-stats" id="lstats"></div>
        <div class="btns ctl" id="lctl"></div>
        <div class="live-list" id="llist"></div>`;
      const ctl = stage.querySelector('#lctl');
      ctl.innerHTML = live
        ? `<button class="btn ghost" data-a="add">+1 minute</button><button class="btn danger" data-a="end">End round now</button>`
        : `<button class="btn" data-a="board">Show leaderboard →</button><button class="btn ghost" data-a="lobby">Send players to lobby</button><button class="btn ghost" data-a="rounds">Next round</button>`;
      ctl.onclick = async e => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'add') api('add-time', { seconds: 60 });
        if (a === 'end' && confirm('End the round now? Teams that haven\'t finished get the time limit + penalty.')) api('end-round', { game: id });
        if (a === 'board') go('board');
        if (a === 'lobby') api('close-round');
        if (a === 'rounds') { await api('close-round'); go('rounds'); }
      };
      cancelAnimationFrame(liveRaf);
      const tick = () => {
        const big = document.getElementById('tbig'); if (!big || view !== 'live') return;
        const rr = S.rounds[id];
        if (rr.status === 'live') {
          const left = (rr.endsAt - now()) / 1000;
          big.textContent = clock(left);
          big.classList.toggle('low', left <= 30);
          document.getElementById('tbar').style.transform = `scaleX(${Math.max(0, left / rr.limit)})`;
        } else { document.getElementById('tbar').style.transform = 'scaleX(0)'; }
        liveRaf = requestAnimationFrame(tick);
      };
      tick();
    }
    const order = { done: 0, failed: 1, dnf: 1, playing: 2, waiting: 3, absent: 3 };
    const rows = S.live.slice().sort((a, b) => (order[a.status] - order[b.status]) || ((a.time ?? 1e9) - (b.time ?? 1e9)) || a.name.localeCompare(b.name));
    const done = rows.filter(x => x.status === 'done').length;
    const playing = rows.filter(x => x.status === 'playing').length;
    const best = rows.find(x => x.status === 'done');
    document.getElementById('lstats').innerHTML = `
      <div class="stat-box"><b>${done}<span style="font-size:24px;color:var(--ink-3)"> / ${rows.length}</span></b><span>teams finished</span></div>
      <div class="stat-box"><b>${playing}</b><span>still playing</span></div>
      <div class="stat-box"><b class="mono" style="font-size:38px">${best ? fmt(best.time) : '—'}</b><span>${best ? 'fastest · ' + esc(best.name) : 'fastest time'}</span></div>`;
    const list = document.getElementById('llist');
    if (!rows.length) { list.innerHTML = '<div class="empty">No teams yet — head to the join screen.</div>'; return; }
    let rank = 0;
    list.innerHTML = rows.map(t => {
      const fin = t.status === 'done';
      if (fin) rank++;
      const label = { done: 'Finished', failed: 'Out of tries', dnf: "Didn't finish", playing: t.detail, waiting: 'Not started', absent: 'Not started' }[t.status];
      const flash = fin && prevLive[t.id] && prevLive[t.id] !== 'done' ? 'flash' : '';
      return `<div class="lrow ${t.status} ${flash}"><div class="pos">${fin ? rank : t.status === 'playing' ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 3a9 9 0 109 9" ><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>' : '·'}</div>
        <div class="name">${esc(t.name)}</div><div class="detail">${esc(fin ? t.detail : label)}</div><div class="tm">${t.time != null ? fmt(t.time) : ''}</div></div>`;
    }).join('');
    prevLive = Object.fromEntries(rows.map(t => [t.id, t.status]));
  }

  // ---------------- buzzer round (live) ----------------
  let buzzRaf = null;
  function renderBuzz(stage) {
    const r = S.rounds.rapid, b = S.buzz, live = r.status === 'live';
    stage.style.setProperty('--g', gcolor('rapid'));
    if (mountedView !== 'live' || stage.dataset.key !== 'rapid:' + r.startedAt) {
      stage.dataset.key = 'rapid:' + r.startedAt;
      stage.innerHTML = `
        <div class="live-top">
          <div><div class="eyebrow" style="display:flex;gap:10px;align-items:center"><span id="bz-chip"></span><span id="bz-qn"></span></div>
            <div class="live-title" style="margin-top:12px"><span class="gicon" style="--g:var(--rapid)">${ICON.rapid}</span><h1 class="h1" style="margin:0">Rapid Fire</h1></div></div>
          <div class="timer"><div class="eyebrow">Right · Wrong · Others</div><div class="mono" style="font-size:28px;font-weight:800;margin-top:6px">−${S.settings.rapidCorrect}s · +${S.settings.rapidWrong}s · −${S.settings.rapidOthers}s</div></div>
        </div>
        <div class="bz-q" id="bz-q"></div>
        <div class="bz-status" id="bz-st"></div>
        <div class="btns ctl" id="bz-ctl"></div>
        <div class="bz-scores" id="bz-sc"></div>`;
      stage.querySelector('#bz-ctl').onclick = async e => {
        const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
        if (a === 'end') { if (confirm('End the buzzer round?')) api('end-round', { game: 'rapid' }); }
        else if (a === 'board') go('board');
        else if (a === 'lobby') api('close-round');
        else if (a === 'rounds') { await api('close-round'); go('rounds'); }
        else api('buzzer', { action: a });
      };
      cancelAnimationFrame(buzzRaf);
      const tick = () => {
        const bar = document.getElementById('bz-tbar'); if (!document.getElementById('bz-st') || view !== 'live') return;
        if (bar && S.buzz && S.buzz.phase === 'answering') {
          const left = Math.max(0, (S.buzz.deadline - now()) / 1000);
          bar.style.transform = `scaleX(${left / S.buzz.answerSecs})`;
          const t = document.getElementById('bz-left'); if (t) t.textContent = Math.ceil(left) + 's';
        }
        buzzRaf = requestAnimationFrame(tick);
      };
      tick();
    }
    const phase = b ? b.phase : 'idle';
    document.getElementById('bz-chip').innerHTML = live ? '<span class="chip live">Live</span>' : '<span class="chip done">Round over</span>';
    document.getElementById('bz-qn').textContent = b && b.q >= 0 && phase !== 'over' ? `Question ${b.q + 1} of ${b.total}` : `${b ? b.total : 0} questions`;
    document.getElementById('bz-q').innerHTML = phase === 'idle' ? '<span class="dim">Teams: get your buzzer finger ready.</span>'
      : phase === 'over' ? '<span class="dim">That was the last question!</span>' : esc(b.question);
    let st = '';
    const last = b && b.last && b.last.type === 'wrong' && !b.last.overruled ? `<div class="bz-wrong">✗ <b>${esc(b.last.teamName)}</b> said “${esc(b.last.text)}” — ${signed(S.settings.rapidWrong)} for them, ${signed(-S.settings.rapidOthers)} for everyone else</div>` : '';
    if (!live) st = '';
    else if (phase === 'open') st = `${last}<div class="bz-open">Buzzers open!</div>`;
    else if (phase === 'answering') st = `${last}<div class="bz-ans"><div><b>${esc(b.teamName)}</b> buzzed first!</div><div class="bz-tbar"><i id="bz-tbar"></i></div><span id="bz-left" class="mono"></span></div>`;
    else if (phase === 'closed') st = b.result.type === 'correct'
      ? `<div class="bz-right">✓ <b>${esc(b.result.teamName)}</b>: “${esc(b.result.text)}” — correct! ${signed(-S.settings.rapidCorrect)}${b.result.overruled ? ' <small>(host accepted)</small>' : ''}<div class="bz-a">Answer: ${esc(b.answer)}</div></div>`
      : `${last}<div class="bz-none">${b.result.type === 'nobody' ? 'Nobody got it.' : 'Skipped.'}<div class="bz-a">Answer: ${esc(b.answer)}</div></div>`;
    document.getElementById('bz-st').innerHTML = st;
    const canAccept = b && b.last && b.last.type === 'wrong' && !b.last.overruled && b.last && phase !== 'answering' && (phase === 'open' || (phase === 'closed' && b.result.type === 'nobody'));
    document.getElementById('bz-ctl').innerHTML = live ? `
      <button class="btn go" data-a="next" ${phase === 'answering' || phase === 'over' ? 'disabled' : ''}>${phase === 'idle' ? 'Show first question' : 'Next question →'}</button>
      ${phase === 'open' ? '<button class="btn ghost" data-a="reveal">Reveal answer & skip</button>' : ''}
      ${canAccept ? '<button class="btn ghost" data-a="accept">Accept last answer as correct</button>' : ''}
      <button class="btn danger" data-a="end">End round</button>`
      : `<button class="btn" data-a="board">Show leaderboard →</button><button class="btn ghost" data-a="lobby">Send players to lobby</button><button class="btn ghost" data-a="rounds">Next round</button>`;
    const scores = b ? b.scores : [];
    document.getElementById('bz-sc').innerHTML = scores.length ? scores.map((t, i) => `
      <div class="lrow ${b.team === t.id ? 'done flash' : ''} ${b.locked.includes(t.id) && phase !== 'closed' ? 'failed' : ''}">
        <div class="pos">${i + 1}</div><div class="name">${esc(t.name)}</div>
        <div class="detail">${b.team === t.id ? 'answering…' : b.locked.includes(t.id) && phase !== 'closed' ? 'out this question' : ''}</div>
        <div class="tm">${signed(t.net)}</div></div>`).join('') : '<div class="empty">No teams yet.</div>';
  }

  // ---------------- leaderboard ----------------
  function renderBoard(stage) {
    const played = S.games.filter(g => S.rounds[g.id].status !== 'idle');
    const lb = S.leaderboard;
    const first = mountedView !== 'board';
    const oldPos = {};
    if (!first) stage.querySelectorAll('tr[data-id]').forEach(tr => { oldPos[tr.dataset.id] = tr.getBoundingClientRect().top; });
    const pod = [lb[1], lb[0], lb[2]];
    const podCls = ['p2', 'p1', 'p3'], podRank = [2, 1, 3];
    stage.innerHTML = `
      <div class="head"><div><div class="eyebrow">${played.length} of ${S.games.length} rounds played · lowest total time wins</div><h1 class="h1">Leaderboard</h1></div>
        <div class="btns"><button class="btn ghost" id="party">🎉 Celebrate</button></div></div>
      ${lb.length && played.length ? `<div class="podium">${pod.map((t, i) => t ? `<div class="pod ${podCls[i]}"><div class="medal">${t.rank}</div><div class="nm">${esc(t.name)}</div><div class="tt">${fmt(t.total)}</div></div>` : `<div class="pod ${podCls[i]} empty-pod"><div class="medal">${podRank[i]}</div><div class="nm">—</div></div>`).join('')}</div>` : ''}
      ${lb.length ? `<table class="lb"><thead><tr><th>#</th><th>Team</th>${played.map(g => `<th class="c"><span class="gd" style="background:${gcolor(g.id)}"></span>${esc(g.title)}</th>`).join('')}<th class="c">Total</th></tr></thead>
        <tbody>${lb.map(t => `<tr data-id="${t.id}" class="r${t.rank}"><td>${t.played ? t.rank : '–'}</td><td class="nm">${esc(t.name)}</td>${played.map(g => {
          const p = t.per[g.id];
          if (!p || p.time == null) return `<td class="c na">${p && p.status === 'playing' ? 'playing…' : '—'}</td>`;
          if (p.buzzer) return `<td class="c ${p.time > 0 ? 'pen' : ''}">${signed(p.time)}</td>`;
          const pen = p.status === 'dnf' || p.status === 'failed' || p.status === 'absent';
          return `<td class="c ${pen ? 'pen' : ''}" title="${pen ? 'Did not finish: limit + penalty' : ''}">${fmt(p.time)}</td>`;
        }).join('')}<td class="total">${t.played ? fmt(t.total) : '—'}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No teams yet.</div>'}
      ${lb.length && !played.length ? '<div class="empty">Times appear here once the first round starts.</div>' : ''}`;
    stage.querySelector('#party').onclick = confetti;
    if (!first) stage.querySelectorAll('tr[data-id]').forEach(tr => {
      const o = oldPos[tr.dataset.id]; if (o == null) return;
      const d = o - tr.getBoundingClientRect().top; if (!d) return;
      tr.style.transition = 'none'; tr.style.transform = `translateY(${d}px)`;
      requestAnimationFrame(() => { tr.style.transition = ''; tr.style.transform = ''; });
    });
  }

  // ---------------- puzzles ----------------
  const HELP = {
    hangman: 'One answer per line, with an optional hint after a <b>|</b>. Teams solve them in order with 6 lives each. Running out of lives skips the word with a penalty.',
    wordle: 'Just the answer. Teams get 6 guesses. Failing counts as not finishing.',
    connections: 'Exactly four groups of four, easiest first (yellow, green, blue, purple). Teams get 4 mistakes.',
    strands: 'Theme, a spangram that stretches across the board, and the theme words. Total letters must be exactly <b>48</b>. The grid is generated for you — press Save again for a fresh layout.',
    krillion: 'Each prompt starts with <b>?</b>. List accepted answers by rarity: <b>surface</b> (common), <b>deep</b> (rare, earns time back), <b>abyss</b> (very rare, earns more). Small typos are forgiven.',
    rapid: 'Buzzer round. One question per line, accepted answers after <b>|</b>, separated by <b>/</b>. Small typos are forgiven, and you can overrule a wrong call live. The first answer listed is the one shown when a question closes.',
    melale: 'A Poople-style word ladder. Set the <b>Target</b>, then one starting word per line (each line is a stage), with an optional label after <b>|</b>. Use <b>&gt;</b> to show fixed opening rows (e.g. <b>FMAC &gt; FACE</b>) — players start from the last one. Starting words can be made-up letters, but each move changes one letter and must be a real word. Par (the shortest ladder) is worked out for you; every step over par adds time.',
  };
  async function renderPuzzles(stage) {
    if (mountedView === 'puzzles') return;
    stage.innerHTML = `<div class="head"><div><div class="eyebrow">Hidden from players until the round starts</div><h1 class="h1">Puzzles</h1></div></div>
      <div class="ptabs" id="ptabs">${S.games.map(g => `<button data-g="${g.id}" style="--g:${gcolor(g.id)}" class="${g.id === editorGame ? 'on' : ''}"><i></i>${esc(g.title)}</button>`).join('')}</div>
      <div id="ped"><div class="empty">Loading…</div></div>`;
    stage.querySelector('#ptabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; editorGame = b.dataset.g; stage.querySelectorAll('#ptabs button').forEach(x => x.classList.toggle('on', x === b)); drawEditor(); };
    if (!contentCache) { const r = await fetch('/api/admin/content?key=' + encodeURIComponent(key)); contentCache = await r.json(); }
    drawEditor();
  }
  function previewHtml(game, c) {
    if (!c) return '';
    if (game === 'hangman') return `<div class="pv-list">${c.words.map(w => `<div><b>${esc(w.word)}</b><br><small>${esc(w.hint || 'no hint')}</small></div>`).join('')}</div>`;
    if (game === 'wordle') return `<div class="pv-list"><div>Answer: <b class="mono">${esc(c.word)}</b> · ${c.word.length} letters</div></div>`;
    if (game === 'connections') return `<div class="pv-list">${c.groups.map((g, i) => `<div style="background:var(--c${i});color:#111;border:0"><b style="color:#111">${esc(g.name)}</b><br><small style="color:#333">${esc(g.words.join(', '))}</small></div>`).join('')}</div>`;
    if (game === 'strands') {
      const color = {}; Object.entries(c.grid.paths).forEach(([w, p]) => p.forEach(i => color[i] = w === c.spangram ? '#F8CD05' : '#AEDFEE'));
      return `<div class="pv-list"><div>Theme: <b>${esc(c.theme)}</b> · spangram in yellow</div></div>
        <div class="pv-grid" style="grid-template-columns:repeat(${c.grid.cols},1fr);max-width:300px">${c.grid.letters.map((L, i) => `<span style="background:${color[i]};color:#111">${L}</span>`).join('')}</div>`;
    }
    if (game === 'krillion') return `<div class="pv-list">${c.prompts.map(p => `<div><b>${esc(p.prompt)}</b><br><small>${p.tiers.surface.length} surface · ${p.tiers.deep.length} deep · ${p.tiers.abyss.length} abyss</small></div>`).join('')}</div>`;
    if (game === 'melale') return `<div class="pv-list">${c.ladders.map(l => `<div><b>${esc((l.given || [l.start]).join(' › '))}</b> → ${esc(c.target)} · par ${l.par}${l.label ? ` · <small>${esc(l.label)}</small>` : ''}<br><small>e.g. ${esc(l.path.join(' → '))}</small></div>`).join('')}</div>`;
    if (game === 'rapid') return `<div class="pv-list">${c.questions.map((q, i) => `<div><small>${i + 1}.</small> ${esc(q.q)}<br><small>→ ${esc(q.answers.join(' / '))}</small></div>`).join('')}</div>`;
  }
  function drawEditor() {
    const ed = document.getElementById('ped'); if (!ed) return;
    const g = editorGame, live = S.rounds[g].status === 'live';
    ed.innerHTML = `<div class="editor">
      <div style="display:grid;gap:12px"><textarea id="ta" spellcheck="false" ${live ? 'disabled' : ''}>${esc(contentCache.text[g])}</textarea>
        <div class="btns"><button class="btn" id="save" ${live ? 'disabled' : ''}>${g === 'strands' ? 'Save & build grid' : 'Save'}</button><span class="err" id="perr" style="align-self:center">${live ? 'This round is live — end it to edit.' : ''}</span></div></div>
      <div class="preview"><div class="note">${HELP[g]}</div><div id="pv">${previewHtml(g, contentCache.content[g])}</div></div></div>`;
    ed.querySelector('#save').onclick = async () => {
      const text = ed.querySelector('#ta').value;
      const r = await api('content', { game: g, text });
      if (r.ok) {
        contentCache.text[g] = text; contentCache.content[g] = r.content;
        ed.querySelector('#pv').innerHTML = previewHtml(g, r.content);
        ed.querySelector('#perr').innerHTML = '<span class="ok">Saved ✓</span>';
        if (S.rounds[g].status === 'ended') ed.querySelector('#perr').innerHTML += ' <span style="color:var(--ink-3);font-weight:500">— use Replay on the Rounds screen to play it again.</span>';
      } else ed.querySelector('#perr').textContent = r.error || 'Could not save';
    };
  }

  // ---------------- settings ----------------
  function renderSettings(stage) {
    if (mountedView === 'settings') return;
    const s = S.settings;
    const num = (k, label, help) => `<div class="srow"><label for="s-${k}">${label}<small>${help}</small></label><input id="s-${k}" type="number" min="0" value="${s[k]}" data-k="${k}"></div>`;
    stage.innerHTML = `<div class="head"><div><div class="eyebrow">Scoring & session</div><h1 class="h1">Settings</h1></div><button class="btn" id="ssave">Save settings</button></div>
      <div class="settings">
        <div class="panel"><h3>Event</h3>
          <div class="srow" style="grid-template-columns:1fr"><label>Event name<small>Shown on players' phones and here</small></label><input id="s-name" value="${esc(s.eventName)}" style="text-align:left;padding:0 12px;font-family:var(--body)"></div>
          <div class="srow" style="grid-template-columns:1fr"><label>Tagline<small>Shown above the event name on the join screen</small></label><input id="s-tag" value="${esc(s.tagline || '')}" style="text-align:left;padding:0 12px;font-family:var(--body)"></div>
          <div class="srow" style="grid-template-columns:1fr"><label>Join link override<small>Leave blank to auto-detect. Detected: ${esc(joinBase())}</small></label><input id="s-url" value="${esc(s.joinUrl)}" placeholder="https://your-site.onrender.com" style="text-align:left;padding:0 12px;font-family:var(--body)"></div>
        </div>
        <div class="panel"><h3>Penalties (seconds)</h3>
          ${num('dnfPenalty', 'Did not finish', 'Added on top of the time limit')}
          ${num('hangmanMiss', 'Hangman: word lost', 'Ran out of lives on a word')}
          ${num('strandsHint', 'Strands: hint used', 'Per hint')}
          ${num('rapidCorrect', 'Rapid Fire: right answer', 'Seconds taken off')}
          ${num('rapidWrong', 'Rapid Fire: wrong answer', 'Seconds added to that team')}
          ${num('rapidOthers', 'Rapid Fire: others on a wrong answer', 'Seconds taken off every other team')}
          ${num('rapidAnswer', 'Rapid Fire: time to answer', 'Seconds after buzzing')}
          ${num('melaleOverPar', 'Melale: step over par', 'Per extra step beyond the shortest ladder')}
          ${num('melaleHint', 'Melale: hint', 'Reveals the next step')}
        </div>
        <div class="panel"><h3>Krillion</h3>
          ${num('krillionPrompt', 'Seconds per prompt', 'Auto-skips when time runs out')}
          ${num('krillionSkip', 'Skip / timeout penalty', 'Seconds added')}
          ${num('krillionDeep', 'Deep answer credit', 'Seconds taken off')}
          ${num('krillionAbyss', 'Abyss answer credit', 'Seconds taken off')}
        </div>
        <div class="panel"><h3>Danger zone</h3>
          <p style="color:var(--ink-2);font-size:14px;margin:0 0 14px">Starts a brand-new session: new code, all teams removed, all times cleared. Your puzzles and settings are kept.</p>
          <div class="btns"><button class="btn danger" id="reset">Reset everything</button><button class="btn ghost" id="logout">Log out</button></div>
        </div>
      </div>`;
    stage.querySelector('#ssave').onclick = async () => {
      const settings = { eventName: stage.querySelector('#s-name').value, tagline: stage.querySelector('#s-tag').value, joinUrl: stage.querySelector('#s-url').value };
      stage.querySelectorAll('[data-k]').forEach(i => settings[i.dataset.k] = Number(i.value));
      const r = await api('settings', { settings });
      if (r.ok) { toast('Settings saved'); mountedView = null; setTimeout(render, 100); }
    };
    stage.querySelector('#reset').onclick = async () => { if (confirm('Reset everything? All teams and times will be cleared.') && confirm('Really? This cannot be undone.')) { await api('reset-all'); toast('New session started'); go('join'); } };
    stage.querySelector('#logout').onclick = logout;
  }

  // ---------------- confetti ----------------
  function confetti() {
    const c = document.getElementById('confetti'), ctx = c.getContext('2d');
    c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; ctx.scale(devicePixelRatio, devicePixelRatio);
    const cols = ['#6AAA64', '#F2C14E', '#A78BFA', '#F0705A', '#3FA7E0', '#2FC4B2', '#F5F1E8'];
    const P = Array.from({ length: 220 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .35, vx: (Math.random() - .5) * 16, vy: -Math.random() * 16 - 4, s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    const step = t => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
      if (t - t0 < 4000) requestAnimationFrame(step); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    requestAnimationFrame(step);
  }

  if (key) connect(); else renderLogin();
  // ping every 4 min so free hosting (e.g. Render) never sleeps mid-event
  setInterval(() => { fetch('/api/ping', { cache: 'no-store' }).catch(() => {}); }, 240000);
})();
