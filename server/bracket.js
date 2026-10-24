// Builds a knockout bracket from a competition's matches (any provider).
// Two-legged ties are merged and shown with the aggregate score. Nothing is invented:
// a tie without a known winner stays open.
const STAGES = [
  [/play-?off/i, 'po', 'Play-offs', 0],
  [/round of 32|last.?32|1\/16/i, 'r32', 'Round of 32', 1],
  [/round of 16|last.?16|8th finals|1\/8/i, 'r16', 'Round of 16', 2],
  [/quarter/i, 'qf', 'Quarter-finals', 3],
  [/semi/i, 'sf', 'Semi-finals', 4],
  [/3rd|third/i, 'third', 'Third place', 5],
  [/^final$|^final\b|\bfinal$/i, 'final', 'Final', 6],
];

export function stageOf(round) {
  const r = String(round || '').trim();
  if (!r) return null;
  for (const [re, key, label, order] of STAGES) if (re.test(r)) return { key, label, order };
  return null;
}

export function buildBracket(matches) {
  const byStage = new Map();
  for (const m of matches) {
    const st = stageOf(m.stage || (m.comp && m.comp.round));
    if (!st) continue;
    if (!byStage.has(st.key)) byStage.set(st.key, { ...st, ties: new Map() });
    const pair = [m.home.id ?? m.home.name, m.away.id ?? m.away.name].map(String).sort().join('|');
    const g = byStage.get(st.key).ties;
    if (!g.has(pair)) g.set(pair, []);
    g.get(pair).push(m);
  }
  const rounds = [...byStage.values()].sort((a, b) => a.order - b.order).map((r) => ({
    key: r.key, label: r.label,
    ties: [...r.ties.values()].map((legs) => tie(legs.sort((x, y) => String(x.kickoff).localeCompare(String(y.kickoff))))),
  }));
  return { rounds, hasBracket: rounds.length > 0 };
}

function tie(legs) {
  const first = legs[0];
  const A = first.home, B = first.away;
  const idA = String(A.id ?? A.name);
  let ga = 0, gb = 0, complete = true;
  for (const l of legs) {
    if (!l.score || l.score.home == null) { complete = false; continue; }
    if (l.state !== 'post') complete = false;
    const homeIsA = String(l.home.id ?? l.home.name) === idA;
    ga += homeIsA ? l.score.home : l.score.away;
    gb += homeIsA ? l.score.away : l.score.home;
  }
  const last = legs[legs.length - 1];
  let winner = null;
  if (complete) {
    if (last.winner && last.winner !== 'draw' && (last.pen || legs.length === 1 || ga === gb)) {
      const w = last.winner === 'home' ? last.home : last.away;
      winner = String(w.id ?? w.name) === idA ? 'a' : 'b';
    } else if (ga !== gb) winner = ga > gb ? 'a' : 'b';
  }
  const anyScore = legs.some((l) => l.score && l.score.home != null);
  return {
    a: A, b: B,
    agg: anyScore ? { a: ga, b: gb } : null,
    pen: last.pen ? (String(last.home.id ?? last.home.name) === idA ? { a: last.pen.home, b: last.pen.away } : { a: last.pen.away, b: last.pen.home }) : null,
    winner,
    live: legs.some((l) => l.state === 'live'),
    legs: legs.map((l) => ({ id: l.id, kickoff: l.kickoff, state: l.state, status: l.status, home: l.home, away: l.away, score: l.score })),
  };
}
