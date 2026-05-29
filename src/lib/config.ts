import { SportConfig } from '@/types';

const LOCAL_LEAGUE_LOGOS: Record<string, string> = {
  'soccer-epl': '/league-logos/soccer-epl.webp',
  'soccer-ucl': '/league-logos/soccer-ucl.webp',
  'soccer-uel': '/league-logos/soccer-uel.webp',
  'soccer-uecl': '/league-logos/soccer-uecl.webp',
  'soccer-fifa-world-cup-2026': '/league-logos/soccer-fifa-world-cup-2026.webp',
  'soccer-facup': '/league-logos/soccer-facup.webp',
  'soccer-efl': '/league-logos/soccer-efl.webp',
  'soccer-leagueone': '/league-logos/soccer-leagueone.webp',
  'soccer-carabao': '/league-logos/soccer-carabao.svg',
  'soccer-bundesliga': '/league-logos/soccer-bundesliga.webp',
  'soccer-ligue1': '/league-logos/soccer-ligue1.webp',
  'soccer-laliga': '/league-logos/soccer-laliga.webp',
  'soccer-seriea': '/league-logos/soccer-seriea.webp',
  'soccer-spfl': '/league-logos/soccer-spfl.webp',
  'soccer-eredivisie': '/league-logos/soccer-eredivisie.webp',
  'soccer-mls': '/league-logos/soccer-mls.webp',
  'soccer-ligamx': '/league-logos/soccer-ligamx.webp',
  'soccer-brasileirao': '/league-logos/soccer-brasileirao.webp',
  'soccer-arg-primera': '/league-logos/soccer-arg-primera.webp',
  'soccer-portugal': '/league-logos/soccer-portugal.webp',
  'soccer-superlig': '/league-logos/soccer-superlig.webp',
  'soccer-concacaf': '/league-logos/soccer-concacaf.webp',
  'soccer-aleague': '/league-logos/soccer-aleague.webp',
  'soccer-saudipro': '/league-logos/soccer-saudipro.webp',
  'soccer-jleague': '/league-logos/soccer-jleague.webp',
  'soccer-afc': '/league-logos/soccer-afc.webp',
  'soccer-afc2': '/league-logos/soccer-afc2.webp',
  'soccer-afccl': '/league-logos/soccer-afccl.webp',
  'soccer-afc-asian-cup': '/league-logos/soccer-afc-asian-cup.webp',
  'soccer-asian-cup-women': '/league-logos/soccer-asian-cup-women.webp',
  'soccer-copam': '/league-logos/soccer-copam.webp',
  'soccer-cpl': '/league-logos/soccer-cpl.webp',
  'soccer-hun-sen-cup': '/league-logos/soccer-hun-sen-cup.webp',
  'basketball-nba': '/league-logos/basketball-nba.webp',
  'basketball-wnba': '/league-logos/basketball-wnba.webp',
  'basketball-ncaam': '/league-logos/basketball-ncaam.webp',
  'basketball-ncaaw': '/league-logos/basketball-ncaaw.svg',
  'football-nfl': '/league-logos/football-nfl.webp',
  'football-ncaaf': '/league-logos/football-ncaaf.webp',
  'baseball-mlb': '/league-logos/baseball-mlb.webp',
  'hockey-nhl': '/league-logos/hockey-nhl.webp',
  'cricket-ipl': '/league-logos/cricket-ipl.webp',
  'cricket-bbl': '/league-logos/cricket-bbl.webp',
  'f1': '/league-logos/f1.webp',
  'motogp': '/league-logos/motogp.webp',
  'indycar': '/league-logos/indycar.webp',
  'ufc': '/league-logos/ufc.webp',
  'bellator': '/league-logos/bellator.webp',
  'boxing': '/league-logos/boxing.webp',
  'rugby-superrugby': '/league-logos/rugby-superrugby.webp',
  'rugby-sixnations': '/league-logos/rugby-sixnations.webp',
  'rugby-premship': '/league-logos/rugby-premship.webp',
  'rugby-top14': '/league-logos/rugby-top14.webp',
  'rugby-urc': '/league-logos/rugby-urc.webp',
  'rugby-champscup': '/league-logos/rugby-champscup.webp',
  'rugby-rc': '/league-logos/rugby-rc.webp',
  'nrl': '/league-logos/nrl.webp',
  'afl': '/league-logos/afl.webp',
  'tennis-atp': '/league-logos/tennis-atp.webp',
  'tennis-wta': '/league-logos/tennis-wta.webp',
  'tennis-australian-open': '/league-logos/tennis-australian-open.svg',
  'tennis-roland-garros': '/league-logos/tennis-roland-garros.svg',
  'tennis-wimbledon': '/league-logos/tennis-wimbledon.svg',
  'tennis-us-open': '/league-logos/tennis-us-open.webp',
  'golf-pga': '/league-logos/golf-pga.svg',
  'golf-lpga': '/league-logos/golf-lpga.webp',
  'cycling-uci': '/league-logos/cycling-uci.webp',
  'cycling-giro': '/league-logos/cycling-giro.svg',
};

