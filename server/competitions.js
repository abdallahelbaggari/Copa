// Copa competition catalogue. Each entry maps to an ID per data provider.
// fd = football-data.org v4 competition id, af = API-Football (api-sports) league id.
// null means that provider does not offer the competition; the app shows it as
// "not in the current data plan" instead of pretending to cover it.
// API-Football IDs: confirm against GET /leagues?id=<id> after you get a key —
// the competition page always shows the provider's own name for the ID.

export const GROUPS = ['Club cups', 'International', 'Top leagues', 'More leagues'];

// cup: true marks knockout tournaments (Cups tab, brackets). Order = display priority.
export const CATALOGUE = [
  // Club cups
  { key: 'ucl', name: 'UEFA Champions League', country: 'Europe', group: 'Club cups', fd: 2001, af: 2, cup: true },
  { key: 'cafcl', name: 'CAF Champions League', country: 'Africa', group: 'Club cups', fd: null, af: 12, cup: true },
  { key: 'libertadores', name: 'Copa Libertadores', country: 'South America', group: 'Club cups', fd: null, af: 13, cup: true },
  { key: 'cafcc', name: 'CAF Confederation Cup', country: 'Africa', group: 'Club cups', fd: null, af: 20, cup: true },
  { key: 'uel', name: 'UEFA Europa League', country: 'Europe', group: 'Club cups', fd: null, af: 3, cup: true },
  { key: 'uecl', name: 'UEFA Conference League', country: 'Europe', group: 'Club cups', fd: null, af: 848, cup: true },
  { key: 'sudamericana', name: 'Copa Sudamericana', country: 'South America', group: 'Club cups', fd: null, af: 11, cup: true },
  { key: 'aclE', name: 'AFC Champions League Elite', country: 'Asia', group: 'Club cups', fd: null, af: 17, cup: true },
  { key: 'facup', name: 'FA Cup', country: 'England', group: 'Club cups', fd: null, af: 45, cup: true },
  { key: 'copadelrey', name: 'Copa del Rey', country: 'Spain', group: 'Club cups', fd: null, af: 143, cup: true },
  { key: 'cwc', name: 'FIFA Club World Cup', country: 'World', group: 'Club cups', fd: null, af: 15, cup: true },
  // International
  { key: 'wc', name: 'FIFA World Cup', country: 'World', group: 'International', fd: 2000, af: 1, cup: true },
  { key: 'euro', name: 'European Championship', country: 'Europe', group: 'International', fd: 2018, af: 4, cup: true },
  { key: 'afcon', name: 'Africa Cup of Nations', country: 'Africa', group: 'International', fd: null, af: 6, cup: true },
  { key: 'copaam', name: 'Copa América', country: 'South America', group: 'International', fd: null, af: 9, cup: true },
  { key: 'wcqcaf', name: 'World Cup Qualifiers — Africa', country: 'World', group: 'International', fd: null, af: 29, cup: false },
  { key: 'unl', name: 'UEFA Nations League', country: 'Europe', group: 'International', fd: null, af: 5, cup: true },
  // Top leagues (for everyday predictions)
  { key: 'epl', name: 'Premier League', country: 'England', group: 'Top leagues', fd: 2021, af: 39 },
  { key: 'laliga', name: 'La Liga', country: 'Spain', group: 'Top leagues', fd: 2014, af: 140 },
  { key: 'seriea', name: 'Serie A', country: 'Italy', group: 'Top leagues', fd: 2019, af: 135 },
  { key: 'bundesliga', name: 'Bundesliga', country: 'Germany', group: 'Top leagues', fd: 2002, af: 78 },
  { key: 'ligue1', name: 'Ligue 1', country: 'France', group: 'Top leagues', fd: 2015, af: 61 },
  // More leagues
  { key: 'brasileirao', name: 'Brasileirão Série A', country: 'Brazil', group: 'More leagues', fd: 2013, af: 71 },
  { key: 'eredivisie', name: 'Eredivisie', country: 'Netherlands', group: 'More leagues', fd: 2003, af: 88 },
  { key: 'primeira', name: 'Primeira Liga', country: 'Portugal', group: 'More leagues', fd: 2017, af: 94 },
  { key: 'championship', name: 'Championship', country: 'England', group: 'More leagues', fd: 2016, af: 40 },
];

const FD_CODES = {2021:"PL", 2001:"CL", 2014:"PD", 2019:"SA", 2002:"BL1", 2015:"FL1", 2016:"ELC", 2003:"DED", 2017:"PPL", 2000:"WC", 2018:"EC", 2013:"BSA"};

export function catalogueFor(provider) {
  const field = provider === 'api-football' ? 'af' : 'fd';
  return CATALOGUE.map((c, i) => ({
    id: c[field] ?? null,
    key: c.key,
    name: c.name,
    country: c.country,
    group: c.group,
    priority: i,
    cup: !!c.cup,
    covered: c[field] != null,
    logo: c[field] == null ? null : field === 'af'
      ? `https://media.api-sports.io/football/leagues/${c.af}.png`
      : FD_CODES[c.fd] ? `https://crests.football-data.org/${FD_CODES[c.fd]}.png` : null,
  }));
}

export function priorityOf(provider, compId) {
  let field = provider === 'api-football' ? 'af' : 'fd';
  let id = compId;
  if (provider === 'hybrid' && /^a\d+$/.test(String(compId))) { field = 'af'; id = String(compId).slice(1); }
  const i = CATALOGUE.findIndex((c) => c[field] === Number(id));
  return i === -1 ? 999 : i;
}
