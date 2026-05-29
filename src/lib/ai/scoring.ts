// Deterministic candidate scoring for the AI Finder.
//
// Why this exists: the model's job is *judgement on borderline calls*, not
// memorisation of which teams matter. Anything we can decide reliably from
// metadata (league popularity, derby pair, race vs practice, marquee team,
// user history) belongs here — it's free, deterministic, and lets us:
//   1. Shrink the system prompt (no giant derby/team enumerations).
//   2. Pre-filter the candidate list before paying Groq tokens.
//   3. Attach human-readable reasons to picks the AI doesn't justify.
//
// All data is kept in this single module so future updates land in one place.

import { LEAGUE_POPULARITY, LEAGUE_MAX_PICKS } from '@/lib/config';
import type { MatchCandidate } from './schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Marquee teams per league abbreviation — the globally watched draws.
// Used both for scoring and to inform the AI via the User Profile block.
// ─────────────────────────────────────────────────────────────────────────────
export const MARQUEE_TEAMS: Record<string, readonly string[]> = {
  EPL: ['Man City', 'Manchester City', 'Liverpool', 'Arsenal', 'Man Utd', 'Manchester United',
    'Chelsea', 'Tottenham', 'Newcastle', 'Aston Villa'],
  LAL: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Atlético Madrid', 'Real Sociedad',
    'Athletic Club', 'Athletic Bilbao', 'Villarreal', 'Real Betis', 'Sevilla'],
  BUN: ['Bayern Munich', 'Bayern', 'Borussia Dortmund', 'Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'Leverkusen'],
  SEA: ['Inter', 'Inter Milan', 'AC Milan', 'Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina'],
  LI1: ['PSG', 'Paris Saint-Germain', 'Marseille', 'Lyon', 'Monaco'],
  UCL: [], // every fixture is marquee — handled via league popularity
  UEL: [],
  MLS: ['Inter Miami', 'LA Galaxy', 'LAFC'],
  NBA: ['Lakers', 'Celtics', 'Warriors', 'Bulls', 'Knicks', 'Heat', 'Bucks', 'Nuggets',
    'Mavericks', 'Mavs', '76ers', 'Sixers', 'Suns', 'Clippers', 'Rockets', 'Raptors', 'Thunder'],
  NFL: [], // every regular-season game is high-value
  NHL: ['Rangers', 'Bruins', 'Canadiens', 'Maple Leafs', 'Red Wings', 'Blackhawks',
    'Oilers', 'Flames', 'Penguins', 'Capitals', 'Islanders'],
  MLB: ['Yankees', 'Red Sox', 'Dodgers', 'Giants', 'Cubs', 'Cardinals', 'Mets', 'White Sox'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Derby / rivalry pairs — always must_watch when both teams appear in a title.
// Stored as alphabetically-sorted pairs for O(1) lookup.
// ─────────────────────────────────────────────────────────────────────────────
const DERBY_RAW: ReadonlyArray<readonly [string, string]> = [
  // Football
  ['Man City', 'Liverpool'], ['Man Utd', 'Liverpool'], ['Arsenal', 'Tottenham'],
  ['Real Madrid', 'Barcelona'], ['AC Milan', 'Inter'], ['Boca', 'River'],
  ['Bayern', 'Dortmund'], ['Celtic', 'Rangers'], ['Galatasaray', 'Fenerbahce'],
  ['Roma', 'Lazio'], ['Ajax', 'Feyenoord'], ['PSG', 'Marseille'],
  ['Benfica', 'Porto'], ['Al Ahly', 'Zamalek'], ['Juventus', 'Inter'],
  ['Atletico', 'Real Madrid'], ['Man Utd', 'Man City'], ['Chelsea', 'Arsenal'],
  ['Liverpool', 'Everton'], ['Tottenham', 'West Ham'],
  // NBA
  ['Lakers', 'Celtics'], ['Lakers', 'Warriors'], ['Celtics', '76ers'],
  ['Knicks', 'Nets'], ['Bulls', 'Pistons'], ['Heat', 'Knicks'],
  ['Warriors', 'Clippers'], ['Mavs', 'Spurs'], ['Rockets', 'Warriors'],
  ['Rockets', 'Lakers'], ['Raptors', 'Celtics'], ['Raptors', 'Heat'],
  ['Bulls', 'Celtics'], ['Knicks', 'Celtics'], ['Thunder', 'Nuggets'],
  // NFL
  ['Cowboys', 'Eagles'], ['Packers', 'Bears'], ['49ers', 'Seahawks'],
  ['Steelers', 'Ravens'], ['Chiefs', 'Raiders'], ['Patriots', 'Jets'],
  ['Giants', 'Eagles'], ['Saints', 'Falcons'],
  // NHL
  ['Rangers', 'Islanders'], ['Bruins', 'Canadiens'], ['Penguins', 'Capitals'],
  ['Blackhawks', 'Red Wings'], ['Oilers', 'Flames'], ['Maple Leafs', 'Canadiens'],
  // MLB
  ['Yankees', 'Red Sox'], ['Dodgers', 'Giants'], ['Cubs', 'Cardinals'],
  ['Mets', 'Yankees'], ['White Sox', 'Cubs'],
];

function isDerby(title: string): boolean {
  const lower = title.toLowerCase();
  // Quick exit: must contain ' v ' or ' vs '
  const sep = lower.includes(' v ') ? ' v ' : lower.includes(' vs ') ? ' vs ' : null;
  if (!sep) return false;
  const [home, away] = lower.split(sep).map((s) => s.trim());
  for (const [a, b] of DERBY_RAW) {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if ((home.includes(al) && away.includes(bl)) || (home.includes(bl) && away.includes(al))) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-race / non-main-event keywords — used to demote practice/warmup/qualifying.
// ─────────────────────────────────────────────────────────────────────────────
const NON_MAIN_KEYWORDS = [
  'practice', 'warm up', 'warm-up', 'warmup', 'fp1', 'fp2', 'fp3', 'fp4',
  'free practice', 'shakedown', 'press conf', 'pre-race', 'post-race',
];
const QUALIFYING_KEYWORDS = ['qualif', 'sprint shootout'];

export function isNonMainSession(title: string): boolean {
  const t = title.toLowerCase();
  return NON_MAIN_KEYWORDS.some((k) => t.includes(k));
}

export function isQualifying(title: string): boolean {
  const t = title.toLowerCase();
  return QUALIFYING_KEYWORDS.some((k) => t.includes(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────
export interface ScoreContext {
  /** Leagues the user historically picks from (abbrev → soft preference 0-1). */
  preferredLeagues?: Map<string, number>;
  /** Teams the user historically picks (lowercased). */
  preferredTeams?: Set<string>;
  /** Leagues the user consistently skips (abbrev set). */
  excludedLeagues?: Set<string>;
}

export interface ScoredCandidate {
  candidate: MatchCandidate;
  score: number; // 0-100
  reason: string;
}

/**
 * Pure scoring function. Higher = more bar-worthy. Inputs are immutable.
 *
 * Scoring buckets:
 *   league popularity   0-50   (LEAGUE_POPULARITY directly)
 *   derby bonus         +25    (both teams in a known rivalry)
 *   marquee bonus       +12    (at least one team is league-marquee)
 *   user pref league    +15
 *   user pref team      +10
 *   non-main session    -30    (practice/warmup)
 *   qualifying          -10
 *   excluded league     -40
 */
export function scoreCandidate(c: MatchCandidate, ctx: ScoreContext = {}): ScoredCandidate {
  const abbrev = c.l || '';
  const title = c.t || '';
  let score = 0;
  const reasons: string[] = [];

  // League popularity is the base signal.
  const pop = LEAGUE_POPULARITY[abbrev] ?? 30;
  score += Math.min(50, pop / 2);

  // User exclusion is the hardest negative.
  if (ctx.excludedLeagues?.has(abbrev)) {
    score -= 40;
    reasons.push('league you usually skip');
  }

  // Derby beats everything else when present.
  if (isDerby(title)) {
    score += 25;
    reasons.push('classic rivalry');
  }

  // Marquee team bonus — only if not a derby (already covered).
  else if (MARQUEE_TEAMS[abbrev]?.length) {
    const lower = title.toLowerCase();
    if (MARQUEE_TEAMS[abbrev].some((t) => lower.includes(t.toLowerCase()))) {
      score += 12;
      reasons.push('marquee team');
    }
  }

  // Personal signals.
  if (ctx.preferredLeagues?.has(abbrev)) {
    const w = ctx.preferredLeagues.get(abbrev) ?? 0;
    score += 15 * Math.min(1, w);
    reasons.push('matches your league taste');
  }
  if (ctx.preferredTeams?.size) {
    const lower = title.toLowerCase();
    for (const team of ctx.preferredTeams) {
      if (team.length >= 3 && lower.includes(team)) {
        score += 10;
        reasons.push('team you pick often');
        break;
      }
    }
  }

  // Non-main session demotion. Apply AFTER positive signals so a marquee team
  // in a practice session still ranks below their actual race.
  if (isNonMainSession(title)) {
    score -= 30;
    reasons.push('practice / warm-up');
  } else if (isQualifying(title)) {
    score -= 10;
    reasons.push('qualifying session');
  }

  // Featured items the user already starred carry their own weight.
  if (c.sel) {
    score += 5;
    reasons.push('already on your schedule');
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    candidate: c,
    score: clamped,
    reason: reasons[0] ?? 'general interest',
  };
}

/**
 * Pre-filter the candidate list to the top N by deterministic score, keeping
 * enough headroom (3x cap budget by league) so the LLM still has room to
 * make subjective calls within a sensible set.
 *
 * Returns the trimmed list AND a quick map from candidate.id → score so the
 * caller can later sort or attach reasons.
 */
export function preFilterCandidates(
  candidates: MatchCandidate[],
  ctx: ScoreContext,
  maxTotal: number,
): { kept: MatchCandidate[]; scores: Map<string, ScoredCandidate> } {
  const scored = candidates.map((c) => scoreCandidate(c, ctx));
  const byId = new Map<string, ScoredCandidate>();
  for (const s of scored) byId.set(s.candidate.id, s);

  // Cap per-league to (LEAGUE_MAX_PICKS[abbrev] ?? 4) * 3 so we never spend
  // tokens describing 40 NBA games when only ~10 will survive post-filtering.
  const perLeague = new Map<string, ScoredCandidate[]>();
  for (const s of scored) {
    const a = s.candidate.l || 'UNK';
    if (!perLeague.has(a)) perLeague.set(a, []);
    perLeague.get(a)!.push(s);
  }

  const kept: MatchCandidate[] = [];
  for (const [abbrev, list] of perLeague) {
    const cap = (LEAGUE_MAX_PICKS[abbrev] ?? 4) * 3;
    list.sort((a, b) => b.score - a.score);
    for (const s of list.slice(0, cap)) kept.push(s.candidate);
  }

  // Final global cap: sort everything we kept by score and trim to maxTotal.
  kept.sort((a, b) => (byId.get(b.id)!.score) - (byId.get(a.id)!.score));
  return { kept: kept.slice(0, maxTotal), scores: byId };
}
