// Strands grid generator: packs the theme words + spangram into a rows x cols
// grid so that every cell is used exactly once, words follow 8-way adjacent
// paths, paths never cross diagonally, and the spangram touches two opposite sides.

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeGrid(rows, cols) {
  const nb = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const list = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) list.push(rr * cols + cc);
        }
      }
      nb.push(list);
    }
  }
  return nb;
}

// key of the diagonal used by a move a->b, and the key that would cross it
function diagKeys(a, b, cols) {
  const r1 = Math.floor(a / cols), c1 = a % cols, r2 = Math.floor(b / cols), c2 = b % cols;
  if (r1 === r2 || c1 === c2) return null;
  const top = Math.min(r1, r2), left = Math.min(c1, c2);
  const backslash = (r2 - r1) === (c2 - c1); // "\" orientation
  const sq = top + ':' + left;
  return { used: sq + (backslash ? '\\' : '/'), cross: sq + (backslash ? '/' : '\\') };
}

function subsetSums(lengths) {
  let sums = new Set([0]);
  for (const l of lengths) {
    const next = new Set(sums);
    for (const s of sums) next.add(s + l);
    sums = next;
  }
  return sums;
}

function generateStrands(spangram, words, opts = {}) {
  const rows = opts.rows || 8, cols = opts.cols || 6, N = rows * cols;
  spangram = spangram.toUpperCase().replace(/[^A-Z]/g, '');
  words = words.map(w => w.toUpperCase().replace(/[^A-Z]/g, ''));
  const total = spangram.length + words.reduce((s, w) => s + w.length, 0);
  if (total !== N) {
    throw new Error(`Letters must add up to exactly ${N} (yours add up to ${total}).`);
  }
  if (spangram.length < Math.min(rows, cols)) {
    throw new Error(`The spangram needs at least ${Math.min(rows, cols)} letters to cross the board.`);
  }
  for (const w of words) if (w.length < 3) throw new Error(`"${w}" is too short — use words of 3+ letters.`);

  const nb = makeGrid(rows, cols);
  const deadline = Date.now() + (opts.timeoutMs || 6000);

  for (let attempt = 0; Date.now() < deadline; attempt++) {
    const owner = new Array(N).fill(-1);
    const diag = new Set();
    let budget = 40000;

    const emptyNeighbours = i => nb[i].reduce((n, j) => n + (owner[j] === -1 ? 1 : 0), 0);

    const componentsOk = remaining => {
      if (!remaining.length) return true;
      const lens = remaining.map(w => w.length);
      const minLen = Math.min(...lens);
      const sums = subsetSums(lens);
      const seen = new Array(N).fill(false);
      for (let i = 0; i < N; i++) {
        if (owner[i] !== -1 || seen[i]) continue;
        let size = 0; const stack = [i]; seen[i] = true;
        while (stack.length) {
          const x = stack.pop(); size++;
          for (const y of nb[x]) if (owner[y] === -1 && !seen[y]) { seen[y] = true; stack.push(y); }
        }
        if (size < minLen || !sums.has(size)) return false;
      }
      return true;
    };

    // grow a path of length L from `start`; calls onComplete(path) and returns true to stop
    const growPath = (path, L, accept, onComplete) => {
      if (--budget < 0) return false;
      if (path.length === L) return accept(path) && onComplete(path);
      const last = path[path.length - 1];
      for (const n of shuffle(nb[last].slice())) {
        if (owner[n] !== -1 || path.includes(n)) continue;
        const dk = diagKeys(last, n, cols);
        if (dk && (diag.has(dk.cross) || diag.has(dk.used))) continue;
        if (dk) diag.add(dk.used);
        path.push(n);
        if (growPath(path, L, accept, onComplete)) return true;
        path.pop();
        if (dk) diag.delete(dk.used);
      }
      return false;
    };

    const place = (path, wid) => path.forEach(i => { owner[i] = wid; });
    const unplace = path => path.forEach(i => { owner[i] = -1; });

    const placed = {}; // word -> path
    const all = [spangram, ...words];

    const fill = remainingIdx => {
      if (!remainingIdx.length) return true;
      if (budget < 0) return false;
      // most constrained empty cell
      let best = -1, bestN = 99;
      for (let i = 0; i < N; i++) {
        if (owner[i] !== -1) continue;
        const e = emptyNeighbours(i);
        if (e < bestN || (e === bestN && Math.random() < 0.3)) { best = i; bestN = e; }
      }
      for (const wi of shuffle(remainingIdx.slice())) {
        const word = all[wi];
        const rest = remainingIdx.filter(x => x !== wi);
        for (const reversed of shuffle([false, true])) {
          const ok = growPath([best], word.length, () => true, path => {
            place(path, wi);
            if (componentsOk(rest.map(x => all[x])) && fill(rest)) {
              placed[word] = reversed ? path.slice().reverse() : path.slice();
              return true;
            }
            unplace(path);
            return false;
          });
          if (ok) return true;
          if (budget < 0) return false;
        }
      }
      return false;
    };

    // place the spangram so it touches two opposite sides
    const orientations = [];
    if (spangram.length >= cols) orientations.push('lr');
    if (spangram.length >= rows) orientations.push('tb');
    const orient = orientations[Math.floor(Math.random() * orientations.length)];
    const startCells = [], isEnd = {};
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      if (orient === 'lr' && c === 0) startCells.push(i);
      if (orient === 'tb' && r === 0) startCells.push(i);
      if (orient === 'lr' && c === cols - 1) isEnd[i] = true;
      if (orient === 'tb' && r === rows - 1) isEnd[i] = true;
    }
    const start = startCells[Math.floor(Math.random() * startCells.length)];
    const rev = Math.random() < 0.5;
    const restIdx = words.map((_, i) => i + 1);
    const success = growPath([start], spangram.length, p => isEnd[p[p.length - 1]], path => {
      place(path, 0);
      if (componentsOk(words) && fill(restIdx)) {
        placed[spangram] = rev ? path.slice().reverse() : path.slice();
        return true;
      }
      unplace(path);
      return false;
    });
    if (!success) continue;

    const letters = new Array(N).fill('');
    for (const [w, p] of Object.entries(placed)) p.forEach((cell, k) => { letters[cell] = w[k]; });
    return { rows, cols, letters, paths: placed, attempts: attempt + 1 };
  }
  throw new Error('Could not fit these words into the grid — try different words or press Regenerate.');
}

module.exports = { generateStrands };
