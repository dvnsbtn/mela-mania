// Puzzle content: defaults, a plain-text format the host edits in the admin
// panel, and parsers that turn that text back into structured puzzles.
const { generateStrands } = require('./strands');
const ladder = require('./ladder');

const GAMES = [
  { id: 'hangman', title: 'Hangman', blurb: 'Guess the hidden words letter by letter', defaultLimit: 300 },
  { id: 'connections', title: 'Connections', blurb: 'Sort 16 words into 4 secret groups', defaultLimit: 300 },
  { id: 'melale', title: 'Melale', blurb: 'Two stages: change one letter at a time until you reach MELA', defaultLimit: 360 },
  { id: 'krillion', title: 'Krillion', blurb: 'Dive deep — rarer answers earn time back', defaultLimit: 240 },
  { id: 'strands', title: 'Strands', blurb: 'Find the themed words hidden in the grid', defaultLimit: 360 },
  { id: 'rapid', title: 'Rapid Fire', blurb: 'Buzzer round — first to buzz answers. Right −60s, wrong +10s', defaultLimit: 600 },
];

const DEFAULT_TEXT = {
  hangman: `# One word or phrase per line:  ANSWER | hint
SHOLAY | Movies: the 1975 classic with Jai and Veeru
KAUN BANEGA CROREPATI | Entertainment: the quiz show Amitabh Bachchan hosts
GITANJALI | Literature: Tagore's Nobel-winning collection
MONA LISA | Art: Da Vinci's most famous portrait`,

  wordle: `# The 5-letter answer (4 to 7 letters also work)
OSCAR`,

  melale: `# Target word, then one starting word per line:  START | label
# Each step changes exactly one letter and must be a real English word.
# Starting words don't have to be real words, but every step after them does.
# Use ">" to show fixed opening rows: players start from the last one.
Target: MELA
ELAS
FMAC > FACE`,

  connections: `# Exactly 4 groups, easiest first:  Group name: WORD, WORD, WORD, WORD
Painters: MONET, DALI, KAHLO, VERMEER
Shakespeare plays: HAMLET, MACBETH, OTHELLO, TEMPEST
Streaming platforms: NETFLIX, HOTSTAR, SONYLIV, ZEE5
Bollywood films based on Shakespeare: HAIDER, MAQBOOL, OMKARA, ANGOOR`,

  strands: `# All letters must add up to exactly 48 (8 rows x 6 columns)
Theme: Lights, camera, India!
Spangram: BOLLYWOOD
Words: SHOLAY, LAGAAN, DANGAL, DEVDAS, SWADES, BARFI, PIKU`,

  krillion: `# Start each prompt with "?" then list answers by rarity.
# surface = common (no bonus) · deep = rare (-5s) · abyss = very rare (-10s)
? MOVIES · A film directed by Christopher Nolan
surface: Inception, Interstellar, The Dark Knight, Oppenheimer
deep: Memento, The Prestige, Dunkirk, Tenet, Batman Begins, The Dark Knight Rises
abyss: Following, Insomnia, The Odyssey

? ENTERTAINMENT · A character from the sitcom Friends
surface: Ross, Rachel, Monica, Chandler, Joey, Phoebe
deep: Gunther, Janice, Mike, Richard, Carol, Ursula
abyss: Susan, Emily, Estelle, Jack Geller, Judy Geller, Mr Heckles, Marcel, Tag

? LITERATURE · A novel by Jane Austen
surface: Pride and Prejudice, Emma, Sense and Sensibility
deep: Persuasion, Mansfield Park, Northanger Abbey
abyss: Lady Susan, Sanditon, The Watsons

? ART · A painting by Vincent van Gogh
surface: The Starry Night, Starry Night, Sunflowers
deep: Cafe Terrace at Night, The Potato Eaters, Irises, Bedroom in Arles, The Bedroom, Almond Blossoms
abyss: Wheatfield with Crows, The Night Cafe, Self-Portrait with Bandaged Ear, Starry Night Over the Rhone, The Yellow House

? MOVIES · A film directed by Rajkumar Hirani
surface: 3 Idiots, Three Idiots, PK, Munna Bhai MBBS
deep: Lage Raho Munna Bhai, Sanju
abyss: Dunki`,

  rapid: `# One question per line:  Question | answer / another accepted answer
The song "Jai Ho" won an Oscar for which film? | Slumdog Millionaire
Who painted the ceiling of the Sistine Chapel? | Michelangelo
Who wrote The God of Small Things? | Arundhati Roy / Roy
Which Indian film's song "Naatu Naatu" won an Oscar in 2023? | RRR
In which city is the Louvre museum? | Paris
Who wrote Malgudi Days? | R. K. Narayan / RK Narayan / Narayan
Which actor played the villain Mogambo in Mr. India? | Amrish Puri
Which Indian painter was called the "Picasso of India"? | M. F. Husain / MF Husain / Husain
Who created Sherlock Holmes? | Arthur Conan Doyle / Conan Doyle / Doyle
Which Netflix show features a place called the Upside Down? | Stranger Things`,
};

const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const list = s => s.split(',').map(x => x.trim()).filter(Boolean);