export const SPORTS_CONFIG: SportConfig[] = [
  // ── Football (Soccer) ─────────────────────────────────────────────────────
  { id: 'soccer-epl',            label: 'EPL',                                category: 'Football',    espnSlug: 'soccer/eng.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
  { id: 'soccer-ucl',            label: 'UEFA Champions League',              category: 'Football',    espnSlug: 'soccer/uefa.champions',     logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png' },
  { id: 'soccer-fifa-world-cup-2026', label: '2026 FIFA World Cup',           category: 'Football',    espnSlug: 'soccer/fifa.world',         logo: 'https://r2.thesportsdb.com/images/media/league/badge/e7er5g1696521789.png' },
  { id: 'soccer-uel',            label: 'UEFA Europa League',                 category: 'Football',    espnSlug: 'soccer/uefa.europa',        logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png' },
  { id: 'soccer-uecl',           label: 'Europa Conference League',           category: 'Football',    espnSlug: 'soccer/uefa.europa.conf',   logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/45.png' },
  { id: 'soccer-facup',          label: 'FA Cup',                             category: 'Football',    espnSlug: 'soccer/eng.fa',             logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/4.png' },
  { id: 'soccer-efl',            label: 'EFL Championship',                   category: 'Football',    espnSlug: 'soccer/eng.2',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/24.png' },
  { id: 'soccer-leagueone',      label: 'League One',                         category: 'Football',    espnSlug: 'soccer/eng.3',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/afedb31688770443.png' },
  { id: 'soccer-carabao',        label: 'Carabao Cup',                        category: 'Football',    espnSlug: 'soccer/eng.league_cup',     logo: '/carabao-cup-logo.svg', publishLogo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/41.png' },
  { id: 'soccer-bundesliga',     label: 'Bundesliga',                         category: 'Football',    espnSlug: 'soccer/ger.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png' },
  { id: 'soccer-ligue1',         label: 'Ligue 1',                            category: 'Football',    espnSlug: 'soccer/fra.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png' },
  { id: 'soccer-laliga',         label: 'La Liga',                            category: 'Football',    espnSlug: 'soccer/esp.1',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png' },
  { id: 'soccer-seriea',         label: 'Serie A',                            category: 'Football',    espnSlug: 'soccer/ita.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png' },
  { id: 'soccer-spfl',           label: 'SPFL Scottish Prem',                 category: 'Football',    espnSlug: 'soccer/sco.1',              logo: '/spfl.jpg' },
  { id: 'soccer-eredivisie',     label: 'Eredivisie',                         category: 'Football',    espnSlug: 'soccer/ned.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png' },
  { id: 'soccer-mls',            label: 'MLS',                                category: 'Football',    espnSlug: 'soccer/usa.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png' },
  { id: 'soccer-ligamx',         label: 'Liga MX',                            category: 'Football',    espnSlug: 'soccer/mex.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/22.png' },
  { id: 'soccer-brasileirao',    label: 'Brasileirão Série A',                category: 'Football',    espnSlug: 'soccer/bra.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/85.png' },
  { id: 'soccer-arg-primera',    label: 'Argentine Primera',                  category: 'Football',    espnSlug: 'soccer/arg.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/13.png' },
  { id: 'soccer-portugal',       label: 'Liga Portugal',                      category: 'Football',    espnSlug: 'soccer/por.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/14.png' },
  { id: 'soccer-superlig',       label: 'Süper Lig',                          category: 'Football',    espnSlug: 'soccer/tur.1',              logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/18.png' },
  { id: 'soccer-concacaf',       label: 'CONCACAF Champions Cup',             category: 'Football',    espnSlug: 'soccer/concacaf.champions', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2298.png' },
  { id: 'soccer-aleague',        label: 'A-League',                           category: 'Football',    espnSlug: 'soccer/aus.1',              logo: '/A-League-logo-2.png' },
  { id: 'soccer-saudipro',       label: 'Saudi Pro League',                   category: 'Football',    espnSlug: 'soccer/ksa.1',              logo: '/Roshn_Saudi_League_Logo.svg.png' },
  { id: 'soccer-jleague',        label: 'J-League',                           category: 'Football',    espnSlug: 'soccer/jpn.1',              logo: 'https://r2.thesportsdb.com/images/media/league/badge/3j8bni1675170553.png' },
  { id: 'soccer-afc',            label: 'AFC Champions League Elite',         category: 'Football',    espnSlug: 'soccer/afc.champions',      sportsdbId: '4719', logo: '/AFC.png', publishLogo: 'https://r2.thesportsdb.com/images/media/league/badge/gsbq4k1719686780.png' },
  { id: 'soccer-afc2',           label: 'AFC Champions League Two',           category: 'Football',    espnSlug: 'soccer/afc.cup',            sportsdbId: '4804', logo: 'https://r2.thesportsdb.com/images/media/league/badge/sfg2dl1719686962.png' },
  { id: 'soccer-afccl',          label: 'AFC Challenge League',               category: 'Football',    espnSlug: null,                        sportsdbId: '5485', logo: 'https://r2.thesportsdb.com/images/media/league/badge/ctg73b1721497942.png' },
  { id: 'soccer-afc-asian-cup',  label: 'AFC Asian Cup',                      category: 'Football',    espnSlug: null,                        sportsdbId: '4866', logo: 'https://r2.thesportsdb.com/images/media/league/badge/0a86rp1710997941.png' },
  { id: 'soccer-asian-cup-women', label: 'Asian Cup Women',                   category: 'Football',    espnSlug: null,                        sportsdbId: '5179', logo: 'https://r2.thesportsdb.com/images/media/league/badge/m0scwf1726416187.png' },
  { id: 'soccer-copam',          label: 'Copa Libertadores',                  category: 'Football',    espnSlug: 'soccer/conmebol.libertadores', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/26.png' },
  { id: 'soccer-cpl',            label: 'Cambodian Premier League',           category: 'Football',    espnSlug: null,                        sportsdbId: '4793', logo: '/CPL.png', publishLogo: 'https://r2.thesportsdb.com/images/media/league/badge/fdhux61655121747.png' },
  { id: 'soccer-hun-sen-cup',    label: 'Cambodian Hun Sen Cup',              category: 'Football',    espnSlug: null,                        sportsdbId: '5859', logo: 'https://r2.thesportsdb.com/images/media/league/badge/4motr51774278480.png' },

  // ── Basketball ─────────────────────────────────────────────────────────────
  { id: 'basketball-nba',        label: 'NBA',                                category: 'Basketball',  espnSlug: 'basketball/nba',            logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png' },
  { id: 'basketball-wnba',       label: 'WNBA',                               category: 'Basketball',  espnSlug: 'basketball/wnba',           logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png' },
  { id: 'basketball-ncaam',      label: 'NCAA Men\'s Basketball',             category: 'Basketball',  espnSlug: 'basketball/mens-college-basketball', logo: 'https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png' },
  { id: 'basketball-ncaaw',      label: 'NCAA Women\'s Basketball',           category: 'Basketball',  espnSlug: 'basketball/womens-college-basketball', logo: '/league-logos/basketball-ncaaw.svg' },

  // ── American Football ──────────────────────────────────────────────────────
  { id: 'football-nfl',          label: 'NFL',                                category: 'American Football', espnSlug: 'football/nfl',          logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png' },
  { id: 'football-ncaaf',        label: 'NCAA Football',                      category: 'American Football', espnSlug: 'football/college-football', logo: 'https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-football-college.png' },

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
  { id: 'indycar',               label: 'IndyCar',                             category: 'Motorsport',  espnSlug: 'racing/irl',                logo: 'https://a.espncdn.com/combiner/i?img=/i/espn/teamlogos/500/indycar_series.png' },

  // ── Combat Sports ──────────────────────────────────────────────────────────
  { id: 'ufc',                   label: 'UFC / MMA',                           category: 'Combat Sports', espnSlug: 'mma/ufc',                sportsdbId: '4443', logo: '/UFC.png', publishLogo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png' },
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
  { id: 'tennis-wta',            label: 'WTA Tour',                           category: 'Tennis',      espnSlug: 'tennis/wta',                logo: 'https://r2.thesportsdb.com/images/media/league/badge/bddhun1768230678.png' },
  { id: 'tennis-australian-open', label: 'Australian Open',                    category: 'Tennis',      espnSlug: null,                        logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Australian_Open_Logo_2017.svg' },
  { id: 'tennis-roland-garros',   label: 'Roland Garros',                      category: 'Tennis',      espnSlug: null,                        logo: 'https://images.prismic.io/fft-rg-site%2F95765448-c7fa-428b-b565-8368dba90b17_logo.svg' },
  { id: 'tennis-wimbledon',       label: 'Wimbledon',                          category: 'Tennis',      espnSlug: null,                        logo: 'https://www.wimbledon.com/v0_73_4/_next/static/media/Logo-Wimbledon.08b~dzd_x4~i1.svg' },
  { id: 'tennis-us-open',         label: 'US Open',                            category: 'Tennis',      espnSlug: null,                        logo: 'https://www.usopen.org/assets/images/misc/apple-touch-icon-192x192.png' },

  // ── Golf ───────────────────────────────────────────────────────────────────
  { id: 'golf-pga',              label: 'PGA Tour',                           category: 'Golf',        espnSlug: 'golf/pga',                  logo: '/PGA_Tour_logo.svg' },
  { id: 'golf-lpga',             label: 'LPGA Tour',                          category: 'Golf',        espnSlug: 'golf/lpga',                 logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/lpga.png' },
  // ── Cycling ────────────────────────────────────────────────────────────────
  { id: 'cycling-uci',           label: 'UCI World Tour',                     category: 'Cycling',     espnSlug: null,                        sportsdbId: '4465', logo: 'https://r2.thesportsdb.com/images/media/league/badge/igahc11535183469.png' },
  { id: 'cycling-giro',          label: "Giro d'Italia",                     category: 'Cycling',     espnSlug: null,                        logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Giro_d%27Italia_-_Logo_2018.svg' },
].map((sport) => ({
  ...sport,
  logo: LOCAL_LEAGUE_LOGOS[sport.id] ?? sport.logo,
  publishLogo: sport.publishLogo,
}));

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
  'Cycling',
];

export const FOOTBALL_LEAGUE_ORDER = [
  'soccer-epl',
  'soccer-ucl',
  'soccer-fifa-world-cup-2026',
  'soccer-uel',
  'soccer-uecl',
  'soccer-facup',
  'soccer-cpl',
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
  'soccer-ligamx',
  'soccer-brasileirao',
  'soccer-arg-primera',
  'soccer-portugal',
  'soccer-superlig',
  'soccer-concacaf',
  'soccer-aleague',
  'soccer-saudipro',
  'soccer-jleague',
  'soccer-afc',
  'soccer-afc2',
  'soccer-afccl',
  'soccer-afc-asian-cup',
  'soccer-asian-cup-women',
  'soccer-copam',
  'soccer-hun-sen-cup',
];

/** Category logo URLs — used in sidebar instead of emojis */
export const CATEGORY_LOGOS: Record<string, string> = {
  'Football':            '/league-logos/soccer-laliga.png',
  'Basketball':          'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  'American Football':   'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  'Baseball':            'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
  'Ice Hockey':          'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  'Cricket':             'https://r2.thesportsdb.com/images/media/league/badge/gaiti11741709844.png',
  'Motorsport':          'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png',
  'Combat Sports':       'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png',
  'Rugby':               'https://r2.thesportsdb.com/images/media/league/badge/7h1wr91738670253.png',
  'Rugby League':        'https://r2.thesportsdb.com/images/media/league/badge/gsztcj1552071996.png',
  'Australian Football': 'https://a.espncdn.com/i/teamlogos/leagues/500/afl.png',
  'Tennis':              'https://r2.thesportsdb.com/images/media/league/badge/q7aej51769857150.png',
  'Golf':                'https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500/pgatour.png',
  'Cycling':             'https://r2.thesportsdb.com/images/media/league/badge/igahc11535183469.png',
};

// ── League abbreviations for AI payloads (saves tokens) ──────────────────────
// Maps full leagueLabel → short code the AI understands natively
export const LEAGUE_SHORT: Record<string, string> = {
  'EPL': 'EPL',
  'UEFA Champions League': 'UCL',
  '2026 FIFA World Cup': 'WC26',
  'UEFA Europa League': 'UEL',
  'Europa Conference League': 'UECL',
  'FA Cup': 'FAC',
  'EFL Championship': 'EFL',
  'League One': 'L1E',
  'Carabao Cup': 'CC',
  'Bundesliga': 'BUN',
  'Ligue 1': 'L1F',
  'La Liga': 'LLG',
  'Serie A': 'SEA',
  'SPFL Scottish Prem': 'SPFL',
  'Eredivisie': 'ERE',
  'MLS': 'MLS',
  'Liga MX': 'LMX',
  'Brasileirão Série A': 'BRA',
  'Argentine Primera': 'ARG',
  'Liga Portugal': 'POR',
  'Süper Lig': 'TUR',
  'CONCACAF Champions Cup': 'CCC',
  'A-League': 'ALE',
  'Saudi Pro League': 'SPL',
  'J-League': 'JLG',
  'AFC Champions League Elite': 'AFCE',
  'AFC Champions League Two': 'AFC2',
  'AFC Challenge League': 'AFCL',
  'AFC Asian Cup': 'AAC',
  'Asian Cup Women': 'AACW',
  'Copa Libertadores': 'COP',
  'Cambodian Premier League': 'CPL',
  'Cambodian Hun Sen Cup': 'HSC',
  'NBA': 'NBA',
  'WNBA': 'WNBA',
  "NCAA Men's Basketball": 'NCAAM',
  "NCAA Women's Basketball": 'NCAAW',
  'NFL': 'NFL',
  'NCAA Football': 'NCAAF',
  'MLB': 'MLB',
  'NHL': 'NHL',
  'IPL': 'IPL',
  'Big Bash League': 'BBL',
  'Formula 1': 'F1',
  'MotoGP': 'MGP',
  'IndyCar': 'IND',
  'UFC / MMA': 'UFC',
  'PFL / Bellator': 'PFL',
  'Boxing': 'BOX',
  'Super Rugby Pacific': 'SRP',
  'Six Nations': '6N',
  'Premiership Rugby': 'PRU',
  'Top 14': 'T14',
  'United Rugby Championship': 'URC',
  'Champions Cup': 'RCC',
  'The Rugby Championship': 'TRC',
  'NRL': 'NRL',
  'AFL': 'AFL',
  'ATP Tour': 'ATP',
  'WTA Tour': 'WTA',
  'Australian Open': 'AO',
  'Roland Garros': 'RG',
  'Wimbledon': 'WIM',
  'US Open': 'USO',
  'PGA Tour': 'PGA',
  'LPGA Tour': 'LPGA',
  'UCI World Tour': 'UCI',
  "Giro d'Italia": 'GDI',
};

// ── League popularity scores (higher = more globally watched) ────────────────
// Used to rank leagues in AI results: Football first, then by global viewership
export const LEAGUE_POPULARITY: Record<string, number> = {
  // Football — highest global viewership
  'WC26': 100, 'EPL': 100, 'UCL': 99, 'LLG': 95, 'BUN': 93, 'SEA': 92,
  'L1F': 90, 'UEL': 88, 'COP': 85, 'UECL': 82, 'FAC': 80,
  'EFL': 70, 'CC': 68, 'MLS': 65, 'SPFL': 60, 'ERE': 58,
  'SPL': 55, 'ALE': 50, 'JLG': 48, 'AFCE': 45, 'AFC2': 40,
  'AFCL': 38, 'AAC': 42, 'AACW': 35, 'CPL': 30, 'HSC': 28, 'L1E': 55,
  // Basketball
  'NBA': 90, 'NCAAM': 65, 'WNBA': 55, 'NCAAW': 50,
  // American Football
  'NFL': 88, 'NCAAF': 60,
  // Baseball
  'MLB': 70,
  // Ice Hockey
  'NHL': 72,
  // Cricket
  'IPL': 80, 'BBL': 55,
  // Motorsport
  'F1': 88, 'MGP': 60, 'IND': 55,
  // Combat Sports
  'UFC': 78, 'PFL': 45, 'BOX': 72,
  // Rugby
  'SRP': 50, '6N': 65, 'PRU': 48, 'T14': 47, 'URC': 45, 'RCC': 55, 'TRC': 50,
  // Rugby League
  'NRL': 52,
  // Australian Football
  'AFL': 50,
  // Tennis
  'ATP': 70, 'WTA': 60,
  // Golf
  'PGA': 62, 'LPGA': 45,
  // Cycling
  'UCI': 40, 'GDI': 65,
};

// ── Per-league max picks (hard cap after AI scoring) ─────────────────────────
// High-volume leagues (MLB, NHL, NBA) are capped tighter because they have
// 10-15 games per day. Elite football leagues get more slots.
export const LEAGUE_MAX_PICKS: Record<string, number> = {
  // ── Tier 1: Premium leagues — high cap ──────────────────────────────────
  'WC26': 104, 'EPL': 50, 'UCL': 40, 'LLG': 40, 'BUN': 30, 'SEA': 30,
  'L1F': 30, 'UEL': 30, 'COP': 30, 'UECL': 20, 'FAC': 25,
  // ── Tier 2: Good leagues — moderate cap ─────────────────────────────────
  'EFL': 10, 'CC': 10, 'MLS': 15, 'SPFL': 8, 'ERE': 10,
  'SPL': 8, 'ALE': 8, 'JLG': 8, 'AFCE': 8, 'AFC2': 6,
  'AFCL': 6, 'AAC': 6, 'AACW': 6, 'CPL': 6, 'HSC': 6, 'L1E': 5,
  // ── Tier 3: High-volume US sports — tight cap ──────────────────────────
  'NBA': 8, 'NCAAM': 6, 'WNBA': 6, 'NCAAW': 4,
  'NFL': 12, 'NCAAF': 8,
  'MLB': 8,
  'NHL': 8,
  // Cricket
  'IPL': 20, 'BBL': 10,
  // Motorsport — small calendars, show all
  'F1': 30, 'MGP': 20, 'IND': 20,
  // Combat Sports
  'UFC': 20, 'PFL': 10, 'BOX': 15,
  // Rugby
  'SRP': 12, '6N': 20, 'PRU': 8, 'T14': 8, 'URC': 8, 'RCC': 12, 'TRC': 8,
  'NRL': 12,
  'AFL': 12,
  'ATP': 12, 'WTA': 8,
  'PGA': 8, 'LPGA': 8,
  'UCI': 15, 'GDI': 21,
};

/** Get abbreviated league name for AI payloads */
export function getLeagueAbbrev(label: string): string {
  return LEAGUE_SHORT[label] ?? label.slice(0, 6);
}

/** Get popularity score for a league abbreviation (0-100, default 30) */
export function getLeaguePopularity(abbrev: string): number {
  return LEAGUE_POPULARITY[abbrev] ?? 30;
}

/** Get max picks allowed for a league abbreviation */
export function getLeagueMaxPicks(abbrev: string): number {
  return LEAGUE_MAX_PICKS[abbrev] ?? 2;
}

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
