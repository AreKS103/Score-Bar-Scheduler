/**
 * marchMadness.ts
 *
 * Centralised detection and label-mapping for NCAA Men's Basketball Tournament
 * (March Madness) games. All logic lives here so that detection is consistent
 * across every code path that processes `basketball-ncaam` events.
 *
 * Detection uses a three-condition fallback chain — any one of these is enough:
 *  1. Season type ID = "3" (ESPN postseason flag)
 *  2. Event notes headline contains "NCAA Tournament"
 *  3. At least one competitor has a seed (curatedRank.current 1–16)
 *
 * No dates are hardcoded — the detection fires automatically whenever ESPN
 * signals tournament play.
 */

const TOURNAMENT_PREFIX = 'NCAA Tournament - ';

/** Maps the raw ESPN round value (after stripping the prefix) to a display label. */
export const MARCH_MADNESS_ROUND_MAP: Record<string, string> = {
  'First Four':            'First Four',
  'First Round':           'Round of 64',
  'Second Round':          'Round of 32',
  'Sweet Sixteen':         'Sweet 16',
  'Elite Eight':           'Elite Eight',
  'National Semifinal':    'Final Four',
  'National Championship': 'Championship',
};

export interface TournamentGameInput {
  /** Top-level season type ID from `data.leagues[0].season.type.id` */
  seasonTypeId?: string | number;
  /** `event.notes[0].headline` */
  notesHeadline?: string;
  /** Competitor objects that may carry `curatedRank` */
  competitors?: Array<{ curatedRank?: { current?: number } }>;
}

export interface TournamentGameInfo {
  /** "March Madness" during tournament, "NCAA Men's Basketball" otherwise */
  leagueLabel: string;
  /** Mapped round label e.g. "Round of 64", or "" when unavailable */
  round: string;
}

function extractRoundLabel(headline: string): string {
  const raw = headline.startsWith(TOURNAMENT_PREFIX)
    ? headline.slice(TOURNAMENT_PREFIX.length)
    : headline;
  return MARCH_MADNESS_ROUND_MAP[raw] ?? raw;
}

function isTournamentGame(input: TournamentGameInput): boolean {
  // Condition 1: ESPN postseason season-type flag
  if (String(input.seasonTypeId ?? '') === '3') return true;

  // Condition 2: notes headline contains "NCAA Tournament"
  if (input.notesHeadline?.includes('NCAA Tournament')) return true;

  // Condition 3: seeds present (seeds only exist during tournament play)
  if (
    input.competitors?.some(c => {
      const rank = c.curatedRank?.current;
      return rank !== undefined && rank >= 1 && rank <= 16;
    })
  ) return true;

  return false;
}

/**
 * Given raw ESPN data for a single `basketball-ncaam` game, returns the
 * correct league label and round string for display.
 */
export function normalizeTournamentGame(input: TournamentGameInput): TournamentGameInfo {
  if (!isTournamentGame(input)) {
    return { leagueLabel: "NCAA Men's Basketball", round: '' };
  }
  const round = input.notesHeadline ? extractRoundLabel(input.notesHeadline) : '';
  return { leagueLabel: 'March Madness', round };
}

/**
 * Prepends the seed number to a team name when a valid tournament seed (1–16)
 * is present on the competitor. Returns the name unchanged otherwise.
 *
 * Example: "(#1) Florida"
 */
export function formatTeamWithSeed(
  teamName: string,
  curatedRank?: { current?: number },
): string {
  const seed = curatedRank?.current;
  if (seed === undefined || seed < 1 || seed > 16) return teamName;
  return `(#${seed}) ${teamName}`;
}