const PARSERS = {
  hangman(text) {
    const words = lines(text).map(l => {
      const [answer, ...hint] = l.split('|');
      const word = answer.trim().toUpperCase();
      if (!/[A-Z]/.test(word)) throw new Error(`"${l}" has no letters to guess.`);
      return { word, hint: hint.join('|').trim() };
    });
    if (!words.length) throw new Error('Add at least one word.');
    return { words };
  },
  wordle(text) {
    const w = (lines(text)[0] || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (w.length < 4 || w.length > 7) throw new Error('The Wordle answer must be 4 to 7 letters.');
    return { word: w };
  },
  melale(text) {
    let target = 'mela';
    const ladders = [];
    for (const l of lines(text)) {
      const m = l.match(/^target\s*:(.*)$/i);
      if (m) { target = ladder.clean(m[1]); continue; }
      const [startRaw, ...label] = l.split('|');
      const given = startRaw.split('>').map(ladder.clean).filter(Boolean);
      const start = given[given.length - 1] || '';
      for (const g of given) if (g.length !== target.length) throw new Error(`"${g.toUpperCase()}" must have ${target.length} letters, like ${target.toUpperCase()}.`);
      if (start === target) throw new Error('A starting word can\'t be the target itself.');
      const path = ladder.shortestPath(start, target);
      if (!path) throw new Error(`There's no ladder from ${start.toUpperCase()} to ${target.toUpperCase()} — no real word is reachable by changing one letter. Try another start.`);
      ladders.push({ start: start.toUpperCase(), given: given.map(w => w.toUpperCase()), label: label.join('|').trim(), par: path.length - 1, path: path.map(w => w.toUpperCase()) });
    }
    if (target.length < 3 || target.length > 6) throw new Error('The target must be 3 to 6 letters.');
    if (!ladders.length) throw new Error('Add at least one starting word.');
    return { target: target.toUpperCase(), ladders };
  },
  connections(text) {
    const groups = lines(text).map(l => {
      const i = l.indexOf(':');
      if (i < 0) throw new Error(`"${l}" needs a group name followed by a colon.`);
      const words = list(l.slice(i + 1)).map(w => w.toUpperCase());
      if (words.length !== 4) throw new Error(`"${l.slice(0, i)}" needs exactly 4 words (has ${words.length}).`);
      return { name: l.slice(0, i).trim(), words };
    });
    if (groups.length !== 4) throw new Error(`You need exactly 4 groups (found ${groups.length}).`);
    const all = groups.flatMap(g => g.words);
    const dup = all.find((w, i) => all.indexOf(w) !== i);
    if (dup) throw new Error(`"${dup}" appears twice — every word must be unique.`);
    return { groups };
  },
  strands(text) {
    const get = key => {
      const l = lines(text).find(x => x.toLowerCase().startsWith(key + ':'));
      return l ? l.slice(key.length + 1).trim() : '';
    };
    const theme = get('theme'), spangram = get('spangram'), words = list(get('words'));
    if (!theme) throw new Error('Add a "Theme:" line.');
    if (!spangram) throw new Error('Add a "Spangram:" line.');
    if (words.length < 2) throw new Error('Add at least 2 theme words on the "Words:" line.');
    const grid = generateStrands(spangram, words);
    return {
      theme,
      spangram: spangram.toUpperCase().replace(/[^A-Z]/g, ''),
      words: words.map(w => w.toUpperCase().replace(/[^A-Z]/g, '')),
      grid,
    };
  },
  krillion(text) {
    const prompts = [];
    for (const l of lines(text)) {
      if (l.startsWith('?')) { prompts.push({ prompt: l.slice(1).trim(), tiers: { surface: [], deep: [], abyss: [] } }); continue; }
      const m = l.match(/^(surface|deep|abyss)\s*:(.*)$/i);
      if (!m) throw new Error(`Couldn't read "${l}". Use "surface:", "deep:" or "abyss:".`);
      if (!prompts.length) throw new Error('Start with a prompt line beginning with "?".');
      prompts[prompts.length - 1].tiers[m[1].toLowerCase()].push(...list(m[2]));
    }
    if (!prompts.length) throw new Error('Add at least one prompt.');
    for (const p of prompts) {
      if (!p.tiers.surface.length && !p.tiers.deep.length && !p.tiers.abyss.length) {
        throw new Error(`"${p.prompt}" has no answers.`);
      }
    }
    return { prompts };
  },
  rapid(text) {
    const questions = lines(text).map(l => {
      const [q, a] = l.split('|');
      if (!a) throw new Error(`"${l}" needs answers after a "|".`);
      return { q: q.trim(), answers: a.split('/').map(x => x.trim()).filter(Boolean) };
    });
    if (!questions.length) throw new Error('Add at least one question.');
    return { questions };
  },
};

function defaultContent() {
  const content = {}, text = {};
  for (const g of GAMES) { text[g.id] = DEFAULT_TEXT[g.id]; content[g.id] = PARSERS[g.id](DEFAULT_TEXT[g.id]); }
  return { content, text };
}

module.exports = { GAMES, DEFAULT_TEXT, PARSERS, defaultContent };
