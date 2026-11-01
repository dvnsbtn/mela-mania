// Word-ladder helpers for Melale (Poople-style: change one letter at a time to reach MELA).
const raw = require('./words.json');
const COMMON = new Set(raw.common.split(' '));
const ALL = new Set([...COMMON, ...raw.extra.split(' ')]);

const clean = w => String(w || '').toLowerCase().replace(/[^a-z]/g, '');
const isWord = (w, target) => w === target || ALL.has(w);
const oneApart = (a, b) => a.length === b.length && [...a].filter((c, i) => c !== b[i]).length === 1;

// shortest ladder using everyday words first, then the full list
function shortestPath(from, target, avoid) {
  for (const dict of [COMMON, ALL]) {
    const prev = { [from]: null }, q = [from];
    for (const a of avoid || []) if (a !== from) prev[a] = undefined; // never route through words already used
    while (q.length) {
      const w = q.shift();
      if (w === target) { const p = []; for (let x = w; x; x = prev[x]) p.unshift(x); return p; }
      for (let i = 0; i < w.length; i++) {
        for (const c of 'abcdefghijklmnopqrstuvwxyz') {
          const n = w.slice(0, i) + c + w.slice(i + 1);
          if ((n === target || dict.has(n)) && !(n in prev)) { prev[n] = w; q.push(n); }
        }
      }
    }
  }
  return null;
}

module.exports = { clean, isWord, oneApart, shortestPath };
