import { SportConfig } from '@/types';

export const SPORTS_CONFIG: SportConfig[] = [
  // ── Football (Soccer) ─────────────────────────────────────────────────────
  { id: 'soccer-epl',            label: 'EPL',                                category: 'Football',    espnSlug: 'soccer/eng.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
  { id: 'soccer-ucl',            label: 'UEFA Champions League',              category: 'Football',    espnSlug: 'soccer/uefa.champions',     logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png' },
  { id: 'soccer-uel',            label: 'UEFA Europa League',                 category: 'Football',    espnSlug: 'soccer/uefa.europa',        logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png' },
  { id: 'soccer-uecl',           label: 'Europa Conference League',           category: 'Football',    espnSlug: 'soccer/uefa.europa.conf',   logo: '' },
  { id: 'soccer-facup',          label: 'FA Cup',                             category: 'Football',    espnSlug: 'soccer/eng.fa',             logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/4.png' },
  { id: 'soccer-efl',            label: 'EFL Championship',                   category: 'Football',    espnSlug: 'soccer/eng.2',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/24.png' },
  { id: 'soccer-carabao',        label: 'Carabao Cup',                        category: 'Football',    espnSlug: 'soccer/eng.league_cup',     logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2073.png' },
  { id: 'soccer-bundesliga',     label: 'Bundesliga',                         category: 'Football',    espnSlug: 'soccer/ger.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png' },
  { id: 'soccer-ligue1',         label: 'Ligue 1',                            category: 'Football',    espnSlug: 'soccer/fra.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png' },
  { id: 'soccer-laliga',         label: 'La Liga',                            category: 'Football',    espnSlug: 'soccer/esp.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/15480.png' },
  { id: 'soccer-seriea',         label: 'Serie A',                            category: 'Football',    espnSlug: 'soccer/ita.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png' },
  { id: 'soccer-spfl',           label: 'SPFL Scottish Prem',                 category: 'Football',    espnSlug: 'soccer/sco.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/55.png' },
  { id: 'soccer-eredivisie',     label: 'Eredivisie',                         category: 'Football',    espnSlug: 'soccer/ned.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png' },
  { id: 'soccer-ligaportugal',   label: 'Liga Portugal',                      category: 'Football',    espnSlug: 'soccer/por.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/14.png' },
  { id: 'soccer-mls',            label: 'MLS',                                category: 'Football',    espnSlug: 'soccer/usa.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png' },
  { id: 'soccer-ligamx',         label: 'Liga MX',                            category: 'Football',    espnSlug: 'soccer/mex.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/29.png' },
  { id: 'soccer-superlig',       label: 'Turkish Süper Lig',                  category: 'Football',    espnSlug: 'soccer/tur.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/18.png' },
  { id: 'soccer-aleague',        label: 'A-League',                           category: 'Football',    espnSlug: 'soccer/aus.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/1003.png' },
  { id: 'soccer-saudipro',       label: 'Saudi Pro League',                   category: 'Football',    espnSlug: 'soccer/ksa.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/4710.png' },
  { id: 'soccer-bra1',           label: 'Brasileirão',                        category: 'Football',    espnSlug: 'soccer/bra.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/85.png' },
  { id: 'soccer-arg1',           label: 'Argentine Primera',                  category: 'Football',    espnSlug: 'soccer/arg.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/1.png' },
  { id: 'soccer-afc',            label: 'AFC Champions League',               category: 'Football',    espnSlug: 'soccer/afc.champions',      logo: '' },
  { id: 'soccer-copam',          label: 'Copa Libertadores',                  category: 'Football',    espnSlug: 'soccer/conmebol.libertadores', logo: '' },
  { id: 'soccer-cpl',            label: 'CPL – Cambodia Premier League',      category: 'Football',    espnSlug: null,                        sportsdbId: '4793', logo: 'https://r2.thesportsdb.com/images/media/league/badge/fdhux61655121747.png' },

  // ── Basketball ─────────────────────────────────────────────────────────────
  { id: 'basketball-nba',        label: 'NBA',                                category: 'Basketball',  espnSlug: 'basketball/nba',            logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png' },
  { id: 'basketball-wnba',       label: 'WNBA',                               category: 'Basketball',  espnSlug: 'basketball/wnba',           logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png' },
  { id: 'basketball-ncaam',      label: 'NCAA Men\'s Basketball',             category: 'Basketball',  espnSlug: 'basketball/mens-college-basketball', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png' },
  { id: 'basketball-euroleague', label: 'EuroLeague',                          category: 'Basketball',  espnSlug: null,                        logo: '' },
  { id: 'basketball-nbl',        label: 'NBL Australia',                       category: 'Basketball',  espnSlug: null,                        sportsdbId: '4434', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gvz6vb1726086476.png' },

  // ── American Football ──────────────────────────────────────────────────────
  { id: 'football-nfl',          label: 'NFL',                                category: 'American Football', espnSlug: 'football/nfl',          logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png' },
  { id: 'football-ncaaf',        label: 'NCAA Football',                      category: 'American Football', espnSlug: 'football/college-football', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png' },

  // ── Baseball ───────────────────────────────────────────────────────────────
  { id: 'baseball-mlb',          label: 'MLB',                                category: 'Baseball',    espnSlug: 'baseball/mlb',              logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png' },

  // ── Ice Hockey ─────────────────────────────────────────────────────────────
  { id: 'hockey-nhl',            label: 'NHL',                                category: 'Ice Hockey',  espnSlug: 'hockey/nhl',                logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png' },

  // ── Cricket ────────────────────────────────────────────────────────────────
  { id: 'cricket-ipl',           label: 'IPL',                                category: 'Cricket',     espnSlug: 'cricket/ipl',               logo: '' },
  { id: 'cricket-intl',          label: 'International Cricket',              category: 'Cricket',     espnSlug: 'cricket/international',     logo: '' },
  { id: 'cricket-bbl',           label: 'Big Bash League',                    category: 'Cricket',     espnSlug: 'cricket/big-bash-league',   logo: '' },
  { id: 'cricket-t20wc',         label: 'T20 World Cup',                      category: 'Cricket',     espnSlug: 'cricket/icc-world-twenty20',logo: '' },
  { id: 'cricket-odi',           label: 'ODI Cricket',                        category: 'Cricket',     espnSlug: null,                        logo: '' },

  // ── Motorsport ─────────────────────────────────────────────────────────────
  { id: 'f1',                    label: 'Formula 1',                           category: 'Motorsport',  espnSlug: null,                        openf1: true, logo: 'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png' },
  { id: 'motogp',                label: 'MotoGP',                              category: 'Motorsport',  espnSlug: null,                        sportsdbId: '4370', logo: '' },
  { id: 'nascar',                label: 'NASCAR Cup Series',                   category: 'Motorsport',  espnSlug: 'racing/nascar-cup',         logo: '' },
  { id: 'indycar',               label: 'IndyCar',                             category: 'Motorsport',  espnSlug: 'racing/indycar',            logo: '' },

  // ── Combat Sports ──────────────────────────────────────────────────────────
  { id: 'ufc',                   label: 'UFC / MMA',                           category: 'Combat Sports', espnSlug: 'mma/ufc',                logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png' },
  { id: 'bellator',              label: 'PFL / Bellator',                      category: 'Combat Sports', espnSlug: 'mma/bellator',            logo: '' },
  { id: 'boxing',                label: 'Boxing',                              category: 'Combat Sports', espnSlug: null,                      logo: '' },

  // ── Rugby ──────────────────────────────────────────────────────────────────
  { id: 'rugby-superrugby',      label: 'Super Rugby Pacific',                category: 'Rugby',       espnSlug: 'rugby/super-rugby',         logo: '' },
  { id: 'rugby-sixnations',      label: 'Six Nations',                        category: 'Rugby',       espnSlug: 'rugby/six-nations',         logo: '' },
  { id: 'rugby-premship',        label: 'Premiership Rugby',                  category: 'Rugby',       espnSlug: 'rugby/english-premiership',  logo: '' },
  { id: 'rugby-top14',           label: 'Top 14',                             category: 'Rugby',       espnSlug: 'rugby/top-14',              logo: '' },
  { id: 'nrl',                   label: 'NRL Rugby League',                   category: 'Rugby',       espnSlug: null,                        sportsdbId: '4416', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gsztcj1552071996.png' },

  // ── Australian Football ────────────────────────────────────────────────────
  { id: 'afl',                   label: 'AFL',                                category: 'Australian Football', espnSlug: 'afl/afl-comp',      logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/afl.png' },

  // ── Tennis ─────────────────────────────────────────────────────────────────
  { id: 'tennis-atp',            label: 'ATP Tour',                           category: 'Tennis',      espnSlug: null,                        sportsdbId: '4464', logo: '' },
  { id: 'tennis-wta',            label: 'WTA Tour',                           category: 'Tennis',      espnSlug: null,                        sportsdbId: '4517', logo: 'https://www.thesportsdb.com/images/media/league/badge/bddhun1768230678.png' },

  // ── Golf ───────────────────────────────────────────────────────────────────
  { id: 'golf-pga',              label: 'PGA Tour',                           category: 'Golf',        espnSlug: 'golf/pga',                  logo: '' },
  { id: 'golf-lpga',             label: 'LPGA Tour',                          category: 'Golf',        espnSlug: 'golf/lpga',                 logo: '' },
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
  'Australian Football',
  'Tennis',
  'Golf',
];

export const FOOTBALL_LEAGUE_ORDER = [
  'soccer-epl',
  'soccer-ucl',
  'soccer-uel',
  'soccer-uecl',
  'soccer-facup',
  'soccer-efl',
  'soccer-carabao',
  'soccer-bundesliga',
  'soccer-ligue1',
  'soccer-laliga',
  'soccer-seriea',
  'soccer-spfl',
  'soccer-eredivisie',
  'soccer-ligaportugal',
  'soccer-mls',
  'soccer-ligamx',
  'soccer-superlig',
  'soccer-aleague',
  'soccer-saudipro',
  'soccer-bra1',
  'soccer-arg1',
  'soccer-afc',
  'soccer-copam',
  'soccer-cpl',
];

export const ALL_SCREEN_TAGS: Array<import('@/types').ScreenTag> = [
  'Live Big Screen',
  'Sound On',
  'TV Only',
  'No Sound',
];

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
