import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getAIModel, getFallbackModel, type AIProviderResult } from '@/lib/ai/provider';
import { MatchFinderResponseSchema, MatchRatingSchema, type MatchFinderResponse } from '@/lib/ai/schemas';
import { LEAGUE_MAX_PICKS } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

// ── Upstash Redis sliding-window rate limiter (50 req/day/IP) ───────────────

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(50, '1 d'),
  analytics: true,
  prefix: 'ai-matches',
});

// ── Resolve client IP (Vercel-safe, spoof-resistant) ────────────────────────

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous'
  );
}

// ── System prompt: sports-bar curator ────────────────────────────────────────

const SYSTEM_PROMPT = `You curate a sports-bar big-screen schedule. Default is EXCLUDE. Only include matches a crowd would genuinely cheer for. Be SELECTIVE — quality over quantity.

CRITICAL RULES:
- You will receive a numbered list of matches grouped by league.
- You may ONLY return IDs that appear in the input. NEVER invent or hallucinate matches.
- If an ID is not in the input, do NOT include it.
- NEVER include matches from Liga MX, Mexican soccer, or any league labeled MX.
- When in doubt, EXCLUDE. A premium bar schedule should feel curated, not exhaustive.

DERBIES & RIVALRIES — always must_watch when they appear:
Football: Man City v Liverpool, Man Utd v Liverpool, Arsenal v Tottenham, Real Madrid v Barcelona, AC Milan v Inter, Boca v River, Bayern v Dortmund, Celtic v Rangers, Galatasaray v Fenerbahce, Roma v Lazio, Ajax v Feyenoord, PSG v Marseille, Benfica v Porto, Al Ahly v Zamalek, Juventus v Inter, Atletico v Real Madrid, Man Utd v Man City, Chelsea v Arsenal, Liverpool v Everton, Tottenham v West Ham
NBA: Lakers v Celtics, Lakers v Warriors, Celtics v 76ers, Knicks v Nets, Bulls v Pistons, Heat v Knicks, Warriors v Clippers, Mavs v Spurs, Rockets v Warriors, Rockets v Lakers, Raptors v Celtics, Raptors v Heat, Bulls v Celtics, Knicks v Celtics, Thunder v Nuggets
NFL: Cowboys v Eagles, Packers v Bears, 49ers v Seahawks, Steelers v Ravens, Chiefs v Raiders, Patriots v Jets, Giants v Eagles, Saints v Falcons
NHL: Rangers v Islanders, Bruins v Canadiens, Penguins v Capitals, Blackhawks v Red Wings, Oilers v Flames, Maple Leafs v Canadiens
MLB: Yankees v Red Sox, Dodgers v Giants, Cubs v Cardinals, Mets v Yankees, White Sox v Cubs

═══════════════════════════════════════════════════════════
must_watch — Global mega-events. Bars fill up. 100M+ viewers or culturally defining moments.
═══════════════════════════════════════════════════════════

FOOTBALL (Soccer):
- UEFA Champions League: knockout rounds, semi-finals, final (400M+ cumulative viewers)
- UEFA Europa League: semi-finals and final
- Premier League: top-4 clashes, title deciders, relegation six-pointers
- La Liga: El Clásico (Real Madrid v Barcelona), top-4 clashes
- Any domestic cup final (FA Cup, Copa del Rey, DFB-Pokal, Coppa Italia)
- Copa Libertadores: knockout rounds and final (massive in South America, 100M+)
- Any rivalry/derby listed above

MOTORSPORT:
- F1: Grand Prix RACES and Qualifying — always must_watch (~70M+ viewers per race globally). Sprint Races and Practice are secondary (see "high" below).
- MotoGP: RACES only — always must_watch (~300M+ cumulative viewers globally). Practice and qualifying are secondary.

COMBAT SPORTS:
- UFC: title fights, main events, and any fight with a top-10 ranked fighter — always must_watch (massive PPV draws, bars pack for fight nights)
- Boxing: ANY listed professional bout — always must_watch (historic bar sport, every fight draws)
- PFL: playoff fights and finals only

BASKETBALL:
- NBA: playoffs, play-in tournament, Finals — always must_watch
- NBA regular season: games featuring Lakers, Celtics, Warriors, Knicks, Heat, Bucks, Nuggets, Mavericks, 76ers, Suns, Clippers — these are the most-watched NBA teams globally
- NCAA March Madness: tournament games (not regular season)

AMERICAN FOOTBALL:
- NFL: ALL regular season and playoff games — always must_watch (Super Bowl alone draws 120M+ US viewers, every NFL game is a bar event)
- NFL: preseason — exclude unless it's a marquee matchup

CRICKET:
- IPL: ALL matches — always must_watch (500M+ viewers, biggest cricket league globally)
- International Test matches: knockout stages, finals, Ashes series
- Cricket World Cup: ALL matches

TENNIS:
- Grand Slams: finals, semi-finals, and any match with top-10 players — always must_watch
- Grand Slams: early rounds with top-20 players

RUGBY:
- Six Nations: ALL matches — always must_watch (massive in UK, Ireland, France, Italy)
- Rugby World Cup: ALL matches
- NRL (Australia): finals series and Grand Final

CYCLING:
- UCI World Tour: Monuments (Milan-San Remo, Tour of Flanders, Paris-Roubaix, Liège-Bastogne-Liège, Giro di Lombardia) and Grand Tour stages (Tour de France, Giro d'Italia, Vuelta a España) — always must_watch

═══════════════════════════════════════════════════════════
high — Strong regional/global interest. Dedicated fanbases. Bars show them on available screens.
═══════════════════════════════════════════════════════════

FOOTBALL (Soccer):
- Premier League: matches involving top-6 teams (Man City, Arsenal, Liverpool, Man Utd, Chelsea, Tottenham, Newcastle, Aston Villa). Mid-table clashes (e.g. Bournemouth v Brentford, Wolves v Crystal Palace) = EXCLUDE.
- La Liga: matches involving Real Madrid, Barcelona, Atletico Madrid, Real Sociedad, Athletic Club, Villarreal, Real Betis. Mid/lower-table clashes (e.g. Getafe v Celta Vigo, Valencia v Espanyol, Levante v Alaves) = EXCLUDE.
- Bundesliga: matches involving Bayern Munich, Borussia Dortmund, RB Leipzig, Bayer Leverkusen. Mid-table clashes (e.g. Hoffenheim v Mainz, Werder Bremen v Augsburg) = EXCLUDE.
- Serie A: matches involving Inter, AC Milan, Juventus, Napoli, Roma, Lazio, Atalanta, Fiorentina. Mid/lower-table clashes (e.g. Sassuolo v Cagliari, Lecce v Empoli, Verona v Monza) = EXCLUDE.
- Ligue 1: PSG matches and top-4 clashes only. Mid-table = EXCLUDE.
- EFL Championship: playoff matches, top-2 clashes, and matches involving historically big clubs (Leeds, Leicester, Southampton, Sunderland). Mid-table = EXCLUDE.
- FA Cup: rounds from quarter-finals onwards, or giant-killings (lower-league team beating top-flight opponent)
- Carabao Cup: semi-finals and final only
- UEFA Europa League: knockout rounds from quarter-finals onwards
- UEFA Conference League: semi-finals and final only
- MLS: playoffs, finals, and matches with Messi/Inter Miami or other globally recognisable stars
- Eredivisie: matches involving Ajax, PSV, or Feyenoord only
- Scottish Premiership: Old Firm (Celtic v Rangers) is must_watch, matches involving Celtic or Rangers are high, all others = EXCLUDE
- AFC competitions: semi-finals and final only
- Saudi Pro League: matches with globally recognisable stars (Ronaldo, Neymar, Benzema, Kante) only
- Copa Libertadores: matches involving Boca Juniors, River Plate, Flamengo, Palmeiras, Fluminense only. Obscure club clashes = EXCLUDE.
- Cambodian leagues (CPL, Hun Sen Cup): include if within the user's selected leagues

BASKETBALL:
- NBA: games with clear playoff implications or interesting storylines (even non-marquee teams)
- EuroLeague: playoffs and finals
- NCAA: regular season — only ranked matchups or rivalry games

AMERICAN FOOTBALL:
- NCAA Football: ranked team matchups, rivalry games (e.g. Alabama v Auburn, Ohio State v Michigan), playoff games
- CFL: playoffs and Grey Cup only

BASEBALL:
- MLB: division leaders, pennant-race games, classic rivalries, playoff games, World Series
- MLB: regular season games between teams with winning records
- NPB (Japan): playoffs and Japan Series

ICE HOCKEY:
- NHL: playoff games, Original Six matchups (Bruins, Canadiens, Maple Leafs, Red Wings, Blackhawks, Rangers), division leaders, traditional rivalries
- NHL: regular season games between playoff-contending teams
- IIHF World Championship: knockout rounds

MOTORSPORT:
- F1: Sprint races and Practice Sessions — high but secondary to the Grand Prix race itself
- MotoGP: Qualifying sessions and practice — secondary to the race
- IndyCar: ALL races and qualifying sessions (strong US following, ~2M+ viewers per race)

COMBAT SPORTS:
- UFC: undercard fights with ranked fighters
- PFL: regular season fights
- Boxing: amateur or lower-card events

CRICKET:
- IPL: exclude if already covered by must_watch (all IPL is must_watch)
- Big Bash League (BBL): matches with recognisable international stars
- International T20: matches between top-8 ranked nations

TENNIS:
- ATP Tour: finals and semi-finals of Masters 1000 events
- WTA Tour: finals and semi-finals of WTA 1000 events
- Grand Slams: early rounds with players ranked 20-50
- Davis Cup / Billie Jean King Cup: knockout stages

RUGBY:
- Six Nations: exclude if already must_watch (all Six Nations is must_watch)
- Premiership Rugby (England): playoffs and top-4 clashes
- Top 14 (France): playoffs and top-4 clashes
- Super Rugby Pacific: playoffs and finals
- Champions Cup: knockout rounds
- The Rugby Championship: ALL matches (Southern Hemisphere's premier international competition)
- NRL (Australia): regular season matches (massive in Australia, growing globally)
- United Rugby Championship: playoffs and finals

GOLF:
- PGA Tour: final rounds of major championships (Masters, US Open, The Open, PGA Championship)
- PGA Tour: final rounds of regular events with top-20 players in contention
- LPGA Tour: major championships and final rounds

CYCLING:
- UCI World Tour: stage races (Tour de France, Giro, Vuelta) — individual stages are high
- UCI World Tour: one-day races and classics not listed as must_watch
- World Championships and Olympic cycling events

AUSTRALIAN FOOTBALL:
- AFL: ALL matches during season (massive in Australia, 600K+ per game) — high for global bars, must_watch for Australian venues
- AFL: finals series and Grand Final — always must_watch

DEFAULT RULE:
EXCLUDE unless a sports-bar crowd would genuinely care. No-name teams with no stakes = skip.
Order by importance: must_watch first, then high.

Respond in JSON using EXACTLY this structure — no other keys:
{"ids":[{"id":"<match id string>","importance":"must_watch"},{"id":"<match id string>","importance":"high"}]}`

