// Rapid Fire buzzer round. The host reveals one question at a time; the first team
// to buzz gets to answer. Right: -rapidCorrect s. Wrong: +rapidWrong s for them and
// -rapidOthers s for every other team, then buzzers reopen for the teams still in.
const { matches } = require('./games');

const fresh = () => ({ q: -1, phase: 'idle', team: null, deadline: 0, locked: [], last: null, result: null, ledger: [] });

function net(b, teamId) {
  return Math.round(b.ledger.reduce((s, e) => s + (e.team === teamId ? e.delta : 0), 0) * 10) / 10;
}

function wrong(state, b, teamId, text, now) {
  const s = state.settings;
  b.ledger.push({ team: teamId, delta: s.rapidWrong, q: b.q, why: 'wrong' });
  for (const id of Object.keys(state.teams)) if (id !== teamId) b.ledger.push({ team: id, delta: -s.rapidOthers, q: b.q, why: 'bonus' });
  b.locked.push(teamId);
  b.last = { type: 'wrong', team: teamId, text, at: now };
  b.team = null;
  const stillIn = Object.keys(state.teams).filter(id => !b.locked.includes(id));
  if (stillIn.length) { b.phase = 'open'; b.result = null; }
  else { b.phase = 'closed'; b.result = { type: 'nobody' }; }
}

// returns { ok, msg } like the other engines
function teamAction(state, content, teamId, a, now) {
  const b = state.buzz, s = state.settings;
  if (a.type === 'buzz') {
    if (b.phase === 'answering') return { ok: false, msg: 'Too slow — someone beat you!' };
    if (b.phase !== 'open') return { ok: false, msg: 'Buzzers are closed' };
    if (b.locked.includes(teamId)) return { ok: false, msg: "You're out for this question" };
    b.phase = 'answering'; b.team = teamId; b.deadline = now + s.rapidAnswer * 1000;
    return { ok: true, msg: 'You buzzed first — answer now!', tone: 'good' };
  }
  if (a.type === 'answer') {
    if (b.phase !== 'answering' || b.team !== teamId) return { ok: false, msg: "It's not your turn" };
    const q = content.questions[b.q];
    const text = String(a.text || '').slice(0, 80);
    if (q.answers.some(x => matches(text, x))) {
      b.ledger.push({ team: teamId, delta: -s.rapidCorrect, q: b.q, why: 'correct' });
      b.phase = 'closed'; b.team = null;
      b.result = { type: 'correct', team: teamId, text };
      return { ok: true, msg: `Correct! −${s.rapidCorrect}s`, tone: 'good' };
    }
    wrong(state, b, teamId, text, now);
    return { ok: false, msg: `Wrong — +${s.rapidWrong}s`, tone: 'bad' };
  }
  return { ok: false, msg: 'Unknown move' };
}

function tick(state, now) {
  const b = state.buzz;
  if (b && b.phase === 'answering' && now > b.deadline) { wrong(state, b, b.team, '(ran out of time)', now); return true; }
  return false;
}

function hostAction(state, content, action) {
  const b = state.buzz, s = state.settings;
  if (action === 'next') {
    if (b.phase === 'answering') throw new Error('Wait for the team to answer first.');
    b.q++; b.team = null; b.locked = []; b.last = null; b.result = null;
    b.phase = b.q >= content.questions.length ? 'over' : 'open';
  } else if (action === 'reveal') {
    if (b.phase === 'answering') throw new Error('Wait for the team to answer first.');
    if (b.phase !== 'open') throw new Error('No open question.');
    b.phase = 'closed'; b.result = { type: 'revealed' };
  } else if (action === 'accept') {
    // host overrules the last wrong answer on this question: undo its penalties, award the point
    const l = b.last;
    if (!l || l.type !== 'wrong' || l.overruled || b.phase === 'answering') throw new Error('Nothing to overrule.');
    b.ledger.push({ team: l.team, delta: -s.rapidWrong, q: b.q, why: 'overrule' });
    for (const id of Object.keys(state.teams)) if (id !== l.team) b.ledger.push({ team: id, delta: s.rapidOthers, q: b.q, why: 'overrule' });
    b.ledger.push({ team: l.team, delta: -s.rapidCorrect, q: b.q, why: 'correct' });
    l.overruled = true;
    b.phase = 'closed'; b.team = null; b.result = { type: 'correct', team: l.team, text: l.text, overruled: true };
  }
}

// what everyone may see (the answer only once the question is closed)
function publicView(state, content, forTeam) {
  const b = state.buzz, q = content.questions[b.q];
  const name = id => (state.teams[id] || {}).name || 'A team';
  return {
    q: b.q, total: content.questions.length, phase: b.phase,
    question: q && b.phase !== 'idle' ? q.q : null,
    answer: q && b.phase === 'closed' ? q.answers[0] : null,
    team: b.team, teamName: b.team ? name(b.team) : null, deadline: b.deadline, answerSecs: state.settings.rapidAnswer,
    locked: b.locked,
    last: b.last ? { ...b.last, teamName: name(b.last.team) } : null,
    result: b.result ? { ...b.result, teamName: b.result.team ? name(b.result.team) : null } : null,
    me: forTeam || null, myNet: forTeam ? net(b, forTeam) : null,
    scores: Object.values(state.teams).map(t => ({ id: t.id, name: t.name, net: net(b, t.id) })).sort((x, y) => x.net - y.net || x.name.localeCompare(y.name)),
    rules: { correct: state.settings.rapidCorrect, wrong: state.settings.rapidWrong, others: state.settings.rapidOthers },
  };
}

module.exports = { fresh, net, teamAction, hostAction, tick, publicView };
