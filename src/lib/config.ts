import { SportConfig } from '@/types';

export const SPORTS_CONFIG: SportConfig[] = [
  // ── Football (Soccer) ─────────────────────────────────────────────────────
  { id: 'soccer-epl',            label: 'EPL',                                category: 'Football',    espnSlug: 'soccer/eng.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
  { id: 'soccer-ucl',            label: 'UEFA Champions League',              category: 'Football',    espnSlug: 'soccer/uefa.champions',     logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png' },
  { id: 'soccer-uel',            label: 'UEFA Europa League',                 category: 'Football',    espnSlug: 'soccer/uefa.europa',        logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png' },
  { id: 'soccer-uecl',           label: 'Europa Conference League',           category: 'Football',    espnSlug: 'soccer/uefa.europa.conf',   logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/45.png' },
  { id: 'soccer-facup',          label: 'FA Cup',                             category: 'Football',    espnSlug: 'soccer/eng.fa',             logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/4.png' },
  { id: 'soccer-efl',            label: 'EFL Championship',                   category: 'Football',    espnSlug: 'soccer/eng.2',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/24.png' },
  { id: 'soccer-leagueone',      label: 'League One',                         category: 'Football',    espnSlug: 'soccer/eng.3',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/afedb31688770443.png' },
  { id: 'soccer-carabao',        label: 'Carabao Cup',                        category: 'Football',    espnSlug: 'soccer/eng.league_cup',     logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2073.png' },
  { id: 'soccer-bundesliga',     label: 'Bundesliga',                         category: 'Football',    espnSlug: 'soccer/ger.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png' },
  { id: 'soccer-ligue1',         label: 'Ligue 1',                            category: 'Football',    espnSlug: 'soccer/fra.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png' },
  { id: 'soccer-laliga',         label: 'La Liga',                            category: 'Football',    espnSlug: 'soccer/esp.1',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png' },
  { id: 'soccer-seriea',         label: 'Serie A',                            category: 'Football',    espnSlug: 'soccer/ita.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png' },
  { id: 'soccer-spfl',           label: 'SPFL Scottish Prem',                 category: 'Football',    espnSlug: 'soccer/sco.1',              logo: '/spfl.jpg' },
  { id: 'soccer-eredivisie',     label: 'Eredivisie',                         category: 'Football',    espnSlug: 'soccer/ned.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png' },
  { id: 'soccer-mls',            label: 'MLS',                                category: 'Football',    espnSlug: 'soccer/usa.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png' },
  { id: 'soccer-aleague',        label: 'A-League',                           category: 'Football',    espnSlug: 'soccer/aus.1',              logo: '/A-League-logo-2.png' },
  { id: 'soccer-saudipro',       label: 'Saudi Pro League',                   category: 'Football',    espnSlug: 'soccer/ksa.1',              logo: '/Roshn_Saudi_League_Logo.svg.png' },
  { id: 'soccer-jleague',        label: 'J-League',                           category: 'Football',    espnSlug: 'soccer/jpn.1',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/3j8bni1675170553.png' },
  { id: 'soccer-afc',            label: 'AFC Champions League',               category: 'Football',    espnSlug: 'soccer/afc.champions',      logo: '/AFC.png' },
  { id: 'soccer-copam',          label: 'Copa Libertadores',                  category: 'Football',    espnSlug: 'soccer/conmebol.libertadores', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/26.png' },
  { id: 'soccer-cpl',            label: 'C-League Cambodia',                  category: 'Football',    espnSlug: null,                        sportsdbId: '4793', logo: '/CPL.png' },

  // ── Basketball ─────────────────────────────────────────────────────────────
  { id: 'basketball-nba',        label: 'NBA',                                category: 'Basketball',  espnSlug: 'basketball/nba',            logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png' },
  { id: 'basketball-wnba',       label: 'WNBA',                               category: 'Basketball',  espnSlug: 'basketball/wnba',           logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png' },
  { id: 'basketball-ncaam',      label: 'NCAA Men\'s Basketball',             category: 'Basketball',  espnSlug: 'basketball/mens-college-basketball', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png' },
  { id: 'basketball-nbl',        label: 'NBL Australia',                       category: 'Basketball',  espnSlug: 'basketball/nbl',            logo: 'https://r2.thesportsdb.com/images/media/league/badge/gvz6vb1726086476.png' },

  // ── American Football ──────────────────────────────────────────────────────
  { id: 'football-nfl',          label: 'NFL',                                category: 'American Football', espnSlug: 'football/nfl',          logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png' },
  { id: 'football-ncaaf',        label: 'NCAA Football',                      category: 'American Football', espnSlug: 'football/college-football', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png' },

  // ── Baseball ───────────────────────────────────────────────────────────────
  { id: 'baseball-mlb',          label: 'MLB',                                category: 'Baseball',    espnSlug: 'baseball/mlb',              logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png' },

  // ── Ice Hockey ─────────────────────────────────────────────────────────────
  { id: 'hockey-nhl',            label: 'NHL',                                category: 'Ice Hockey',  espnSlug: 'hockey/nhl',                logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png' },

  // ── Cricket ────────────────────────────────────────────────────────────────
  { id: 'cricket-ipl',           label: 'IPL',                                category: 'Cricket',     espnSlug: 'cricket/8048',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/gaiti11741709844.png' },
  { id: 'cricket-bbl',           label: 'Big Bash League',                    category: 'Cricket',     espnSlug: 'cricket/8044',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/yko7ny1546635346.png' },

  // ── Motorsport ─────────────────────────────────────────────────────────────
  { id: 'f1',                    label: 'Formula 1',                           category: 'Motorsport',  espnSlug: 'racing/f1',                 openf1: true, logo: 'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png' },
  { id: 'motogp',                label: 'MotoGP',                              category: 'Motorsport',  espnSlug: null,                        sportsdbId: '4407', logo: '/motogp.png' },
  { id: 'indycar',               label: 'IndyCar',                             category: 'Motorsport',  espnSlug: 'racing/irl',                logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/indycar.png' },

  // ── Combat Sports ──────────────────────────────────────────────────────────
  { id: 'ufc',                   label: 'UFC / MMA',                           category: 'Combat Sports', espnSlug: null,                     sportsdbId: '4443', logo: 'https://r2.thesportsdb.com/images/media/league/badge/bewnz31717531281.png' },
  { id: 'bellator',              label: 'PFL / Bellator',                      category: 'Combat Sports', espnSlug: 'mma/bellator',            logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/pfl.png' },
  { id: 'boxing',                label: 'Boxing',                              category: 'Combat Sports', espnSlug: null,                     sportsdbId: '4445', logo: 'https://r2.thesportsdb.com/images/media/league/badge/6enin21740228549.png' },

  // ── Rugby Union ────────────────────────────────────────────────────────────
  { id: 'rugby-superrugby',      label: 'Super Rugby Pacific',                category: 'Rugby',       espnSlug: 'rugby/242041', sportsdbId: '4401', logo: '/Super_Rugby_Pacific_logo.png' },
  { id: 'rugby-sixnations',      label: 'Six Nations',                        category: 'Rugby',       espnSlug: 'rugby/180659',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/7h1wr91738670253.png' },
  { id: 'rugby-premship',        label: 'Premiership Rugby',                  category: 'Rugby',       espnSlug: 'rugby/267979',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/r59qxy1755025703.png' },
  { id: 'rugby-top14',           label: 'Top 14',                             category: 'Rugby',       espnSlug: 'rugby/270559',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/xrsqtw1452903237.png' },
  { id: 'rugby-urc',             label: 'United Rugby Championship',          category: 'Rugby',       espnSlug: 'rugby/270557',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/o6dhfo1716481482.png' },
  { id: 'rugby-champscup',       label: 'Champions Cup',                      category: 'Rugby',       espnSlug: 'rugby/271937',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/kohne11716546580.png' },
  { id: 'rugby-rc',              label: 'The Rugby Championship',             category: 'Rugby',       espnSlug: 'rugby/244293',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/dy0n4c1716684531.png' },

  // ── Rugby League ───────────────────────────────────────────────────────────
  { id: 'nrl',                   label: 'NRL',                                category: 'Rugby League', espnSlug: 'rugby-league/3',           sportsdbId: '4416', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gsztcj1552071996.png' },

  // ── Australian Football ────────────────────────────────────────────────────
  { id: 'afl',                   label: 'AFL',                                category: 'Australian Football', espnSlug: 'australian-football/afl', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/afl.png' },

  // ── Tennis ─────────────────────────────────────────────────────────────────
  { id: 'tennis-atp',            label: 'ATP Tour',                           category: 'Tennis',      espnSlug: 'tennis/atp',                logo: 'https://r2.thesportsdb.com/images/media/league/badge/q7aej51769857150.png' },
  { id: 'tennis-wta',            label: 'WTA Tour',                           category: 'Tennis',      espnSlug: 'tennis/wta',                logo: 'https://www.thesportsdb.com/images/media/league/badge/bddhun1768210678.png' },

  // ── Golf ───────────────────────────────────────────────────────────────────
  { id: 'golf-pga',              label: 'PGA Tour',                           category: 'Golf',        espnSlug: 'golf/pga',                  logo: '/PGA_Tour_logo.svg' },
  { id: 'golf-lpga',             label: 'LPGA Tour',                          category: 'Golf',        espnSlug: 'golf/lpga',                 logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/lpga.png' },
];

export const CATEGORY_ORDER = [
  'Football',
  'Basketball',
  'American Football',
  'Baseball',
  'Ice Hockey',
  'Cricket',
  'Motorsport',
  'Combat Sports',
  'Rugby',
  'Rugby League',
  'Australian Football',
  'Tennis',
  'Golf',
];

export const FOOTBALL_LEAGUE_ORDER = [
  'soccer-cpl',
  'soccer-epl',
  'soccer-ucl',
  'soccer-uel',
  'soccer-uecl',
  'soccer-facup',
  'soccer-efl',
  'soccer-leagueone',
  'soccer-carabao',
  'soccer-bundesliga',
  'soccer-ligue1',
  'soccer-laliga',
  'soccer-seriea',
  'soccer-spfl',
  'soccer-eredivisie',
  'soccer-mls',
  'soccer-aleague',
  'soccer-saudipro',
  'soccer-jleague',
  'soccer-afc',
  'soccer-copam',
];

export const ALL_SCREEN_TAGS: Array<import('@/types').ScreenTag> = [
  'Live Big Screen',
  'Recorded',
  'Sound On',
  'TV Only',
  'No Sound',
];

/** Category logo URLs — used in sidebar instead of emojis */
export const CATEGORY_LOGOS: Record<string, string> = {
  'Football':            'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/default-team-logo-500.png&w=24&h=24',
  'Basketball':          'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  'American Football':   'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  'Baseball':            'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
  'Ice Hockey':          'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  'Cricket':             '',
  'Motorsport':          'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png',
  'Combat Sports':       'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png',
  'Rugby':               '',
  'Rugby League':        'https://r2.thesportsdb.com/images/media/league/badge/gsztcj1552071996.png',
  'Australian Football': 'https://a.espncdn.com/i/teamlogos/leagues/500/afl.png',
  'Tennis':              '',
  'Golf':                '',
};

export function getSportConfig(sportId: string): SportConfig | undefined {
  return SPORTS_CONFIG.find(s => s.id === sportId);
}

export function getCategories(): string[] {
  const cats = new Set(SPORTS_CONFIG.map(s => s.category));
  return CATEGORY_ORDER.filter(c => cats.has(c));
}

export function getLeaguesByCategory(category: string): SportConfig[] {
  return SPORTS_CONFIG.filter(s => s.category === category);
}
