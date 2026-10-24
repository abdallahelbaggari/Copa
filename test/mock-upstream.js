// TEST ONLY — fake upstream responses in each provider's real response shape, so the
// whole pipeline (adapter → cache → router → UI) can be exercised without API keys.
// None of this ships to production.
const now = Date.now();
const iso = (minsFromNow) => new Date(now + minsFromNow * 60000).toISOString();

/* ---------------- football-data.org v4 shapes ---------------- */
const fdComp = {
  2021: { id: 2021, name: 'Premier League', code: 'PL', emblem: null, area: 'England' },
  2014: { id: 2014, name: 'Primera Division', code: 'PD', emblem: null, area: 'Spain' },
  2001: { id: 2001, name: 'UEFA Champions League', code: 'CL', emblem: null, area: 'Europe' },
};
const fdTeam = (id, name, short, tla) => ({ id, name, shortName: short, tla, crest: null });
const T = {
  ars: fdTeam(57, 'Arsenal FC', 'Arsenal', 'ARS'), che: fdTeam(61, 'Chelsea FC', 'Chelsea', 'CHE'),
  liv: fdTeam(64, 'Liverpool FC', 'Liverpool', 'LIV'), mci: fdTeam(65, 'Manchester City FC', 'Man City', 'MCI'),
  tot: fdTeam(73, 'Tottenham Hotspur FC', 'Tottenham', 'TOT'), new: fdTeam(67, 'Newcastle United FC', 'Newcastle', 'NEW'),
  rma: fdTeam(86, 'Real Madrid CF', 'Real Madrid', 'RMA'), fcb: fdTeam(81, 'FC Barcelona', 'Barça', 'FCB'),
  ath: fdTeam(77, 'Athletic Club', 'Athletic', 'ATH'), vil: fdTeam(94, 'Villarreal CF', 'Villarreal', 'VIL'),
  bay: fdTeam(5, 'FC Bayern München', 'Bayern', 'FCB'), psg: fdTeam(524, 'Paris Saint-Germain FC', 'PSG', 'PSG'),
  int: fdTeam(108, 'FC Internazionale Milano', 'Inter', 'INT'), juv: fdTeam(109, 'Juventus FC', 'Juventus', 'JUV'),
  bvb: fdTeam(4, 'Borussia Dortmund', 'Dortmund', 'BVB'), atm: fdTeam(78, 'Club Atlético de Madrid', 'Atlético', 'ATM'),
};
function fdMatch(id, comp, h, a, status, mins, ft, ht, extra = {}) {
  return {
    id, utcDate: iso(mins), status, matchday: 8, stage: 'REGULAR_SEASON',
    competition: { id: comp, name: fdComp[comp].name, code: fdComp[comp].code, emblem: null },
    area: { name: fdComp[comp].area },
    homeTeam: h, awayTeam: a,
    score: { winner: ft ? (ft[0] > ft[1] ? 'HOME_TEAM' : ft[0] < ft[1] ? 'AWAY_TEAM' : 'DRAW') : null, duration: 'REGULAR',
      fullTime: { home: ft ? ft[0] : null, away: ft ? ft[1] : null }, halfTime: { home: ht ? ht[0] : null, away: ht ? ht[1] : null } },
    referees: [{ id: 1, name: 'Michael Oliver', type: 'REFEREE' }], venue: 'Emirates Stadium',
    goals: [], bookings: [], substitutions: [],
    ...extra,
  };
}
const fdMatches = [
  fdMatch(1001, 2021, T.ars, T.che, 'IN_PLAY', -70, [2, 1], [1, 0], { minute: 67 }),
  fdMatch(1002, 2021, T.liv, T.mci, 'PAUSED', -50, [0, 0], [0, 0]),
  fdMatch(1003, 2021, T.tot, T.new, 'FINISHED', -200, [3, 3], [1, 2]),
  fdMatch(1004, 2014, T.rma, T.fcb, 'TIMED', 180, null, null),
  fdMatch(1005, 2014, T.ath, T.vil, 'POSTPONED', 60, null, null),
  fdMatch(1006, 2001, T.mci, T.rma, 'TIMED', 60 * 26, null, null),
  fdMatch(1007, 2021, T.new, T.liv, 'TIMED', 60 * 50, null, null),
  fdMatch(1008, 2021, T.che, T.tot, 'TIMED', 60 * 74, null, null),
];
// UEFA Champions League knockouts (two legs)
const D = 60 * 24;
const ko = (id, h, a, stage, mins, ft, extra = {}) => fdMatch(id, 2001, h, a, ft ? 'FINISHED' : 'TIMED', mins, ft, ft ? [0, 0] : null, { matchday: null, stage, ...extra });
const fdKO = [
  ko(2101, T.psg, T.liv, 'LAST_16', -40 * D, [1, 0]), ko(2102, T.liv, T.psg, 'LAST_16', -33 * D, [1, 0], { score: { winner: 'AWAY_TEAM', duration: 'PENALTY_SHOOTOUT', fullTime: { home: 1, away: 0 }, regularTime: { home: 1, away: 0 }, halfTime: { home: 0, away: 0 }, penalties: { home: 1, away: 4 } } }),
  ko(2103, T.rma, T.atm, 'LAST_16', -40 * D, [2, 1]), ko(2104, T.atm, T.rma, 'LAST_16', -33 * D, [1, 1]),
  ko(2105, T.bvb, T.juv, 'LAST_16', -39 * D, [2, 0]), ko(2106, T.juv, T.bvb, 'LAST_16', -32 * D, [1, 1]),
  ko(2107, T.bay, T.int, 'LAST_16', -39 * D, [1, 2]), ko(2108, T.int, T.bay, 'LAST_16', -32 * D, [2, 2]),
  ko(2201, T.psg, T.rma, 'QUARTER_FINALS', -5 * D, [2, 1]), ko(2202, T.rma, T.psg, 'QUARTER_FINALS', 2 * D, null),
  ko(2203, T.bvb, T.int, 'QUARTER_FINALS', -5 * D, [0, 0]), ko(2204, T.int, T.bvb, 'QUARTER_FINALS', 2 * D + 60, null),
];
export function mockFinish(id, h, a) { const m = fdMatches.find((x) => x.id === id); if (!m) return false; m.status = 'FINISHED'; m.utcDate = iso(-200); m.score.fullTime = { home: h, away: a }; m.score.winner = h > a ? 'HOME_TEAM' : h < a ? 'AWAY_TEAM' : 'DRAW'; return true; }
function fdTable() {
  const teams = [T.ars, T.liv, T.mci, T.che, T.new, T.tot];
  return teams.map((t, i) => ({ position: i + 1, team: t, playedGames: 8, form: i < 2 ? 'W,W,D,W,W' : null, won: 6 - i, draw: 1, lost: 1 + i, points: 19 - i * 3, goalsFor: 18 - i, goalsAgainst: 6 + i, goalDifference: 12 - 2 * i }));
}

