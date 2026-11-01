// Server-side game engines. Answers never leave the server until a team has
// solved (or failed) them, and every timestamp comes from the server clock.

const norm = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// forgiving match: exact after normalising, or a small typo on longer answers
function matches(input, answer) {
  const a = norm(input), b = norm(answer);
  if (!a) return false;
  if (a === b) return true;
  if (/^\d+$/.test(b)) return false;
  const tol = b.length >= 9 ? 2 : b.length >= 5 ? 1 : 0;
  return tol > 0 && lev(a, b) <= tol;
}

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fail = msg => ({ ok: false, msg });
const ladder = require('./ladder');

const ENGINES = {
  hangman: {
    maxWrong: 6,
    init: () => ({ i: 0, guessed: [], wrong: 0, results: [], penalty: 0 }),
    progress: (c, st) => `Word ${Math.min(st.i + 1, c.words.length)}/${c.words.length}`,
    view(c, st) {
      const cur = c.words[st.i];
      return {
        index: st.i, total: c.words.length, maxWrong: this.maxWrong, wrong: st.wrong, guessed: st.guessed,
        hint: cur ? cur.hint : '',
        masked: cur ? [...cur.word].map(ch => (/[A-Z]/.test(ch) ? (st.guessed.includes(ch) ? ch : null) : ch)) : [],
        results: st.results,
      };
    },
    act(c, st, a, s) {
      const cur = c.words[st.i];
      if (!cur) return fail('Already finished');
      const next = (solved) => {
        st.results.push({ word: cur.word, solved });
        if (!solved) st.penalty += s.hangmanMiss;
        st.i++; st.guessed = []; st.wrong = 0;
        if (st.i >= c.words.length) st.status = 'done';
        return { ok: true, msg: solved ? 'Solved!' : `Out of lives (+${s.hangmanMiss}s)`, tone: solved ? 'good' : 'bad' };
      };
      const isSolved = () => [...cur.word].every(ch => !/[A-Z]/.test(ch) || st.guessed.includes(ch));
      if (a.type === 'letter') {
        const L = String(a.letter || '').toUpperCase();
        if (!/^[A-Z]$/.test(L)) return fail('Pick a letter');
        if (st.guessed.includes(L)) return fail('Already tried');
        st.guessed.push(L);
        if (!cur.word.includes(L)) { st.wrong++; if (st.wrong >= this.maxWrong) return next(false); return { ok: true, tone: 'bad' }; }
        if (isSolved()) return next(true);
        return { ok: true, tone: 'good' };
      }
      if (a.type === 'solve') {
        if (norm(a.text) === norm(cur.word)) return next(true);
        st.wrong++;
        if (st.wrong >= this.maxWrong) return next(false);
        return { ok: false, msg: 'Not quite — that cost a life', tone: 'bad' };
      }
      return fail('Unknown move');
    },
  },

  wordle: {
    maxGuesses: 6,
    init: () => ({ guesses: [], penalty: 0 }),
    progress: (c, st) => `Guess ${Math.min(st.guesses.length + (st.status ? 0 : 1), 6)}/6`,
    view(c, st) {
      return {
        length: c.word.length, maxGuesses: this.maxGuesses, guesses: st.guesses,
        answer: st.status ? c.word : null,
      };
    },
    act(c, st, a) {
      if (a.type !== 'guess') return fail('Unknown move');
      const g = String(a.word || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (g.length !== c.word.length) return fail(`Use ${c.word.length} letters`);
      const ans = [...c.word], marks = new Array(g.length).fill('absent');
      const left = {};
      ans.forEach((ch, i) => { if (g[i] === ch) marks[i] = 'correct'; else left[ch] = (left[ch] || 0) + 1; });
      [...g].forEach((ch, i) => { if (marks[i] !== 'correct' && left[ch]) { marks[i] = 'present'; left[ch]--; } });
      st.guesses.push({ word: g, marks });
      if (g === c.word) { st.status = 'done'; return { ok: true, msg: 'Brilliant!', tone: 'good' }; }
      if (st.guesses.length >= this.maxGuesses) { st.status = 'failed'; return { ok: true, msg: c.word, tone: 'bad' }; }
      return { ok: true };
    },
  },

  melale: {
    init: c => ({ i: 0, chain: (c.ladders[0].given || [c.ladders[0].start]).slice(), hints: 0, results: [], penalty: 0 }),
    progress: (c, st) => `Stage ${Math.min(st.i + 1, c.ladders.length)}/${c.ladders.length} · ${Math.max(0, st.chain.length - ((c.ladders[st.i] || {}).given || [0]).length)} steps${st.hints ? ` · ${st.hints} hint${st.hints > 1 ? 's' : ''}` : ''}`,
    view(c, st, s) {
      const L = c.ladders[st.i];
      return {
        index: st.i, total: c.ladders.length, target: c.target,
        start: L ? L.start : null, label: L ? L.label : '', par: L ? L.par : 0, givenCount: L ? (L.given || [L.start]).length : 1,
        chain: st.chain, results: st.results, overPar: s.melaleOverPar, hintPenalty: s.melaleHint,
        solutions: st.status ? c.ladders.map(l => l.path) : null,
      };
    },
    finishLadder(c, st, s) {
      const L = c.ladders[st.i];
      const steps = st.chain.length - (L.given || [L.start]).length, over = Math.max(0, steps - L.par);
      st.penalty += over * s.melaleOverPar;
      st.results.push({ start: L.start, steps, par: L.par, chain: st.chain.slice() });
      st.i++;
      if (st.i >= c.ladders.length) { st.status = 'done'; st.chain = []; }
      else st.chain = (c.ladders[st.i].given || [c.ladders[st.i].start]).slice();
      return over ? `Made it! ${over} over par (+${over * s.melaleOverPar}s)` : 'Made it — on par!';
    },
    act(c, st, a, s) {
      const L = c.ladders[st.i];
      if (!L) return fail('Already finished');
      const target = c.target.toLowerCase();
      const last = st.chain[st.chain.length - 1].toLowerCase();
      const given = L.given || [L.start];
      if (a.type === 'undo') {
        if (st.chain.length <= given.length) return fail('Nothing to undo');
        st.chain.pop(); return { ok: true };
      }
      if (a.type === 'hint') {
        let path = ladder.shortestPath(last, target);
        if (!path) { st.chain = given.slice(); path = L.path.map(w => w.toLowerCase()); }
        st.chain.push(path[1].toUpperCase());
        st.hints++; st.penalty += s.melaleHint;
        if (path[1] === target) return { ok: true, tone: 'good', msg: this.finishLadder(c, st, s) };
        return { ok: true, msg: `Hint: ${path[1].toUpperCase()} (+${s.melaleHint}s)` };
      }
      if (a.type !== 'step') return fail('Unknown move');
      const w = ladder.clean(a.word);
      if (w.length !== target.length) return fail(`Use ${target.length} letters`);
      if (!ladder.oneApart(w, last)) return fail('Change exactly one letter');
      if (!ladder.isWord(w, target)) return fail('Not in the word list');
      if (st.chain.some(x => x.toLowerCase() === w)) return fail('Already used in this ladder');
      st.chain.push(w.toUpperCase());
      if (w === target) return { ok: true, tone: 'good', msg: this.finishLadder(c, st, s) };
      return { ok: true };
    },
  },

  connections: {
    maxMistakes: 4,
    init: c => ({ order: shuffle(c.groups.flatMap(g => g.words)), solved: [], mistakes: 0, tried: [], penalty: 0 }),
    progress: (c, st) => `${st.solved.length}/4 groups · ${st.mistakes} mistake${st.mistakes === 1 ? '' : 's'}`,
    view(c, st) {
      const solvedWords = new Set(st.solved.flatMap(i => c.groups[i].words));
      const reveal = st.status === 'failed';
      const solved = st.solved.map(i => ({ level: i, name: c.groups[i].name, words: c.groups[i].words }));
      if (reveal) c.groups.forEach((g, i) => { if (!st.solved.includes(i)) solved.push({ level: i, name: g.name, words: g.words, missed: true }); });
      return {
        remaining: reveal ? [] : st.order.filter(w => !solvedWords.has(w)),
        solved, mistakes: st.mistakes, maxMistakes: this.maxMistakes,
      };
    },
    act(c, st, a) {
      if (a.type !== 'guess') return fail('Unknown move');
      const words = [...new Set((a.words || []).map(w => String(w).toUpperCase()))];
      if (words.length !== 4) return fail('Pick exactly 4 words');
      const key = words.slice().sort().join('|');
      if (st.tried.includes(key)) return fail('Already guessed!');
      st.tried.push(key);
      const gi = c.groups.findIndex((g, i) => !st.solved.includes(i) && words.every(w => g.words.includes(w)));
      if (gi >= 0) {
        st.solved.push(gi);
        if (st.solved.length === 4) st.status = 'done';
        return { ok: true, tone: 'good', solved: gi };
      }
      st.mistakes++;
      const oneAway = c.groups.some((g, i) => !st.solved.includes(i) && words.filter(w => g.words.includes(w)).length === 3);
      if (st.mistakes >= this.maxMistakes) { st.status = 'failed'; return { ok: false, msg: 'Out of mistakes', tone: 'bad' }; }
      return { ok: false, msg: oneAway ? 'One away…' : 'Not a group', tone: 'bad' };
    },
  },

  strands: {
    init: () => ({ found: [], hint: null, hints: 0, penalty: 0 }),
    progress: (c, st) => `${st.found.length}/${c.words.length + 1} words${st.hints ? ` · ${st.hints} hint${st.hints > 1 ? 's' : ''}` : ''}`,
    view(c, st) {
      const g = c.grid;
      const showAll = !!st.status && st.status !== 'done';
      const list = showAll ? [c.spangram, ...c.words] : st.found;
      return {
        theme: c.theme, rows: g.rows, cols: g.cols, letters: g.letters,
        found: list.map(w => ({ word: w, cells: g.paths[w], spangram: w === c.spangram, missed: !st.found.includes(w) })),
        total: c.words.length + 1, hints: st.hints,
        hintCells: st.hint ? g.paths[st.hint].slice().sort((x, y) => x - y) : [],
      };
    },
    act(c, st, a, s) {
      const g = c.grid;
      if (a.type === 'hint') {
        if (st.hint) return fail('Find the highlighted word first');
        const left = [...c.words, c.spangram].filter(w => !st.found.includes(w));
        const pool = left.filter(w => w !== c.spangram);
        st.hint = (pool.length ? pool : left)[Math.floor(Math.random() * (pool.length || left.length))];
        st.hints++; st.penalty += s.strandsHint;
        return { ok: true, msg: `Hint used (+${s.strandsHint}s)` };
      }
      if (a.type !== 'select') return fail('Unknown move');
      const cells = (a.cells || []).map(Number);
      const word = cells.map(i => g.letters[i] || '').join('');
      const target = Object.keys(g.paths).find(w => {
        const p = g.paths[w];
        return p.length === cells.length && p.every((x, k) => x === cells[k]);
      });
      if (!target) return fail(word.length < 3 ? 'Too short' : 'Not a theme word');
      if (st.found.includes(target)) return fail('Already found');
      st.found.push(target);
      if (st.hint === target) st.hint = null;
      if (st.found.length === c.words.length + 1) st.status = 'done';
      return { ok: true, tone: 'good', msg: target === c.spangram ? 'SPANGRAM!' : '' };
    },
  },

  krillion: {
    init: (c, now) => ({ i: 0, started: now, answers: [], penalty: 0, bonus: 0 }),
    progress: (c, st) => `Prompt ${Math.min(st.i + 1, c.prompts.length)}/${c.prompts.length} · −${st.bonus}s bonus`,
    view(c, st, s) {
      const p = c.prompts[st.i];
      return {
        index: st.i, total: c.prompts.length, prompt: p ? p.prompt : null,
        promptEndsAt: st.started + s.krillionPrompt * 1000, perPrompt: s.krillionPrompt,
        answers: st.answers, bonus: st.bonus,
        tierBonus: { surface: 0, deep: s.krillionDeep, abyss: s.krillionAbyss }, skipPenalty: s.krillionSkip,
      };
    },
    advance(c, st, now) { st.i++; st.started = now; if (st.i >= c.prompts.length) st.status = 'done'; },
    tick(c, st, s, now) {
      if (st.status || now < st.started + s.krillionPrompt * 1000) return false;
      st.answers.push({ prompt: c.prompts[st.i].prompt, answer: null, tier: null, timeout: true });
      st.penalty += s.krillionSkip;
      this.advance(c, st, now);
      return true;
    },
    act(c, st, a, s, now) {
      const p = c.prompts[st.i];
      if (!p) return fail('Already finished');
      if (a.type === 'skip') {
        st.answers.push({ prompt: p.prompt, answer: null, tier: null });
        st.penalty += s.krillionSkip;
        this.advance(c, st, now);
        return { ok: true, msg: `Skipped (+${s.krillionSkip}s)`, tone: 'bad' };
      }
      if (a.type !== 'answer') return fail('Unknown move');
      for (const tier of ['abyss', 'deep', 'surface']) {
        const hit = p.tiers[tier].find(x => matches(a.text, x));
        if (hit) {
          const b = tier === 'abyss' ? s.krillionAbyss : tier === 'deep' ? s.krillionDeep : 0;
          st.bonus += b;
          st.answers.push({ prompt: p.prompt, answer: hit, tier });
          this.advance(c, st, now);
          return { ok: true, tone: 'good', tier, msg: hit };
        }
      }
      return fail('Not on the list — try another');
    },
  },

  rapid: {
    init: () => ({ i: 0, results: [], penalty: 0 }),
    progress: (c, st) => `Q ${Math.min(st.i + 1, c.questions.length)}/${c.questions.length} · ${st.results.filter(r => r.correct).length} right`,
    view(c, st, s) {
      const q = c.questions[st.i];
      return { index: st.i, total: c.questions.length, q: q ? q.q : null, results: st.results, skipPenalty: s.rapidSkip };
    },
    act(c, st, a, s) {
      const q = c.questions[st.i];
      if (!q) return fail('Already finished');
      const next = () => { st.i++; if (st.i >= c.questions.length) st.status = 'done'; };
      if (a.type === 'skip') {
        st.results.push({ q: q.q, correct: false, answer: q.answers[0] });
        st.penalty += s.rapidSkip; next();
        return { ok: true, msg: `Answer: ${q.answers[0]} (+${s.rapidSkip}s)`, tone: 'bad' };
      }
      if (a.type !== 'answer') return fail('Unknown move');
      if (q.answers.some(x => matches(a.text, x))) {
        st.results.push({ q: q.q, correct: true, answer: q.answers[0] }); next();
        return { ok: true, msg: 'Correct!', tone: 'good' };
      }
      return fail('Nope — try again or skip');
    },
  },
};

module.exports = { ENGINES, matches, norm };