// ── Call AI — plain text generation + manual JSON parse ──────────────────────
// Groq does not support `Output.object()` / responseFormat JSON schema with
// structuredOutputs: false.  Instead we let the model return raw text (the
// system prompt already instructs JSON), then extract & validate with Zod.

async function callAI(provider: AIProviderResult, matchData: string): Promise<MatchFinderResponse> {
  const result = await generateText({
    model: provider.model,
    prompt: matchData,
    system: SYSTEM_PROMPT,
    temperature: 0.2,
  });

  const text = result.text.trim();

  // Extract JSON from the response — model may wrap it in markdown fences
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON. Raw: ' + text.slice(0, 200));
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    // Try to fix common JSON issues (trailing commas, unescaped chars)
    let fixed = jsonMatch[0]
      .replace(/,\s*}/g, '}')  // trailing commas before }
      .replace(/,\s*]/g, ']')  // trailing commas before ]
      .replace(/"importance"\s*:\s*"([^"]*?)"/g, (m, v) => {
        // Normalize importance values
        const valid = ['must_watch', 'high', 'medium', 'low'];
        return `"importance":"${valid.includes(v) ? v : 'high'}"`;
      });
    try {
      raw = JSON.parse(fixed);
    } catch {
      throw new Error('AI returned malformed JSON. Raw: ' + text.slice(0, 200));
    }
  }

  const parsed = MatchFinderResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('AI JSON did not match schema: ' + parsed.error.message.slice(0, 200));
  }

  return parsed.data;
}