export function fdRoute(path) {
  const u = new URL('https://x' + path);
  const p = u.pathname.replace('/v4', '');
  if (p === '/matches') return { matches: fdMatches };
  let m;
  if ((m = p.match(/^\/matches\/(\d+)\/head2head$/))) {
    return { aggregates: { numberOfMatches: 3, totalGoals: 9, homeTeam: { id: 57, name: 'Arsenal FC', wins: 2, draws: 1 }, awayTeam: { id: 61, name: 'Chelsea FC', wins: 0, draws: 1 } },
      matches: [fdMatch(901, 2021, T.che, T.ars, 'FINISHED', -60 * 24 * 200, [1, 3], [0, 1]), fdMatch(902, 2021, T.ars, T.che, 'FINISHED', -60 * 24 * 380, [2, 2], [1, 1])] };
  }
  if ((m = p.match(/^\/matches\/(\d+)$/))) { const x = fdMatches.concat(fdKO).find((y) => y.id === +m[1]); return x || { __status: 404 }; }
  if ((m = p.match(/^\/competitions\/(\d+)\/standings$/))) {
    const c = fdComp[m[1]] || fdComp[2021];
    return { competition: { id: c.id, name: c.name, emblem: null }, area: { name: c.area }, season: { startDate: '2026-08-15', endDate: '2027-05-23', currentMatchday: 8 }, standings: [{ type: 'TOTAL', group: null, table: fdTable() }] };
  }
  if ((m = p.match(/^\/competitions\/(\d+)\/matches$/))) return { matches: fdMatches.concat(+m[1] === 2001 ? fdKO : []).filter((x) => x.competition.id === +m[1]) };
  if ((m = p.match(/^\/competitions\/(\d+)\/scorers$/))) return { scorers: [{ player: { id: 1, name: 'Bukayo Saka', nationality: 'England' }, team: T.ars, playedMatches: 8, goals: 7, assists: 4, penalties: 2 }, { player: { id: 2, name: 'Erling Haaland', nationality: 'Norway' }, team: T.mci, playedMatches: 8, goals: 6, assists: null, penalties: 1 }] };
  if ((m = p.match(/^\/competitions\/(\d+)\/teams$/))) return { teams: Object.values(T).map((t) => ({ ...t, area: { name: 'England' } })) };
  if ((m = p.match(/^\/teams\/(\d+)\/matches$/))) return { matches: fdMatches.filter((x) => x.homeTeam.id === +m[1] || x.awayTeam.id === +m[1]).concat([fdMatch(1100, 2021, T.new, T.ars, 'FINISHED', -60 * 24 * 7, [0, 1], [0, 0])]).sort((a, b) => a.utcDate.localeCompare(b.utcDate)) };
  if ((m = p.match(/^\/teams\/(\d+)$/))) return { id: +m[1], name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: null, area: { name: 'England' }, founded: 1886, venue: 'Emirates Stadium', website: 'http://www.arsenal.com', coach: { name: 'Mikel Arteta' }, runningCompetitions: [{ id: 2021, name: 'Premier League', emblem: null }, { id: 2001, name: 'UEFA Champions League', emblem: null }],
    squad: [{ id: 1, name: 'David Raya', position: 'Goalkeeper', nationality: 'Spain', dateOfBirth: '1995-09-15' }, { id: 2, name: 'William Saliba', position: 'Defence', nationality: 'France', dateOfBirth: '2001-03-24' }, { id: 3, name: 'Declan Rice', position: 'Midfield', nationality: 'England', dateOfBirth: '1999-01-14' }, { id: 4, name: 'Bukayo Saka', position: 'Offence', nationality: 'England', dateOfBirth: '2001-09-05' }] };
  return { __status: 404 };
}

