// Puzzle content: defaults, a plain-text format the host edits in the admin
// panel, and parsers that turn that text back into structured puzzles.
const { generateStrands } = require('./strands');

const GAMES = [
  { id: 'hangman', title: 'Hangman', blurb: 'Guess the hidden words letter by letter', defaultLimit: 240 },
  { id: 'connections', title: 'Connections', blurb: 'Sort 16 words into 4 secret groups', defaultLimit: 300 },
  { id: 'wordle', title: 'Wordle', blurb: 'Crack the word in six guesses', defaultLimit: 240 },
  { id: 'krillion', title: 'Krillion', blurb: 'Dive deep — rarer answers earn time back', defaultLimit: 240 },
  { id: 'strands', title: 'Strands', blurb: 'Find the themed words hidden in the grid', defaultLimit: 360 },
  { id: 'rapid', title: 'Rapid Fire', blurb: 'Quick questions, quicker answers', defaultLimit: 180 },
];

const DEFAULT_TEXT = {
  hangman: `# One word or phrase per line:  ANSWER | hint
BUTTERFLY | It was once a caterpillar
SNAKES AND LADDERS | A board game of ups and downs
JIGSAW | A puzzle with interlocking pieces`,

  wordle: `# The 5-letter answer (4 to 7 letters also work)
CRANE`,

  connections: `# Exactly 4 groups, easiest first:  Group name: WORD, WORD, WORD, WORD
Indian breads: NAAN, ROTI, KULCHA, BHATURA
___ball: FOOT, BASKET, SNOW, MEAT
Chess pieces: KING, QUEEN, BISHOP, ROOK
Starts with an animal: CARPET, BEARD, ANTHEM, RATIONAL`,

  strands: `# All letters must add up to exactly 48 (8 rows x 6 columns)
Theme: Game night
Spangram: GAMENIGHT
Words: SCRABBLE, MONOPOLY, CARROM, CHESS, DOMINOES, LUDO`,

  krillion: `# Start each prompt with "?" then list answers by rarity.
# surface = common (no bonus) · deep = rare (-5s) · abyss = very rare (-10s)
? A country whose name starts with B
surface: Brazil, Bangladesh, Belgium, Bhutan
deep: Bulgaria, Botswana, Bolivia, Bahrain, Belarus
abyss: Benin, Belize, Burundi, Brunei, Barbados, Burkina Faso, Bahamas, Bosnia and Herzegovina

? An Indian state capital
surface: Mumbai, Chennai, Kolkata, Bengaluru, Bangalore, Jaipur, Lucknow, Hyderabad
deep: Bhopal, Patna, Gandhinagar, Chandigarh, Thiruvananthapuram, Bhubaneswar, Raipur, Ranchi, Dehradun, Shimla
abyss: Dispur, Shillong, Imphal, Aizawl, Kohima, Agartala, Itanagar, Gangtok, Panaji, Amaravati

? A planet or dwarf planet
surface: Earth, Mars, Jupiter, Saturn, Venus, Mercury
deep: Uranus, Neptune, Pluto
abyss: Ceres, Eris, Haumea, Makemake

? A musical instrument with strings
surface: Guitar, Violin, Sitar, Piano, Cello
deep: Harp, Veena, Sarod, Ukulele, Banjo, Mandolin, Viola, Double bass, Bass guitar
abyss: Santoor, Harpsichord, Zither, Lute, Balalaika, Sarangi, Tanpura, Ektara, Dulcimer, Koto, Shamisen, Bouzouki, Lyre, Oud, Rabab, Erhu

? A unit of measurement
surface: Metre, Meter, Kilogram, Litre, Liter, Second, Inch, Foot, Mile, Gram, Centimetre, Kilometre
deep: Ohm, Volt, Watt, Ampere, Kelvin, Joule, Newton, Pascal, Hertz, Acre, Hectare
abyss: Mole, Candela, Furlong, Fathom, Parsec, Lumen, Tesla, Weber, Henry, Siemens, Becquerel, Coulomb, Farad, Angstrom, Cubit`,

  rapid: `# One question per line:  Question | answer / another accepted answer
What is the capital of Australia? | Canberra
How many sides does a hexagon have? | 6 / six
What is the largest planet in our solar system? | Jupiter
What is the chemical symbol for gold? | Au
Who wrote Romeo and Juliet? | Shakespeare / William Shakespeare
What is the currency of Japan? | Yen
What is the fastest land animal? | Cheetah
What is the square root of 144? | 12 / twelve
Which planet is known as the Red Planet? | Mars
How many players does a cricket team have on the field? | 11 / eleven`,
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