// ── Extract user patterns from historical published schedules ───────────────
// Reads existing published_schedules from Supabase — no new storage needed.
// Analyzes patterns across time: which leagues, teams, and match types the user
// consistently selects. The more publishes, the richer the pattern data.
//
// Uses exponential weighted moving average (EWMA) for match count preference —
// more recent publishes get higher weight. This is a standard technique in
// recommendation systems and time series analysis for adaptive learning.
async function extractUserPatterns(): Promise<{
  leaguePrefs: { league: string; count: number; selectionRate: number }[];
  teamPrefs: { team: string; count: number }[];
  avgMatchesPerPublish: number;
  targetMatchCount: number;
  matchCountStdDev: number;
  totalPublishes: number;
} | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Fetch up to 20 most recent published schedules
    const { data: schedules, error } = await supabase
      .from('published_schedules')
      .select('events_snapshot, league_order, featured_leagues, published_at')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })
      .limit(20);

    if (error || !schedules?.length) return null;

    const leagueCounts = new Map<string, { total: number; selected: number }>();
    const teamCounts = new Map<string, number>();
    let totalSelected = 0;

    // Track selected match count per schedule for EWMA calculation
    const matchCounts: number[] = [];

    for (const schedule of schedules) {
      const events = (schedule.events_snapshot ?? []) as Array<{
        id: string;
        leagueLabel?: string;
        home?: string;
        away?: string;
        isSelected?: boolean;
      }>;

      let scheduleSelected = 0;

      for (const e of events) {
        const league = e.leagueLabel ?? 'Unknown';
        const entry = leagueCounts.get(league) ?? { total: 0, selected: 0 };
        entry.total++;
        if (e.isSelected) {
          entry.selected++;
          totalSelected++;
          scheduleSelected++;

          // Count teams from selected matches
          if (e.home) {
            for (const team of e.home.split(' v ')) {
              const t = team.trim();
              if (t) teamCounts.set(t, (teamCounts.get(t) ?? 0) + 1);
            }
          }
          if (e.away) {
            teamCounts.set(e.away, (teamCounts.get(e.away) ?? 0) + 1);
          }
        }
        leagueCounts.set(league, entry);
      }

      matchCounts.push(scheduleSelected);
    }

    // Build league preferences sorted by selection rate (not just count)
    // A league with 80% selection rate is more meaningful than one with 10%
    const leaguePrefs = [...leagueCounts.entries()]
      .map(([league, stats]) => ({
        league,
        count: stats.selected,
        selectionRate: stats.total > 0 ? stats.selected / stats.total : 0,
      }))
      .filter(l => l.count >= 2) // at least 2 selections across all publishes
      .sort((a, b) => b.selectionRate * b.count - a.selectionRate * a.count)
      .slice(0, 12);

    const teamPrefs = [...teamCounts.entries()]
      .map(([team, count]) => ({ team, count }))
      .filter(t => t.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // ── Exponential Weighted Moving Average (EWMA) for match count ────────
    // More recent publishes get exponentially higher weight.
    // Alpha (smoothing factor) = 0.3 — balances responsiveness vs stability.
    // This is the standard approach used in recommendation systems for
    // learning user preferences over time without storing explicit models.
    // Reference: "Exponential Smoothing for Time Series" (Hyndman & Athanasopoulos)
    const alpha = 0.3;
    let ewma = matchCounts[0] ?? 0;
    for (let i = 1; i < matchCounts.length; i++) {
      ewma = alpha * matchCounts[i] + (1 - alpha) * ewma;
    }

    // Calculate standard deviation to understand variance
    const mean = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
    const variance = matchCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / matchCounts.length;
    const stddev = Math.sqrt(variance);

    return {
      leaguePrefs,
      teamPrefs,
      avgMatchesPerPublish: schedules.length > 0 ? Math.round(totalSelected / schedules.length) : 0,
      targetMatchCount: Math.round(ewma), // EWMA-weighted target — what the user typically selects
      matchCountStdDev: Math.round(stddev),
      totalPublishes: schedules.length,
    };
  } catch {
    return null; // Gracefully degrade if auth or DB fails
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Body size guard (64 KB max — grouped format is much smaller) ───────
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > 65536) {
      return NextResponse.json(
        { error: 'Request body too large.' },
        { status: 413 }
      );
    }

    // ── IP + rate limit ─────────────────────────────────────────────────────
    const ip = getClientIP(request);
    const { success, remaining } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again tomorrow.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
      );
    }

    // ── Parse & validate body ───────────────────────────────────────────────
    const body = await request.json();
    const groups: Record<string, string[]> | undefined = body.groups;
    const filterType: string = body.filterType ?? 'week'; // 'today' | 'week' | 'month'
    const scanMode: boolean = body.scanMode ?? false; // 'all matches' scan — more inclusive

    // ── Extract user patterns from historical published schedules ─────────
    // Reads existing published_schedules from Supabase — no new storage.
    // The more the user publishes, the richer the pattern data becomes.
    const userPatterns = await extractUserPatterns();

    // Also accept frontend-provided preferences (current session selections)
    const userPreferences: { selectedLeagues?: string[]; selectedTeams?: string[] } = body.userPreferences ?? {};

    if (!groups || typeof groups !== 'object' || Object.keys(groups).length === 0) {
      return NextResponse.json(
        { error: 'groups object is required.' },
        { status: 400 }
      );
    }

    // Build token-efficient plain-text prompt grouped by league
    const lines: string[] = [];
    let matchCount = 0;
    const maxMatches = 500; // keep under token limit to avoid JSON parse errors

    for (const [league, matches] of Object.entries(groups)) {
      if (!Array.isArray(matches)) continue;
      lines.push(`[${String(league)}]`);
      for (const m of matches) {
        if (matchCount >= maxMatches) break;
        lines.push(String(m));
        matchCount++;
      }
    }

    if (matchCount === 0) {
      return NextResponse.json(
        { error: 'No matches provided.' },
        { status: 400 }
      );
    }

    const condensed = lines.join('\n');

    // ── Scan mode: append instruction to be more inclusive ──────────────────
    // When user clicks "Scan All Matches", they want a thorough sweep — show
    // every match worth watching, not just the absolute elite tier.
    // But still EXCLUDE mid-table/no-stakes games — the bar for "high" hasn't changed.
    const userPrompt = scanMode
      ? `${condensed}\n\nSCAN MODE: Do a comprehensive sweep across ALL leagues provided. Be thorough — don't miss any genuinely interesting matches. But still follow the exclusion rules above: mid-table clashes with no stakes, no-name teams, and routine fixtures should still be EXCLUDED. The difference from curated mode is that you should look at EVERY league carefully, not just the big ones. Include anything that meets the "high" criteria above.`
      : condensed;

    // ── Build user preference context from historical patterns ────────────
    let preferenceContext = '';

    // Default target match counts per filter type — baseline for all users.
    // Add small random variance (±15%) so the target isn't always the exact same number.
    const defaultTargets: Record<string, number> = {
      month: 55,
      week: 30,
      today: 18,
    };
    const baseTarget = defaultTargets[filterType] ?? 30;
    const variance = Math.round(baseTarget * 0.15 * (Math.random() * 2 - 1)); // ±15%
    const targetMin = Math.max(5, baseTarget + variance - 5);
    const targetMax = baseTarget + variance + 5;

    if (userPatterns && (userPatterns.leaguePrefs.length || userPatterns.teamPrefs.length)) {
      const topLeagues = userPatterns.leaguePrefs
        .map(l => `${l.league} (${l.count} selections, ${Math.round(l.selectionRate * 100)}% pick rate)`)
        .join(', ');
      const topTeams = userPatterns.teamPrefs
        .map(t => `${t.team} (${t.count}x)`)
        .join(', ');

      // Match count guidance: blend historical EWMA with sensible defaults.
      // If the user's historical average is very low (< 25), nudge toward the default.
      // This prevents new users with sparse data from getting too few recommendations.
      const historicalTarget = userPatterns.targetMatchCount > 0
        ? userPatterns.targetMatchCount
        : userPatterns.avgMatchesPerPublish;
      const hasStrongHistory = userPatterns.totalPublishes >= 5 && historicalTarget >= 25;
      const effectiveTarget = hasStrongHistory ? historicalTarget : Math.max(historicalTarget, Math.round(baseTarget * 0.7));
      const effectiveMin = Math.max(5, effectiveTarget + variance - 8);
      const effectiveMax = effectiveTarget + variance + 8;

      const matchCountGuidance = `\nAim for ${effectiveMin}–${effectiveMax} match recommendations for this view.` +
        (historicalTarget > 0 ? ` (Your recent average is ~${historicalTarget} matches per publish across ${userPatterns.totalPublishes} schedules.)` : '');

      preferenceContext = `\n\nUSER HISTORICAL PREFERENCES (learned from ${userPatterns.totalPublishes} published schedules):\n` +
        `You have consistently selected matches from these leagues: ${topLeagues}.\n` +
        `You frequently follow these teams: ${topTeams}.${matchCountGuidance}\n` +
        `Prioritize matches from these leagues and involving these teams. If a match involves a league or team the user has shown strong preference for, lean toward including it.`;
    } else if (userPreferences.selectedLeagues?.length || userPreferences.selectedTeams?.length) {
      // Fallback to current session preferences if no historical data
      preferenceContext = `\n\nUSER PREFERENCES (current session): You tend to follow these leagues: ${userPreferences.selectedLeagues?.join(', ') ?? 'none'}. And these teams: ${userPreferences.selectedTeams?.join(', ') ?? 'none'}. Prioritize matches from these leagues and involving these teams.\n` +
        `Aim for ${targetMin}–${targetMax} match recommendations for this view.`;
    } else {
      // No data at all — new user. Give a sensible default target.
      preferenceContext = `\n\nRECOMMENDED: Aim for ${targetMin}–${targetMax} match recommendations for this view. Be selective — only include matches a sports-bar crowd would genuinely care about.`;
    }

    // Combine everything into the final prompt
    const finalPrompt = `${userPrompt}${preferenceContext}`;

    // ── Try primary → fallback ──────────────────────────────────────────────
    const primary = getAIModel();
    let output;

    try {
      output = await callAI(primary, finalPrompt);
    } catch (primaryError) {
      console.error(`[AI Matches] Primary (${primary.provider}) failed:`, primaryError);

      const fallback = getFallbackModel();
      if (!fallback || fallback.modelId === primary.modelId) throw primaryError;

      output = await callAI(fallback, finalPrompt);
    }

    // ── Zod safeParse + strip low/medium — only return high & must_watch ───
    if (output && Array.isArray(output.ids)) {
      output.ids = output.ids.filter((r: unknown) => {
        const parsed = MatchRatingSchema.safeParse(r);
        if (!parsed.success) return false;
        return parsed.data.importance === 'must_watch' || parsed.data.importance === 'high';
      });
    }

    // ── Auto-promote sparse live-sport categories ────────────────────────────
    // MotoGP, UFC, Boxing, Cycling have so few events per window that every
    // one is worth showing. Inject any the AI missed as must_watch.
    // F1 is special: always include the Grand Prix race, but let the AI decide
    // on qualifying/sprint sessions (they're lower priority than the race itself).
    const ALWAYS_INCLUDE_ABBREVS = new Set(['MGP', 'UFC', 'BOX', 'UCI']);
    if (output && Array.isArray(output.ids)) {
      const selectedIds = new Set(output.ids.map((r: { id: string }) => r.id));
      for (const [abbrev, matches] of Object.entries(groups)) {
        if (!ALWAYS_INCLUDE_ABBREVS.has(abbrev)) continue;
        if (!Array.isArray(matches)) continue;
        for (const m of matches) {
          const idx = String(m).split(':')[0];
          if (!selectedIds.has(idx)) {
            output.ids.push({ id: idx, importance: 'must_watch' as const });
            selectedIds.add(idx);
          }
        }
      }
    }

    // ── F1 race auto-promote ────────────────────────────────────────────────
    // Grand Prix races are always must_watch. Qualifying/sprint sessions are
    // only auto-included if the AI already rated them (they're lower priority).
    if (output && Array.isArray(output.ids)) {
      const selectedIds = new Set(output.ids.map((r: { id: string }) => r.id));
      const f1Matches = Array.isArray(groups['F1']) ? groups['F1'] : [];
      for (const m of f1Matches) {
        const idx = String(m).split(':')[0];
        const title = String(m).slice(idx.length + 1).toLowerCase();
        // Only auto-promote actual Grand Prix races (not qualifying/sprint/practice)
        if (title.includes('grand prix') || title.includes('race') && !title.includes('sprint') && !title.includes('qualif') && !title.includes('practice')) {
          if (!selectedIds.has(idx)) {
            output.ids.push({ id: idx, importance: 'must_watch' as const });
            selectedIds.add(idx);
          }
        }
      }
    }

    // ── NBA marquee-team auto-promotion ─────────────────────────────────────
    // NBA has too many games for the AI to reliably pick; ensure big-market
    // teams always appear so the panel isn't football-only.
    const NBA_MARQUEE = ['Lakers', 'Celtics', 'Warriors', 'Rockets', 'Bulls',
      'Raptors', 'Knicks', 'Heat', 'Bucks', 'Nuggets', 'Mavericks'];
    if (output && Array.isArray(output.ids)) {
      const selectedIds = new Set(output.ids.map((r: { id: string }) => r.id));
      for (const m of (Array.isArray(groups['NBA']) ? groups['NBA'] : [])) {
        const idx = String(m).split(':')[0];
        const title = String(m).slice(idx.length + 1);
        if (NBA_MARQUEE.some((t) => title.includes(t)) && !selectedIds.has(idx)) {
          output.ids.push({ id: idx, importance: 'must_watch' as const });
          selectedIds.add(idx);
        }
      }
    }

    // ── Per-league caps: prevent any single league from flooding results ────
    if (output && Array.isArray(output.ids)) {
      // Map each AI id back to its league from the original groups
      const idToLeague = new Map<string, string>();
      for (const [league, matches] of Object.entries(groups)) {
        if (!Array.isArray(matches)) continue;
        for (const m of matches) {
          const idx = String(m).split(':')[0];
          idToLeague.set(idx, String(league));
        }
      }

      // Strip hallucinated IDs — only keep IDs that exist in the input
      output.ids = output.ids.filter((r: { id: string }) => idToLeague.has(r.id));

      const leagueCounts = new Map<string, number>();
      output.ids = output.ids.filter((r: { id: string; importance: string }) => {
        const league = idToLeague.get(r.id) ?? '';
        // Scan mode doubles per-league caps so good matches aren't artificially cut off
        const baseMax = LEAGUE_MAX_PICKS[league] ?? 2;
        const maxPicks = scanMode ? baseMax * 2 : baseMax;
        const current = leagueCounts.get(league) ?? 0;
        if (current >= maxPicks) return false;
        leagueCounts.set(league, current + 1);
        return true;
      });

      // ── Total budget cap ───────────────────────────────────────────────────
      // Scan mode uses a higher budget but still capped to avoid flooding
      const totalBudget = scanMode
        ? 100  // comprehensive but still curated
        : filterType === 'today' ? 80 : filterType === 'month' ? 250 : 150;
      output.ids = output.ids.slice(0, totalBudget);
    }

    return NextResponse.json(output, {
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    });
  } catch (error) {
    console.error('[AI Matches] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI recommendations. Please try again.' },
      { status: 500 }
    );
  }
}