/* ---------------- API-Football v3 shapes ---------------- */
const afL = { 12: { id: 12, name: 'CAF Champions League', country: 'World', logo: null }, 13: { id: 13, name: 'CONMEBOL Libertadores', country: 'World', logo: null } };
const afT = (id, name) => ({ id, name, logo: null });
const A = { hil: afT(1029, 'Al Ahly'), nas: afT(1030, 'Esperance de Tunis'), itt: afT(1031, 'Mamelodi Sundowns'), ahl: afT(1032, 'Wydad AC'),
  eny: afT(127, 'Flamengo'), ran: afT(435, 'River Plate'), kan: afT(121, 'Palmeiras'), rem: afT(451, 'Boca Juniors') };
function afFix(id, lg, h, a, short, mins, g, ht, elapsed = null, round = 'Group Stage - 3') {
  const hw = g && g[0] > g[1], aw = g && g[1] > g[0];
  return { fixture: { id, referee: 'Mohammed Al-Hoaish', date: iso(mins), venue: { name: 'Kingdom Arena', city: 'Riyadh' }, status: { short, long: short, elapsed, extra: null } },
    league: { ...afL[lg], round, season: 2026 },
    teams: { home: { ...h, winner: short === 'FT' ? hw : null }, away: { ...a, winner: short === 'FT' ? aw : null } },
    goals: { home: g ? g[0] : null, away: g ? g[1] : null },
    score: { halftime: { home: ht ? ht[0] : null, away: ht ? ht[1] : null }, fulltime: {}, extratime: {}, penalty: { home: null, away: null } } };
}
const afList = [
  afFix(7001, 12, A.hil, A.nas, '2H', -75, [2, 1], [1, 1], 71),
  afFix(7002, 12, A.itt, A.ahl, 'NS', 120, null, null),
  afFix(7003, 13, A.eny, A.ran, 'FT', -60 * 24 * 6, [2, 1], [1, 0], null, 'Semi-finals'),
  afFix(7004, 13, A.ran, A.eny, 'NS', 60 * 24 + 30, null, null, null, 'Semi-finals'),
  afFix(7005, 13, A.kan, A.rem, 'FT', -60 * 24 * 7, [0, 0], [0, 0], null, 'Semi-finals'),
  afFix(7006, 13, A.rem, A.kan, 'NS', 60 * 24 * 2, null, null, null, 'Semi-finals'),
];
function afDetail(f) {
  if (f.fixture.id !== 7001) return { ...f, events: [], lineups: [], statistics: [] };
  const P = (id, name, number, pos, grid) => ({ player: { id, name, number, pos, grid } });
  const hXI = [P(1, 'Yassine Bounou', 37, 'G', '1:1'), P(2, 'João Cancelo', 20, 'D', '2:4'), P(3, 'Kalidou Koulibaly', 3, 'D', '2:3'), P(4, 'Ali Al-Bulayhi', 5, 'D', '2:2'), P(5, 'Renan Lodi', 6, 'D', '2:1'),
    P(6, 'Rúben Neves', 8, 'M', '3:2'), P(7, 'Sergej Milinković-Savić', 22, 'M', '3:1'), P(8, 'Malcom', 77, 'M', '4:3'), P(9, 'Salem Al-Dawsari', 29, 'M', '4:2'), P(10, 'Marcos Leonardo', 11, 'M', '4:1'), P(11, 'Aleksandar Mitrović', 9, 'F', '5:1')];
  const aXI = hXI.map((x, i) => P(100 + i, ['Bento', 'Sultan Al-Ghannam', 'Mohamed Simakan', 'Aymeric Laporte', 'Nawaf Boushal', 'Marcelo Brozović', 'Otávio', 'Sadio Mané', 'Ângelo', 'Kingsley Coman', 'Cristiano Ronaldo'][i], [24, 2, 3, 27, 15, 11, 25, 10, 23, 21, 7][i], x.player.pos, x.player.grid));
  return { ...f,
    events: [
      { time: { elapsed: 12, extra: null }, team: { id: A.hil.id }, player: { name: 'Aleksandar Mitrović' }, assist: { name: 'Malcom' }, type: 'Goal', detail: 'Normal Goal' },
      { time: { elapsed: 30, extra: null }, team: { id: A.nas.id }, player: { name: 'Marcelo Brozović' }, assist: { name: null }, type: 'Card', detail: 'Yellow Card' },
      { time: { elapsed: 45, extra: 2 }, team: { id: A.nas.id }, player: { name: 'Cristiano Ronaldo' }, assist: { name: null }, type: 'Goal', detail: 'Penalty' },
      { time: { elapsed: 58, extra: null }, team: { id: A.hil.id }, player: { name: 'Malcom' }, assist: { name: null }, type: 'Var', detail: 'Goal cancelled' },
      { time: { elapsed: 63, extra: null }, team: { id: A.hil.id }, player: { name: 'Salem Al-Dawsari' }, assist: { name: 'Rúben Neves' }, type: 'Goal', detail: 'Normal Goal' },
      { time: { elapsed: 66, extra: null }, team: { id: A.nas.id }, player: { name: 'Ângelo' }, assist: { name: 'Ayman Yahya' }, type: 'subst', detail: 'Substitution 1' },
    ],
    lineups: [
      { team: { id: A.hil.id }, formation: '4-2-3-1', coach: { name: 'Simone Inzaghi' }, startXI: hXI, substitutes: [{ player: { id: 50, name: 'Mohammed Al-Owais', number: 1, pos: 'G' } }] },
      { team: { id: A.nas.id }, formation: '4-2-3-1', coach: { name: 'Jorge Jesus' }, startXI: aXI, substitutes: [] },
    ],
    statistics: [
      { team: { id: A.hil.id }, statistics: [{ type: 'Ball Possession', value: '58%' }, { type: 'Total Shots', value: 14 }, { type: 'Shots on Goal', value: 6 }, { type: 'Corner Kicks', value: 5 }, { type: 'Fouls', value: 9 }, { type: 'Red Cards', value: null }, { type: 'expected_goals', value: '1.84' }, { type: 'Offsides', value: 0 }] },
      { team: { id: A.nas.id }, statistics: [{ type: 'Ball Possession', value: '42%' }, { type: 'Total Shots', value: 8 }, { type: 'Shots on Goal', value: 3 }, { type: 'Corner Kicks', value: 2 }, { type: 'Fouls', value: 12 }, { type: 'Red Cards', value: null }, { type: 'expected_goals', value: null }, { type: 'Offsides', value: 2 }] },
    ] };
}
export function afRoute(path) {
  const u = new URL('https://x' + path);
  const q = u.searchParams; const p = u.pathname;
  const R = (response) => ({ errors: [], response });
  const deny = String(process.env.MOCK_AF_DENY || '').split(',');
  if (q.get('league') && deny.includes(q.get('league')) && p !== '/leagues') return { errors: { plan: 'Free plans do not have access to this season, try from 2021 to 2023.' }, response: [] };
  if (q.get('ids')) { const ids = q.get('ids').split('-').map(Number); return R(afList.filter((f) => ids.includes(f.fixture.id))); }
  if (p === '/fixtures' && q.get('live')) return R(afList.filter((f) => ['1H', '2H', 'HT'].includes(f.fixture.status.short)));
  if (p === '/fixtures' && q.get('id')) { const f = afList.find((x) => x.fixture.id === +q.get('id')); return R(f ? [afDetail(f)] : []); }
  if (p === '/fixtures' && q.get('date')) return R(afList);
  if (p === '/fixtures' && q.get('league')) return R(afList.filter((f) => f.league.id === +q.get('league')));
  if (p === '/fixtures' && q.get('team')) return R(afList.filter((f) => f.teams.home.id === +q.get('team') || f.teams.away.id === +q.get('team')).filter((f) => q.get('next') ? f.fixture.status.short === 'NS' : f.fixture.status.short !== 'NS'));
  if (p === '/fixtures/headtohead') return R([afFix(6001, 12, A.nas, A.hil, 'FT', -60 * 24 * 90, [1, 3], [0, 1]), afFix(6002, 12, A.hil, A.nas, 'FT', -60 * 24 * 250, [1, 1], [0, 1])]);
  if (p === '/leagues') { const l = afL[q.get('id')]; return R(l ? [{ league: { id: l.id, name: l.name, logo: null }, country: { name: l.country }, seasons: [{ year: 2026, start: '2026-08-20', end: '2027-05-25', current: true, coverage: { standings: true } }] }] : []); }
  if (p === '/standings') {
    const teams = +q.get('league') === 12 ? [A.hil, A.nas, A.itt, A.ahl] : [A.eny, A.rem, A.ran, A.kan];
    const desc = ['Next round', 'Next round', null, null];
    return R([{ league: { standings: [teams.map((t, i) => ({ rank: i + 1, team: t, points: 15 - i * 3, goalsDiff: 9 - i * 4, form: 'WWDLW', description: desc[i], all: { played: 6, win: 5 - i, draw: 0, lose: 1 + i, goals: { for: 14 - i, against: 5 + i } } }))] } }]);
  }
  if (p === '/players/topscorers') return R([{ player: { id: 1, name: 'Cristiano Ronaldo', nationality: 'Portugal' }, statistics: [{ team: A.nas, games: { appearences: 6 }, goals: { total: 7, assists: 1 }, penalty: { scored: 3 } }] }]);
  if (p === '/teams' && q.get('id')) return R([{ team: { id: +q.get('id'), name: 'Al-Hilal Saudi FC', code: 'HIL', country: 'Saudi-Arabia', founded: 1957, national: false, logo: null }, venue: { name: 'Kingdom Arena', city: 'Riyadh' } }]);
  if (p === '/teams' && q.get('search')) return R([{ team: { ...A.hil, country: 'Saudi-Arabia' } }]);
  if (p === '/players/squads') return R([{ players: [{ id: 1, name: 'Yassine Bounou', age: 35, number: 37, position: 'Goalkeeper' }, { id: 3, name: 'Kalidou Koulibaly', age: 35, number: 3, position: 'Defender' }, { id: 6, name: 'Rúben Neves', age: 29, number: 8, position: 'Midfielder' }, { id: 11, name: 'Aleksandar Mitrović', age: 32, number: 9, position: 'Attacker' }] }]);
  if (p === '/coachs') return R([{ name: 'Simone Inzaghi', career: [{ team: { id: +q.get('team') }, end: null }] }]);
  return R([]);
}

