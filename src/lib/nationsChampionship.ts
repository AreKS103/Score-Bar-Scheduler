/**
 * Nations Championship (2026+) — TheSportsDB league 5852.
 * Pool matches are published per round; season/next endpoints are truncated on the free tier.
 */

export const NATIONS_CHAMPIONSHIP_SPORT_ID = 'rugby-nations-championship';
export const NATIONS_CHAMPIONSHIP_SPORTSDB_ID = '5852';
export const NATIONS_CHAMPIONSHIP_LABEL = 'Nations Championship';
export const NATIONS_CHAMPIONSHIP_LOGO =
  'https://r2.thesportsdb.com/images/media/league/badge/jifczi1773608397.png';

/** Max rounds to probe (pool = 6; finals may land in 7+ when SportsDB adds them). */
export const NATIONS_CHAMPIONSHIP_MAX_ROUNDS = 12;

/** Strip TheSportsDB suffix e.g. "England Rugby" → "England". */
export function stripRugbyTeamSuffix(name: string): string {
  return (name ?? '').replace(/\s+Rugby$/i, '').trim();
}

/** Normalise a matchup key for cross-reference checks. */
export function nationsMatchupKey(home: string, away: string): string {
  const a = stripRugbyTeamSuffix(home).toLowerCase();
  const b = stripRugbyTeamSuffix(away).toLowerCase();
  return [a, b].sort().join('|');
}

/** Anchor fixtures from nationschampionshiprugby.com (verification only). */
export const NATIONS_CHAMPIONSHIP_ANCHOR_FIXTURES = [
  { date: '2026-07-04', home: 'New Zealand', away: 'France', venue: 'One NZ' },
  { date: '2026-07-04', home: 'South Africa', away: 'England', venue: 'Ellis Park' },
  { date: '2026-07-11', home: 'Australia', away: 'France', venue: 'Suncorp' },
  { date: '2026-11-07', home: 'Scotland', away: 'New Zealand', venue: 'Murrayfield' },
] as const;

export function seasonYearsForRange(startDate: string, endDate: string): number[] {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year++) years.push(year);
  return years;
}
