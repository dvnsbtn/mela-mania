(() => {
  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');
  const TOKEN_KEY = 'mg_team_token';
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch {}
  let view = null, offset = 0, es = null;
  let mounted = { key: null, game: null };
  const now = () => Date.now() + offset;
  function setMounted(m) {
    if (mounted.game && mounted.game.unmount) mounted.game.unmount();
    mounted = m;
  }

  const GAME_COLOR = { hangman: 'var(--hangman)', connections: 'var(--connections)', wordle: 'var(--wordle)', melale: 'var(--melale)', krillion: 'var(--krillion)', strands: 'var(--strands)', rapid: 'var(--rapid)' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = secs => {
    if (secs == null) return '—';
    const neg = secs < 0; secs = Math.abs(secs);
    const m = Math.floor(secs / 60), s = secs - m * 60;
    return (neg ? '−' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  };
  const fmtClock = secs => { secs = Math.max(0, Math.floor(secs)); return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); };
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  let toastTimer;
  function toast(msg, tone) {
    if (!msg) return;
    $toast.textContent = msg;
    $toast.className = 'show ' + (tone || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.className = tone || ''; }, 1700);
  }

  async function act(action) {
    if (!view || !view.round) return {};
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, game: view.round.game, action }) });
      if (r.status === 401) { kicked(); return {}; }
      return await r.json();
    } catch { toast('Connection hiccup — try again', 'bad'); return {}; }
  }

  // ---------------- join ----------------
  function renderJoin(err) {
    setMounted({ key: 'join' });
    const params = new URLSearchParams(location.search);
    const pathCode = location.pathname.replace(/\//g, '').toUpperCase();
    const code = params.get('code') || (/^[A-Z0-9]{5}$/.test(pathCode) ? pathCode : '');
    $app.innerHTML = `
      <div class="top"><div class="brand"><div class="logo"><i>M</i><i>E</i><i>L</i><i>A</i></div><span id="evname">Mela Mania</span></div></div>
      <div class="join">
        <h1>Gather your team.<br><em>Beat the clock.</em></h1>
        <div class="chips">
          ${[['M', 'Movies', 'wordle'], ['E', 'Entertainment', 'rapid'], ['L', 'Literature', 'connections'], ['A', 'Art', 'hangman']].map(([l, n, k]) => `<span class="chip"><b style="background:${GAME_COLOR[k]}">${l}</b>${n}</span>`).join('')}
        </div>
        <form id="jf" autocomplete="off">
          <div><label class="label" for="code">Session code</label>
            <input class="field code-field" id="code" maxlength="5" value="${esc(code)}" placeholder="•••••" autocapitalize="characters" spellcheck="false" required></div>
          <div><label class="label" for="name">Team name</label>
            <input class="field" id="name" maxlength="24" placeholder="e.g. The Quizzards" required></div>
          <button class="btn block" type="submit">Join the game</button>
          <div class="err" id="err">${esc(err || '')}</div>
        </form>
      </div>`;
    const f = document.getElementById('jf');
    (code ? f.name : f.code).focus();
    fetch('/api/info').then(r => r.json()).then(i => { const e = document.getElementById('evname'); if (e && i.eventName) { e.textContent = i.eventName; document.title = 'Join ' + i.eventName; } }).catch(() => {});
    f.code.addEventListener('input', () => { f.code.value = f.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        const r = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: f.code.value, name: f.name.value }) });
        const j = await r.json();
        if (!r.ok) { document.getElementById('err').textContent = j.error || 'Could not join'; btn.disabled = false; return; }
        token = j.token;
        try { localStorage.setItem(TOKEN_KEY, token); } catch {}
        history.replaceState(null, '', '/');
        connect();
      } catch { document.getElementById('err').textContent = 'No connection — check your internet.'; btn.disabled = false; }
    });
  }

  function kicked() {
    if (es) { es.close(); es = null; }
    token = null; view = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    renderJoin('You were removed from the session. Join again with the code on screen.');
  }

  // ---------------- realtime ----------------
  function connect() {
    if (es) es.close();
    es = new EventSource('/events/team?token=' + encodeURIComponent(token));
    es.addEventListener('state', e => { const v = JSON.parse(e.data); offset = v.now - Date.now(); view = v; render(); });
    es.addEventListener('kicked', kicked);
  }

  // ---------------- screens ----------------
  function shellTop() {
    return `<div class="top"><div class="brand"><div class="logo"><i>M</i><i>E</i><i>L</i><i>A</i></div>${esc(view.eventName)}</div><div class="team-pill">${esc(view.team.name)}</div></div>`;
  }

  function render() {
    if (!view) return;
    document.documentElement.style.setProperty('--game', view.round ? GAME_COLOR[view.round.game] : 'var(--ink)');
    if (view.screen === 'lobby') return renderLobby();
    if (view.screen === 'finished') return renderFinished();
    if (view.screen === 'round') return renderRound();
  }

  function historyHtml() {
    if (!view.history.length) return '';
    const total = view.history.reduce((s, x) => s + x.result.time, 0);
    return `<div class="history"><h3>Your times</h3>${view.history.map(x => `<div class="hrow"><span>${esc(x.title)}</span><span>${fmt(x.result.time)}</span></div>`).join('')}
      <div class="hrow" style="background:var(--ink);color:#fff;border-color:var(--ink)"><span>Total</span><span>${fmt(Math.round(total * 10) / 10)}</span></div></div>`;
  }

  function renderLobby() {
    const key = 'lobby:' + view.history.length + ':' + view.team.name;
    if (mounted.key === key) return;
    setMounted({ key });
    $app.innerHTML = `${shellTop()}
      <div class="lobby">
        <div class="kicker">● You're in</div>
        <h2>${esc(view.team.name)}</h2>
        <div class="waiting"><i></i><i></i><i></i><i></i></div>
        <p class="muted">Waiting for the host to start the next round.<br>Keep this screen open.</p>
        ${historyHtml()}
      </div>`;
  }

  function renderFinished() {
    const r = view.result || {};
    const key = 'fin:' + view.round.game + ':' + r.status + ':' + r.time + ':' + view.history.length;
    if (mounted.key === key) return;
    setMounted({ key });
    const g = view.game;
    let title = 'Finished!';
    if (r.status === 'failed') title = 'Not this time';
    if (r.status === 'dnf' || r.status === 'absent') title = "Time's up";
    if (r.status === 'playing' || r.status === 'waiting') title = "Time's up";
    let reveal = '';
    if (g && view.round.game === 'wordle' && g.answer) reveal = `<div class="reveal muted">The word was<br><b>${esc(g.answer)}</b></div>`;
    if (g && view.round.game === 'melale' && g.results) reveal = `<div class="breakdown">${g.results.map(r => `<div><span>${esc(r.chain.join(' → '))}</span><span>${r.steps}/${r.par}</span></div>`).join('')}</div>`;
    if (g && view.round.game === 'connections' && g.solved) reveal = `<div class="cx-grid">${g.solved.map(s => `<div class="cx-group l${s.level} ${s.missed ? 'missed' : ''}"><b>${esc(s.name)}</b><span>${esc(s.words.join(', '))}</span></div>`).join('')}</div>`;
    const rows = [];
    if (r.status === 'done') {
      rows.push(['Solve time', fmt(r.raw)]);
      if (r.penalty) rows.push(['Penalties', '+' + r.penalty + 's']);
      if (r.bonus) rows.push(['Bonus', '−' + r.bonus + 's']);
    } else if (r.time != null) {
      rows.push(['Round limit + penalty', fmt(r.time)]);
    }
    $app.innerHTML = `${shellTop()}
      <div class="done">
        <div class="kicker">${esc(view.round.title)}</div>
        <h2>${title}</h2>
        <div class="big">${r.time != null ? fmt(r.time) : '…'}</div>
        ${rows.length ? `<div class="breakdown">${rows.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('')}</div>` : ''}
        ${reveal}
        <p class="muted">${view.round.status === 'live' ? 'Nice. Hang tight while the other teams finish.' : 'Round over — watch the big screen for the leaderboard.'}</p>
      </div>`;
  }

  // ---------------- round shell + clock ----------------
  let clockRaf = null;
  function renderRound() {
    const g = view.round.game;
    if (view.needsStart) {
      if (mounted.key !== 'starting:' + g) { setMounted({ key: 'starting:' + g }); $app.innerHTML = `${shellTop()}<div class="intro"><h2>${esc(view.round.title)}</h2><p class="muted">Loading…</p></div>`; act({ type: 'start' }); }
      return;
    }
    const key = 'round:' + g + ':' + view.round.startedAt;
    if (mounted.key !== key) {
      setMounted({ key: null });
      $app.innerHTML = `
        <div class="round-head">
          <div class="round-title"><h2><span class="dot"></span>${esc(view.round.title)}</h2>
            <div class="clock" id="clock">0:00<small>your time</small></div></div>
          <div class="limitbar" id="lb"><i></i></div>
        </div>
        <div class="game" id="game"></div>`;
      const el = document.getElementById('game');
      const impl = GAMES[g];
      mounted = { key, game: impl, el };
      impl.mount(el, view.game);
      startClock();
    }
    mounted.game.update(view.game);
  }

  function startClock() {
    cancelAnimationFrame(clockRaf);
    const tick = () => {
      if (!view || view.screen !== 'round' || !document.getElementById('clock')) return;
      const r = view.round;
      const el = document.getElementById('clock');
      const elapsed = (now() - r.startedAt) / 1000;
      el.firstChild.nodeValue = fmtClock(elapsed);
      const left = (r.endsAt - now()) / 1000;
      const lb = document.getElementById('lb');
      lb.firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, left / r.limit))})`;
      lb.classList.toggle('low', left < 30);
      if (mounted.game && mounted.game.tick) mounted.game.tick();
      clockRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------------- games ----------------
  const GAMES = {};

  // ---- Hangman ----
  GAMES.hangman = {
    mount(el) {
      this.el = el; this.idx = -1;
      el.innerHTML = `
        <div class="sub"><span id="hm-prog"></span><span class="lives" id="hm-lives"></span></div>
        <div class="hm-art"><svg viewBox="0 0 150 150">
          <path class="frame" d="M20 140 H90 M40 140 V12 H100 V28"/>
          <circle class="part" cx="100" cy="42" r="14"/>
          <path class="part" d="M100 56 V96"/><path class="part" d="M100 66 L82 84"/><path class="part" d="M100 66 L118 84"/>
          <path class="part" d="M100 96 L84 122"/><path class="part" d="M100 96 L116 122"/></svg></div>
        <div class="hm-word" id="hm-word"></div>
        <div class="hm-hint" id="hm-hint"></div>
        <div class="kbd" id="hm-kbd">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `<button data-l="${c}">${c}</button>`).join('')}</div>
        <form class="solve" id="hm-solve"><input class="field" placeholder="Know it? Type the answer" autocomplete="off" autocapitalize="characters"><button class="btn small">Solve</button></form>`;
      el.querySelector('#hm-kbd').addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        b.disabled = true;
        const r = await act({ type: 'letter', letter: b.dataset.l });
        if (r.msg) toast(r.msg, r.tone);
      });
      el.querySelector('#hm-solve').addEventListener('submit', async e => {
        e.preventDefault();
        const inp = e.target.querySelector('input'); if (!inp.value.trim()) return;
        const r = await act({ type: 'solve', text: inp.value });
        if (r.msg) toast(r.msg, r.tone);
        inp.value = '';
      });
      this.keyHandler = e => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
        if (/^[a-z]$/i.test(e.key)) { const b = el.querySelector(`[data-l="${e.key.toUpperCase()}"]`); if (b && !b.disabled) b.click(); }
      };
      document.addEventListener('keydown', this.keyHandler);
    },
    unmount() { document.removeEventListener('keydown', this.keyHandler); },
    update(v) {
      const el = this.el;
      el.querySelector('#hm-prog').textContent = `Word ${v.index + 1} of ${v.total}`;
      el.querySelector('#hm-lives').innerHTML = Array.from({ length: v.maxWrong }, (_, i) => `<i class="${i < v.wrong ? 'lost' : ''}"></i>`).join('');
      el.querySelectorAll('.part').forEach((p, i) => p.classList.toggle('on', i < v.wrong));
      // word, grouped so whole words wrap together
      const words = []; let cur = [];
      v.masked.forEach(ch => { if (ch === ' ') { words.push(cur); cur = []; } else cur.push(ch); });
      words.push(cur);
      el.querySelector('#hm-word').innerHTML = words.map(w => `<div class="w">${w.map(ch => ch === null ? '<div class="l"></div>' : /[A-Z]/.test(ch) ? `<div class="l">${ch}</div>` : `<div class="l p">${esc(ch)}</div>`).join('')}</div>`).join('');
      el.querySelector('#hm-hint').textContent = v.hint ? '💡 ' + v.hint : '';
      const wrongSet = new Set(v.guessed.filter(L => !v.masked.includes(L)));
      el.querySelectorAll('#hm-kbd button').forEach(b => {
        const L = b.dataset.l, used = v.guessed.includes(L);
        b.disabled = used;
        b.className = used ? (wrongSet.has(L) ? 'miss' : 'hit') : '';
      });
    },
  };

  // ---- Wordle ----
  GAMES.wordle = {
    mount(el, v) {
      this.el = el; this.typed = ''; this.busy = false;
      const rows = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];
      el.innerHTML = `
        <div class="wd-board" id="wd-board"></div>
        <div class="wd-kbd" id="wd-kbd">${rows.map(r => `<div class="r">${r.split('').map(c => c === '+' ? '<button class="wide" data-k="Enter">ENTER</button>' : c === '-' ? '<button class="wide" data-k="Backspace">⌫</button>' : `<button data-k="${c}">${c}</button>`).join('')}</div>`).join('')}</div>`;
      el.querySelector('#wd-kbd').addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.key(b.dataset.k); });
      this.keyHandler = e => { if (e.metaKey || e.ctrlKey || (e.target && e.target.tagName === 'INPUT')) return; if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) { e.preventDefault(); this.key(e.key.length === 1 ? e.key.toUpperCase() : e.key); } };
      document.addEventListener('keydown', this.keyHandler);
      this.v = v;
    },
    async key(k) {
      const v = this.v; if (!v || this.busy) return;
      if (k === 'Backspace') this.typed = this.typed.slice(0, -1);
      else if (k === 'Enter') {
        if (this.typed.length !== v.length) { this.shake(); toast('Not enough letters'); return; }
        this.busy = true;
        const r = await act({ type: 'guess', word: this.typed });
        this.busy = false;
        if (r.ok) this.typed = ''; else { this.shake(); }
        if (r.msg) toast(r.msg, r.tone);
      } else if (/^[A-Z]$/.test(k) && this.typed.length < v.length) this.typed += k;
      this.draw();
    },
    shake() { const row = this.el.querySelector(`.wd-row[data-r="${this.v.guesses.length}"]`); if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); } },
    unmount() { document.removeEventListener('keydown', this.keyHandler); },
    update(v) {
      this.v = v; this.draw();
    },
    draw() {
      const v = this.v, el = this.el;
      const board = el.querySelector('#wd-board');
      const prev = this.revealed == null ? v.guesses.length : this.revealed; // rows already shown don't re-animate
      let html = '';
      for (let r = 0; r < v.maxGuesses; r++) {
        const g = v.guesses[r];
        html += `<div class="wd-row" data-r="${r}" style="grid-template-columns:repeat(${v.length},auto)">`;
        for (let c = 0; c < v.length; c++) {
          if (g) html += `<div class="wd-cell ${g.marks[c]}" style="${r < prev ? 'animation:none' : `animation-delay:${c * 0.12}s`}">${g.word[c]}</div>`;
          else if (r === v.guesses.length && this.typed[c]) html += `<div class="wd-cell filled" style="${c === this.typed.length - 1 ? '' : 'animation:none'}">${this.typed[c]}</div>`;
          else html += `<div class="wd-cell"></div>`;
        }
        html += '</div>';
      }
      board.innerHTML = html;
      this.revealed = v.guesses.length;
      const rank = { absent: 1, present: 2, correct: 3 }, best = {};
      v.guesses.forEach(g => g.marks.forEach((m, i) => { const L = g.word[i]; if (!best[L] || rank[m] > rank[best[L]]) best[L] = m; }));
      el.querySelectorAll('#wd-kbd button').forEach(b => { b.className = (b.classList.contains('wide') ? 'wide ' : '') + (best[b.dataset.k] || ''); });
    },
  };

  // ---- Melale (word ladder to MELA) ----
  GAMES.melale = {
    mount(el, v) {
      this.el = el; this.typed = ''; this.busy = false; this.v = v;
      const rows = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];
      el.innerHTML = `
        <div class="sub"><span id="ml-n"></span><span id="ml-par"></span></div>
        <div class="ml-board" id="ml-board"></div>
        <div class="row-btns"><button class="btn ghost small" id="ml-undo">Undo</button><button class="btn ghost small" id="ml-hint">Hint</button></div>
        <div class="wd-kbd" id="ml-kbd">${rows.map(r => `<div class="r">${r.split('').map(c => c === '+' ? '<button class="wide" data-k="Enter">ENTER</button>' : c === '-' ? '<button class="wide" data-k="Backspace">⌫</button>' : `<button data-k="${c}">${c}</button>`).join('')}</div>`).join('')}</div>`;
      el.querySelector('#ml-kbd').addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.key(b.dataset.k); });
      el.querySelector('#ml-undo').onclick = async () => { this.typed = ''; const r = await act({ type: 'undo' }); if (r.msg) toast(r.msg, r.tone); };
      el.querySelector('#ml-hint').onclick = async () => { this.typed = ''; const r = await act({ type: 'hint' }); if (r.msg) toast(r.msg, r.tone || 'good'); };
      this.keyHandler = e => { if (e.metaKey || e.ctrlKey || (e.target && e.target.tagName === 'INPUT')) return; if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) { e.preventDefault(); this.key(e.key.length === 1 ? e.key.toUpperCase() : e.key); } };
      document.addEventListener('keydown', this.keyHandler);
    },
    unmount() { document.removeEventListener('keydown', this.keyHandler); },
    async key(k) {
      const v = this.v; if (!v || this.busy || !v.start) return;
      const n = v.target.length;
      if (k === 'Backspace') this.typed = this.typed.slice(0, -1);
      else if (k === 'Enter') {
        if (this.typed.length !== n) { this.shake(); toast(`Type a ${n}-letter word`); return; }
        this.busy = true;
        const r = await act({ type: 'step', word: this.typed });
        this.busy = false;
        if (r.ok) this.typed = ''; else this.shake();
        if (r.msg) toast(r.msg, r.ok ? 'good' : 'bad');
      } else if (/^[A-Z]$/.test(k) && this.typed.length < n) this.typed += k;
      this.draw();
    },
    shake() { const row = this.el.querySelector('.ml-row.input'); if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); } },
    update(v) {
      if (this.v && v.index !== this.v.index) this.typed = '';
      this.v = v; this.draw();
    },
    draw() {
      const v = this.v, el = this.el; if (!v.start) return;
      const T = v.target, n = T.length;
      el.querySelector('#ml-n').textContent = `Stage ${v.index + 1} of ${v.total}${v.label ? ' · ' + v.label : ''}`;
      const gc = v.givenCount || 1;
      const steps = v.chain.length - gc;
      el.querySelector('#ml-par').innerHTML = `Steps <b>${steps}</b> · Par <b>${v.par}</b>`;
      const cells = (w, prev, cls) => `<div class="ml-row ${cls || ''}">${[...w.padEnd(n)].map((ch, i) => {
        const c = [];
        if (prev && ch !== prev[i] && ch !== ' ') c.push('chg');
        if (ch === T[i] && cls !== 'goal') c.push('hit');
        return `<div class="ml-cell ${c.join(' ')}">${ch === ' ' ? '' : ch}</div>`;
      }).join('')}</div>`;
      const last = v.chain[v.chain.length - 1];
      let html = v.chain.map((w, i) => cells(w, i >= gc ? v.chain[i - 1] : null, i < gc ? 'start' : '')).join('');
      html += `<div class="ml-row input">${Array.from({ length: n }, (_, i) => this.typed[i] ? `<div class="ml-cell typed ${this.typed[i] !== last[i] ? 'chg' : ''}">${this.typed[i]}</div>` : `<div class="ml-cell ghost">${last[i]}</div>`).join('')}</div>`;
      html += `<div class="ml-goal-label">Goal</div>` + cells(T, null, 'goal');
      const board = el.querySelector('#ml-board');
      board.innerHTML = html;
      board.scrollTop = board.scrollHeight;
      el.querySelector('#ml-undo').disabled = v.chain.length <= gc;
      el.querySelector('#ml-hint').textContent = `Hint +${v.hintPenalty}s`;
    },
  };

  // ---- Connections ----
  GAMES.connections = {
    mount(el, v) {
      this.el = el; this.sel = new Set(); this.order = v.remaining.slice();
      el.innerHTML = `
        <div class="sub"><span>Create four groups of four!</span></div>
        <div class="cx-grid" id="cx-solved"></div>
        <div class="cx-grid" id="cx-grid"></div>
        <div class="mistakes" id="cx-m"></div>
        <div class="row-btns">
          <button class="btn ghost small" id="cx-shuffle">Shuffle</button>
          <button class="btn ghost small" id="cx-clear">Deselect all</button>
          <button class="btn small" id="cx-submit">Submit</button>
        </div>`;
      el.querySelector('#cx-grid').addEventListener('click', e => {
        const t = e.target.closest('.cx-tile'); if (!t) return;
        const w = t.dataset.w;
        if (this.sel.has(w)) this.sel.delete(w); else if (this.sel.size < 4) this.sel.add(w);
        this.draw();
      });
      el.querySelector('#cx-shuffle').onclick = () => { for (let i = this.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; } this.draw(); };
      el.querySelector('#cx-clear').onclick = () => { this.sel.clear(); this.draw(); };
      el.querySelector('#cx-submit').onclick = async () => {
        if (this.sel.size !== 4) return;
        const words = [...this.sel];
        const r = await act({ type: 'guess', words });
        if (r.ok) this.sel.clear();
        else {
          el.querySelectorAll('.cx-tile.sel').forEach(t => { t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); });
          if (r.msg) toast(r.msg, r.tone);
        }
        this.draw();
      };
      this.v = v;
    },
    update(v) {
      this.v = v;
      this.order = this.order.filter(w => v.remaining.includes(w));
      v.remaining.forEach(w => { if (!this.order.includes(w)) this.order.push(w); });
      [...this.sel].forEach(w => { if (!v.remaining.includes(w)) this.sel.delete(w); });
      this.draw();
    },
    draw() {
      const v = this.v, el = this.el;
      const solvedEl = el.querySelector('#cx-solved');
      const sHtml = v.solved.map(s => `<div class="cx-group l${s.level}"><b>${esc(s.name)}</b><span>${esc(s.words.join(', '))}</span></div>`).join('');
      if (solvedEl.dataset.n !== String(v.solved.length)) { solvedEl.innerHTML = sHtml; solvedEl.dataset.n = v.solved.length; }
      solvedEl.style.display = v.solved.length ? '' : 'none';
      el.querySelector('#cx-grid').innerHTML = this.order.map(w => `<button class="cx-tile ${this.sel.has(w) ? 'sel' : ''}" data-w="${esc(w)}">${esc(w)}</button>`).join('');
      el.querySelector('#cx-m').innerHTML = 'Mistakes remaining: ' + Array.from({ length: v.maxMistakes }, (_, i) => `<i class="${i < v.mistakes ? 'used' : ''}"></i>`).join('');
      el.querySelector('#cx-submit').disabled = this.sel.size !== 4;
    },
  };

  // ---- Strands ----
  GAMES.strands = {
    mount(el, v) {
      this.el = el; this.path = []; this.tapMode = false; this.v = v;
      el.innerHTML = `
        <div class="st-theme"><small>Today's theme</small><b>${esc(v.theme)}</b></div>
        <div class="st-current" id="st-cur"></div>
        <div class="st-wrap" id="st-wrap"><div class="st-grid" id="st-grid"></div><svg id="st-svg"></svg></div>
        <div class="st-foot"><span class="muted" id="st-count"></span><button class="btn ghost small" id="st-hint">Hint</button></div>`;
      const wrap = el.querySelector('#st-wrap');
      const size = () => Math.min(el.clientWidth || 360, 420) / v.cols;
      this.cell = size();
      wrap.style.width = this.cell * v.cols + 'px';
      wrap.style.height = this.cell * v.rows + 'px';
      const grid = el.querySelector('#st-grid');
      grid.style.gridTemplateColumns = `repeat(${v.cols}, ${this.cell}px)`;
      grid.style.gridAutoRows = this.cell + 'px';
      grid.innerHTML = v.letters.map((L, i) => `<div class="st-cell" data-i="${i}"><span>${L}</span></div>`).join('');
      el.querySelector('#st-svg').setAttribute('viewBox', `0 0 ${this.cell * v.cols} ${this.cell * v.rows}`);
      el.querySelector('#st-hint').onclick = async () => { const r = await act({ type: 'hint' }); if (r.msg) toast(r.msg, r.tone); };

      const cellAt = (x, y) => {
        const rect = wrap.getBoundingClientRect();
        const cx = (x - rect.left) / this.cell, cy = (y - rect.top) / this.cell;
        const c = Math.floor(cx), r = Math.floor(cy);
        if (c < 0 || r < 0 || c >= v.cols || r >= v.rows) return -1;
        const dx = cx - c - 0.5, dy = cy - r - 0.5;
        if (Math.hypot(dx, dy) > 0.42) return -1; // stay near centres so diagonals work
        return r * v.cols + c;
      };
      const adj = (a, b) => { const ra = Math.floor(a / v.cols), ca = a % v.cols, rb = Math.floor(b / v.cols), cb = b % v.cols; return a !== b && Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1; };
      let dragging = false, moved = false;
      wrap.addEventListener('pointerdown', e => {
        const i = cellAt(e.clientX, e.clientY); if (i < 0) return;
        e.preventDefault(); wrap.setPointerCapture(e.pointerId);
        dragging = true; moved = false;
        const last = this.path[this.path.length - 1];
        if (this.tapMode && i === last) { this.submit(); dragging = false; return; }
        if (this.tapMode && this.path.length && adj(last, i) && !this.path.includes(i)) { this.path.push(i); this.draw(); return; }
        if (this.tapMode && this.path.includes(i)) { this.path = this.path.slice(0, this.path.indexOf(i) + 1); this.draw(); return; }
        this.tapMode = false; this.path = [i]; this.draw();
      });
      wrap.addEventListener('pointermove', e => {
        if (!dragging) return;
        const i = cellAt(e.clientX, e.clientY); if (i < 0) return;
        const p = this.path, last = p[p.length - 1];
        if (i === last) return;
        if (p.length > 1 && i === p[p.length - 2]) { p.pop(); moved = true; this.draw(); return; }
        if (!p.includes(i) && adj(last, i)) { p.push(i); moved = true; this.draw(); }
      });
      const up = () => {
        if (!dragging) return; dragging = false;
        if (moved && this.path.length > 1) { this.submit(); return; }
        this.tapMode = true; this.draw();
      };
      wrap.addEventListener('pointerup', up);
      wrap.addEventListener('pointercancel', up);
    },
    async submit() {
      const cells = this.path.slice();
      this.path = []; this.tapMode = false; this.draw();
      if (cells.length < 3) { toast('Too short'); return; }
      const r = await act({ type: 'select', cells });
      if (r.msg) toast(r.msg, r.ok ? 'good' : r.tone);
    },
    update(v) { this.v = v; this.draw(); },
    draw() {
      const v = this.v, el = this.el, cs = this.cell;
      const owner = {};
      v.found.forEach(f => f.cells.forEach(c => { owner[c] = f.missed ? 'missed' : f.spangram ? 'span' : 'theme'; }));
      const hint = new Set(v.hintCells);
      const sel = new Set(this.path);
      el.querySelectorAll('.st-cell').forEach(c => {
        const i = +c.dataset.i;
        c.className = 'st-cell ' + (owner[i] || '') + (sel.has(i) ? ' sel' : '') + (hint.has(i) && !owner[i] ? ' hint' : '');
      });
      const pt = i => [(i % v.cols + 0.5) * cs, (Math.floor(i / v.cols) + 0.5) * cs];
      const line = (cells, color) => cells.length > 1 ? `<polyline points="${cells.map(pt).map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${cs * 0.2}" stroke-linecap="round" stroke-linejoin="round"/>` : '';
      el.querySelector('#st-svg').innerHTML =
        v.found.map(f => line(f.cells, f.missed ? '#EFEAE0' : f.spangram ? '#F8CD05' : '#AEDFEE')).join('') + line(this.path, '#CFC8BA');
      el.querySelector('#st-cur').textContent = this.path.map(i => v.letters[i]).join('');
      el.querySelector('#st-count').innerHTML = `<b>${v.found.filter(f => !f.missed).length}</b> of <b>${v.total}</b> theme words found`;
      el.querySelector('#st-hint').disabled = v.hintCells.length > 0;
    },
  };

  // ---- Krillion ----
  GAMES.krillion = {
    mount(el, v) {
      this.el = el; this.idx = -1;
      el.innerHTML = `
        <div class="kr">
          <div class="kr-top"><span id="kr-n"></span><span id="kr-bonus"></span></div>
          <div style="display:flex;gap:14px;align-items:flex-start;justify-content:space-between">
            <div class="kr-prompt" id="kr-p"></div>
            <div class="kr-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="3"/><circle id="kr-arc" cx="18" cy="18" r="15.5" fill="none" stroke="#7FD3FF" stroke-width="3" stroke-linecap="round" stroke-dasharray="97.4" stroke-dashoffset="0"/></svg><b id="kr-s"></b></div>
          </div>
          <form id="kr-f" style="display:grid;gap:10px"><input class="field" id="kr-in" placeholder="Your answer" autocomplete="off" spellcheck="false">
            <div style="display:flex;gap:8px"><button class="btn" style="flex:1">Dive</button><button type="button" class="btn ghost" id="kr-skip">Skip</button></div></form>
          <div class="kr-legend"><span class="tier surface">Surface · 0s</span><span class="tier deep">Deep · −${v.tierBonus.deep}s</span><span class="tier abyss">Abyss · −${v.tierBonus.abyss}s</span></div>
        </div>
        <div class="kr-list" id="kr-list"></div>`;
      const f = el.querySelector('#kr-f'), inp = el.querySelector('#kr-in');
      f.addEventListener('submit', async e => {
        e.preventDefault(); if (!inp.value.trim()) return;
        const r = await act({ type: 'answer', text: inp.value });
        if (r.ok) { inp.value = ''; toast(`${r.msg} · ${r.tier.toUpperCase()}`, 'good'); }
        else if (r.msg) toast(r.msg, 'bad');
        inp.focus();
      });
      el.querySelector('#kr-skip').onclick = async () => { const r = await act({ type: 'skip' }); if (r.msg) toast(r.msg, r.tone); inp.value = ''; inp.focus(); };
      setTimeout(() => inp.focus(), 50);
    },
    update(v) {
      this.v = v; const el = this.el;
      el.querySelector('#kr-n').textContent = `PROMPT ${Math.min(v.index + 1, v.total)} / ${v.total}`;
      el.querySelector('#kr-bonus').textContent = v.bonus ? `−${v.bonus}s earned` : '';
      el.querySelector('#kr-p').textContent = v.prompt || '';
      el.querySelector('#kr-list').innerHTML = v.answers.slice().reverse().map(a => `<div class="kr-item"><div>${a.answer ? esc(a.answer) : `<span class="muted">${a.timeout ? 'Timed out' : 'Skipped'}</span>`}<small>${esc(a.prompt)}</small></div><span class="tier ${a.tier || 'none'}">${a.tier ? a.tier + (v.tierBonus[a.tier] ? ' −' + v.tierBonus[a.tier] + 's' : '') : '+' + v.skipPenalty + 's'}</span></div>`).join('');
    },
    tick() {
      const v = this.v; if (!v) return;
      const left = Math.max(0, (v.promptEndsAt - now()) / 1000);
      const s = this.el.querySelector('#kr-s'); if (!s) return;
      s.textContent = Math.ceil(left);
      this.el.querySelector('#kr-arc').setAttribute('stroke-dashoffset', 97.4 * (1 - left / v.perPrompt));
      this.el.querySelector('#kr-arc').setAttribute('stroke', left < 8 ? '#FF8A7A' : '#7FD3FF');
    },
  };

  // ---- Rapid fire ----
  GAMES.rapid = {
    mount(el) {
      this.el = el;
      el.innerHTML = `
        <div class="rf-dots" id="rf-dots"></div>
        <div class="rf-card" id="rf-card"><small id="rf-n"></small><p id="rf-q"></p></div>
        <form id="rf-f" style="display:grid;gap:10px"><input class="field" id="rf-in" placeholder="Type your answer" autocomplete="off" spellcheck="false">
          <div style="display:flex;gap:8px"><button class="btn" style="flex:1">Answer</button><button type="button" class="btn ghost" id="rf-skip">Skip</button></div></form>`;
      const inp = el.querySelector('#rf-in'), card = el.querySelector('#rf-card');
      const flash = c => { card.classList.remove('flash-good', 'flash-bad'); void card.offsetWidth; card.classList.add(c); };
      el.querySelector('#rf-f').addEventListener('submit', async e => {
        e.preventDefault(); if (!inp.value.trim()) return;
        const r = await act({ type: 'answer', text: inp.value });
        if (r.ok) { inp.value = ''; flash('flash-good'); } else { flash('flash-bad'); if (r.msg) toast(r.msg, 'bad'); inp.select(); }
        inp.focus();
      });
      el.querySelector('#rf-skip').onclick = async () => { const r = await act({ type: 'skip' }); if (r.msg) toast(r.msg, 'bad'); inp.value = ''; inp.focus(); };
      setTimeout(() => inp.focus(), 50);
    },
    update(v) {
      const el = this.el;
      el.querySelector('#rf-dots').innerHTML = Array.from({ length: v.total }, (_, i) => { const r = v.results[i]; return `<i class="${r ? (r.correct ? 'ok' : 'skip') : i === v.index ? 'now' : ''}"></i>`; }).join('');
      el.querySelector('#rf-n').textContent = `Question ${Math.min(v.index + 1, v.total)} of ${v.total}`;
      el.querySelector('#rf-q').textContent = v.q || '';
      el.querySelector('#rf-skip').textContent = `Skip +${v.skipPenalty}s`;
    },
  };

  // ---------------- boot ----------------
  if (token) connect(); else renderJoin();
  // ping every 4 min so free hosting (e.g. Render) never sleeps mid-event
  setInterval(() => { fetch('/api/ping', { cache: 'no-store' }).catch(() => {}); }, 240000);
})();