/* ---------------- Guardian Open Platform shapes ---------------- */
const gStories = [
  ['football/2026/oct/24/cup-night-preview', 'Five things to watch on a huge night of cup football', 'Holders, giant-killers and a goalkeeper in form: the stories that could decide the quarter-finals.'],
  ['football/2026/oct/23/african-champions-league-group-stage', 'African champions set the pace as group stage heats up', 'Two wins from two leave the favourites in control, but the chasing pack is closing in.'],
  ['football/2026/oct/23/libertadores-semi-final-first-leg', 'Libertadores semi-final first leg ends with everything to play for', 'A late goal keeps the tie alive before the return leg next week.'],
  ['football/2026/oct/22/tactics-pressing-cup-ties', 'Why pressing high wins cup ties – and when it loses them', 'A look at the numbers behind the most effective knockout teams this season.'],
];
export function guardianRoute(path) {
  const u = new URL('https://x' + path);
  if (u.pathname === '/search') return { response: { status: 'ok', results: gStories.map(([id, t, s], i) => ({ id, type: 'article', sectionName: 'Football', webTitle: t, webUrl: 'https://www.theguardian.com/' + id, webPublicationDate: iso(-60 * (i * 5 + 2)), fields: { trailText: '<p>' + s + '</p>', byline: 'Sports desk', wordcount: String(600 + i * 250) } })) } };
  const id = u.pathname.slice(1); const g = gStories.find((x) => x[0] === id);
  if (!g) return { response: { status: 'error' }, __status: 404 };
  return { response: { status: 'ok', content: { id, webTitle: g[1], webUrl: 'https://www.theguardian.com/' + id, webPublicationDate: iso(-120), fields: { headline: g[1], trailText: g[2], byline: 'Sports desk',
    body: '<p>' + g[2] + '</p><figure><img src="x.jpg"><figcaption>Photo</figcaption></figure><h2>The key battle</h2><p>The midfield duel will decide <a href="https://x">the tie</a>, with both sides pressing high from the first whistle.</p><script>alert(1)</script><blockquote><p>We know what this night means.</p></blockquote><p>Kick-off is at 8pm local time.</p>' } } } };
}
