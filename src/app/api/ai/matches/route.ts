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

// ── User pattern types ──────────────────────────────────────────────────────

interface LeaguePref {
  league: string;
  count: number;
  selectionRate: number;
  avgPicksPerPublish: number; // How many from this league per schedule
}

interface LeagueExclusion {
  league: string;
  totalAvailable: number; // How many times this league appeared across schedules
  timesSkipped: number; // How many times user picked ZERO from it
  skipRate: number; // timesSkipped / schedulesWhereAvailable
}

interface TeamPref {
  team: string;
  count: number;
  featured: number; // How many times this team was starred/featured
}

interface TimeSlotPref {
  slot: string; // 'morning' | 'afternoon' | 'evening' | 'latenight'
  selectionRate: number;
}

interface UserPatterns {
  leaguePrefs: LeaguePref[];
  leagueExclusions: LeagueExclusion[]; // Leagues user consistently skips
  teamPrefs: TeamPref[];
  teamExclusions: string[]; // Teams available 5+ times but never picked
  timeSlotPrefs: TimeSlotPref[];
  avgMatchesPerPublish: number;
  targetMatchCount: number;
  matchCountStdDev: number;
  totalPublishes: number;
  confidence: 'low' | 'medium' | 'high'; // How much to trust the data
  perLeagueBudget: Map<string, number>; // Learned per-league pick count
}

// ── Extract user patterns from historical published schedules ───────────────
// Reads existing published_schedules from Supabase — no new storage needed.
// Analyzes patterns across time: which leagues, teams, and match types the user
// consistently selects AND consistently skips. Tracks featured matches, time
// preferences, and per-league budgets. The more publishes, the richer the data.
//
// Uses EWMA (Exponential Weighted Moving Average) with correct temporal
// ordering: oldest entries first so recent publishes get more weight.

async function extractUserPatterns(): Promise<UserPatterns | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Fetch up to 30 most recent published schedules for richer patterns
    const { data: schedules, error } = await supabase
      .from('published_schedules')
      .select('events_snapshot, league_order, featured_leagues, published_at')
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })
      .limit(30);

    if (error || !schedules?.length) return null;

    // ── Aggregate counters ───────────────────────────────────────────────────
    const leagueStats = new Map<string, {
      total: number; // total appearances across all schedules
      selected: number; // times user picked a match from this league
      featured: number; // times user starred a match from this league
      schedulesPresent: number; // in how many schedules did this league appear
      schedulesSkipped: number; // in how many did user pick ZERO from it
      picksPerSchedule: number[]; // match count per publish for per-league EWMA
    }>();
    const teamStats = new Map<string, { selected: number; available: number; featured: number }>();
    const timeSlotStats = new Map<string, { total: number; selected: number }>();
    let totalSelected = 0;

    // Track selected match count per schedule for EWMA calculation
    const matchCounts: number[] = [];

    for (const schedule of schedules) {
      const events = (schedule.events_snapshot ?? []) as Array<{
        id: string;
        leagueLabel?: string;
        home?: string;
        away?: string;
        time?: string;
        isSelected?: boolean;
        isFeatured?: boolean;
      }>;

      let scheduleSelected = 0;
      // Track per-league picks within THIS schedule
      const scheduleLeagues = new Map<string, { available: number; picked: number }>();
      // Track teams seen in this schedule
      const scheduleTeams = new Set<string>();

      for (const e of events) {
        const league = e.leagueLabel ?? 'Unknown';

        // ── League tracking ────────────────────────────────────────────────
        const ls = leagueStats.get(league) ?? {
          total: 0, selected: 0, featured: 0,
          schedulesPresent: 0, schedulesSkipped: 0, picksPerSchedule: [],
        };
        ls.total++;
        leagueStats.set(league, ls);

        // Per-schedule league counter
        const sl = scheduleLeagues.get(league) ?? { available: 0, picked: 0 };
        sl.available++;
        scheduleLeagues.set(league, sl);

        // ── Time slot tracking ─────────────────────────────────────────────
        if (e.time) {
          const hour = parseInt(e.time.split(':')[0], 10);
          let slot: string;
          if (hour >= 5 && hour < 12) slot = 'morning';
          else if (hour >= 12 && hour < 17) slot = 'afternoon';
          else if (hour >= 17 && hour < 21) slot = 'evening';
          else slot = 'latenight';
          const ts = timeSlotStats.get(slot) ?? { total: 0, selected: 0 };
          ts.total++;
          if (e.isSelected) ts.selected++;
          timeSlotStats.set(slot, ts);
        }

        // ── Team tracking (both selected AND available — for exclusion detection) ─
        const teams: string[] = [];
        if (e.home) {
          for (const part of e.home.split(' v ')) {
            const t = part.trim();
            if (t) { teams.push(t); scheduleTeams.add(t); }
          }
        }
        if (e.away) {
          const t = e.away.trim();
          if (t) { teams.push(t); scheduleTeams.add(t); }
        }
        for (const t of teams) {
          const ts = teamStats.get(t) ?? { selected: 0, available: 0, featured: 0 };
          ts.available++;
          if (e.isSelected) ts.selected++;
          if (e.isFeatured) ts.featured++;
          teamStats.set(t, ts);
        }

        if (e.isSelected) {
          ls.selected++;
          sl.picked++;
          totalSelected++;
          scheduleSelected++;
          if (e.isFeatured) ls.featured++;
        }
      }

      // ── Per-league schedule-level analysis ─────────────────────────────────
      for (const [league, sl] of scheduleLeagues) {
        const ls = leagueStats.get(league)!;
        ls.schedulesPresent++;
        ls.picksPerSchedule.push(sl.picked);
        if (sl.picked === 0 && sl.available >= 2) {
          // User had multiple options and picked none — strong skip signal
          ls.schedulesSkipped++;
        }
      }

      matchCounts.push(scheduleSelected);
    }

    // ── Build league preferences (positive signals) ──────────────────────────
    const leaguePrefs = [...leagueStats.entries()]
      .filter(([, s]) => s.selected >= 2)
      .map(([league, s]) => ({
        league,
        count: s.selected,
        selectionRate: s.total > 0 ? s.selected / s.total : 0,
        avgPicksPerPublish: s.schedulesPresent > 0
          ? Math.round((s.picksPerSchedule.reduce((a, b) => a + b, 0) / s.schedulesPresent) * 10) / 10
          : 0,
      }))
      .sort((a, b) => b.selectionRate * b.count - a.selectionRate * a.count)
      .slice(0, 15);

    // ── Build league exclusions (negative signals) ───────────────────────────
    // If user skips a league in 70%+ of schedules where it appeared, that's a
    // strong "don't want" signal. Requires at least 3 schedules for reliability.
    const leagueExclusions = [...leagueStats.entries()]
      .filter(([, s]) => s.schedulesPresent >= 3 && s.schedulesSkipped / s.schedulesPresent >= 0.7)
      .map(([league, s]) => ({
        league,
        totalAvailable: s.total,
        timesSkipped: s.schedulesSkipped,
        skipRate: Math.round((s.schedulesSkipped / s.schedulesPresent) * 100) / 100,
      }))
      .sort((a, b) => b.skipRate - a.skipRate)
      .slice(0, 10);

    // ── Build team preferences (with featured bonus) ─────────────────────────
    const teamPrefs = [...teamStats.entries()]
      .filter(([, s]) => s.selected >= 2)
      .map(([team, s]) => ({ team, count: s.selected, featured: s.featured }))
      .sort((a, b) => {
        // Featured teams get a 2x weight boost in sorting
        const scoreA = a.count + a.featured * 2;
        const scoreB = b.count + b.featured * 2;
        return scoreB - scoreA;
      })
      .slice(0, 25);

    // ── Build team exclusions ────────────────────────────────────────────────
    // Teams that appeared 5+ times across schedules but were NEVER picked
    const teamExclusions = [...teamStats.entries()]
      .filter(([, s]) => s.available >= 5 && s.selected === 0)
      .map(([team]) => team)
      .slice(0, 15);

    // ── Time slot preferences ────────────────────────────────────────────────
    const timeSlotPrefs = [...timeSlotStats.entries()]
      .map(([slot, s]) => ({
        slot,
        selectionRate: s.total > 0 ? Math.round((s.selected / s.total) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.selectionRate - a.selectionRate);

    // ── EWMA for total match count (corrected temporal ordering) ─────────
    // schedules is newest-first, so reverse to iterate oldest → newest.
    // This gives MORE weight to recent publishes as intended.
    const alpha = 0.3;
    const reversed = [...matchCounts].reverse(); // oldest first
    let ewma = reversed[0] ?? 0;
    for (let i = 1; i < reversed.length; i++) {
      ewma = alpha * reversed[i] + (1 - alpha) * ewma;
    }

    // ── Per-league budget via EWMA ───────────────────────────────────────────
    const perLeagueBudget = new Map<string, number>();
    for (const [league, s] of leagueStats) {
      if (s.picksPerSchedule.length < 3) continue; // need enough data
      const rev = [...s.picksPerSchedule].reverse();
      let leagueEwma = rev[0];
      for (let i = 1; i < rev.length; i++) {
        leagueEwma = alpha * rev[i] + (1 - alpha) * leagueEwma;
      }
      // Round up to give a small buffer over user's average
      perLeagueBudget.set(league, Math.ceil(leagueEwma * 1.3));
    }

    // ── Standard deviation for match count variance ──────────────────────────
    const mean = matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length;
    const variance = matchCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / matchCounts.length;
    const stddev = Math.sqrt(variance);

    // ── Confidence level — how much to trust the pattern data ────────────────
    let confidence: 'low' | 'medium' | 'high';
    if (schedules.length >= 10) confidence = 'high';
    else if (schedules.length >= 5) confidence = 'medium';
    else confidence = 'low';

    return {
      leaguePrefs,
      leagueExclusions,
      teamPrefs,
      teamExclusions,
      timeSlotPrefs,
      avgMatchesPerPublish: schedules.length > 0 ? Math.round(totalSelected / schedules.length) : 0,
      targetMatchCount: Math.round(ewma),
      matchCountStdDev: Math.round(stddev),
      totalPublishes: schedules.length,
      confidence,
      perLeagueBudget,
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

    if (userPatterns && userPatterns.confidence !== 'low' &&
        (userPatterns.leaguePrefs.length || userPatterns.teamPrefs.length || userPatterns.leagueExclusions.length)) {

      // ── Positive signals: leagues and teams the user actively picks ──────
      const topLeagues = userPatterns.leaguePrefs
        .map(l => `${l.league} (${Math.round(l.selectionRate * 100)}% pick rate, ~${l.avgPicksPerPublish}/schedule)`)
        .join(', ');
      const topTeams = userPatterns.teamPrefs
        .slice(0, 20)
        .map(t => {
          const suffix = t.featured > 0 ? ` ⭐${t.featured}x starred` : '';
          return `${t.team} (${t.count}x${suffix})`;
        })
        .join(', ');

      // ── Negative signals: leagues the user consistently skips ────────────
      let exclusionSection = '';
      if (userPatterns.leagueExclusions.length > 0) {
        const excludedLeagues = userPatterns.leagueExclusions
          .map(l => `${l.league} (skipped ${Math.round(l.skipRate * 100)}% of the time)`)
          .join(', ');
        exclusionSection = `\n\nLEAGUES THIS USER CONSISTENTLY SKIPS — DEPRIORITIZE (${userPatterns.confidence} confidence):\n${excludedLeagues}\n` +
          `These leagues appeared across multiple schedules but the user almost never picks matches from them. ` +
          (userPatterns.confidence === 'high'
            ? `EXCLUDE matches from these leagues unless they are genuine must_watch events (finals, rivalries, mega-events). The user has clearly shown they don't want these.`
            : `Lean toward excluding matches from these leagues, but still include genuine must_watch moments.`);
      }

      // ── Team exclusions — teams user never picks despite availability ─────
      let teamExclusionSection = '';
      if (userPatterns.teamExclusions.length > 0) {
        teamExclusionSection = `\n\nTEAMS THIS USER NEVER PICKS: ${userPatterns.teamExclusions.join(', ')}.\n` +
          `Skip matches involving these teams unless the match itself is a must_watch event.`;
      }

      // ── Per-league budget hints ──────────────────────────────────────────
      let budgetHints = '';
      if (userPatterns.perLeagueBudget.size > 0) {
        const hints = [...userPatterns.perLeagueBudget.entries()]
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 12)
          .map(([league, count]) => `${league}: ~${count}`)
          .join(', ');
        budgetHints = `\n\nPER-LEAGUE PICK TARGETS (learned from history): ${hints}.\n` +
          `Try to match these counts per league — the user has a consistent preference for this distribution.`;
      }

      // ── Time-of-day preference ───────────────────────────────────────────
      let timeSection = '';
      if (userPatterns.timeSlotPrefs.length > 0) {
        const preferred = userPatterns.timeSlotPrefs.filter(t => t.selectionRate >= 0.5);
        const avoided = userPatterns.timeSlotPrefs.filter(t => t.selectionRate < 0.2 && t.selectionRate >= 0);
        if (preferred.length > 0 || avoided.length > 0) {
          const prefStr = preferred.map(t => `${t.slot} (${Math.round(t.selectionRate * 100)}% pick rate)`).join(', ');
          const avoidStr = avoided.map(t => `${t.slot} (only ${Math.round(t.selectionRate * 100)}% pick rate)`).join(', ');
          timeSection = '\n\nTIME PREFERENCES:';
          if (prefStr) timeSection += ` Prefers ${prefStr} matches.`;
          if (avoidStr) timeSection += ` Rarely picks ${avoidStr} matches.`;
        }
      }

      // ── Match count guidance with EWMA ───────────────────────────────────
      const historicalTarget = userPatterns.targetMatchCount > 0
        ? userPatterns.targetMatchCount
        : userPatterns.avgMatchesPerPublish;
      const hasStrongHistory = userPatterns.totalPublishes >= 5 && historicalTarget >= 25;
      const effectiveTarget = hasStrongHistory ? historicalTarget : Math.max(historicalTarget, Math.round(baseTarget * 0.7));
      const effectiveMin = Math.max(5, effectiveTarget + variance - 8);
      const effectiveMax = effectiveTarget + variance + 8;

      const matchCountGuidance = `\nAim for ${effectiveMin}–${effectiveMax} match recommendations for this view.` +
        (historicalTarget > 0 ? ` (User's recent average is ~${historicalTarget} matches per publish across ${userPatterns.totalPublishes} schedules.)` : '');

      // ── Confidence preamble ──────────────────────────────────────────────
      const confidenceNote = userPatterns.confidence === 'high'
        ? `HIGH CONFIDENCE — based on ${userPatterns.totalPublishes} published schedules. Follow these patterns closely.`
        : `MEDIUM CONFIDENCE — based on ${userPatterns.totalPublishes} published schedules. Use these as guidelines but don't over-fit.`;

      preferenceContext = `\n\nUSER PROFILE (${confidenceNote}):\n` +
        `Preferred leagues: ${topLeagues}.\n` +
        `Preferred teams: ${topTeams}.${matchCountGuidance}` +
        `${exclusionSection}${teamExclusionSection}${budgetHints}${timeSection}\n\n` +
        `Prioritize matches from preferred leagues/teams. If a match involves a league or team the user has shown strong preference for, lean toward including it.`;
    } else if (userPatterns && userPatterns.confidence === 'low' && userPatterns.leaguePrefs.length > 0) {
      // Low confidence — give soft hints only, don't exclude anything
      const topLeagues = userPatterns.leaguePrefs
        .slice(0, 8)
        .map(l => l.league)
        .join(', ');
      preferenceContext = `\n\nEARLY USER PROFILE (only ${userPatterns.totalPublishes} publishes — treat as soft hints):\n` +
        `This user seems to prefer: ${topLeagues}. Give these leagues slight priority but don't exclude anything yet.\n` +
        `Aim for ${targetMin}–${targetMax} match recommendations for this view.`;
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

    // ── Build set of leagues user has explicitly shown they don't want ──────
    // Used to suppress auto-promotions for leagues the user consistently skips.
    const userExcludedLeagues = new Set<string>();
    if (userPatterns && userPatterns.confidence !== 'low') {
      for (const excl of userPatterns.leagueExclusions) {
        userExcludedLeagues.add(excl.league);
      }
    }

    // ── Auto-promote sparse live-sport categories ────────────────────────────
    // MotoGP, UFC, Boxing, Cycling have so few events per window that every
    // one is worth showing. Inject any the AI missed as must_watch.
    // F1 is special: always include the Grand Prix race, but let the AI decide
    // on qualifying/sprint sessions (they're lower priority than the race itself).
    // RESPECTS user exclusions: if user consistently skips a sport, don't force it.
    const ALWAYS_INCLUDE_ABBREVS = new Set(['MGP', 'UFC', 'BOX', 'UCI']);
    if (output && Array.isArray(output.ids)) {
      const selectedIds = new Set(output.ids.map((r: { id: string }) => r.id));
      for (const [abbrev, matches] of Object.entries(groups)) {
        if (!ALWAYS_INCLUDE_ABBREVS.has(abbrev)) continue;
        if (userExcludedLeagues.has(abbrev)) continue; // Respect user's exclusion
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
    if (output && Array.isArray(output.ids) && !userExcludedLeagues.has('F1')) {
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
    // Uses learned team preferences when available, falls back to default marquee list.
    const NBA_DEFAULT_MARQUEE = ['Lakers', 'Celtics', 'Warriors', 'Rockets', 'Bulls',
      'Raptors', 'Knicks', 'Heat', 'Bucks', 'Nuggets', 'Mavericks'];
    // If user has team preferences, use those as marquee teams for NBA instead
    const nbaMarquee = userPatterns?.teamPrefs.length
      ? [...new Set([
          ...userPatterns.teamPrefs.slice(0, 10).map(t => t.team),
          ...NBA_DEFAULT_MARQUEE, // Still include defaults as fallback
        ])]
      : NBA_DEFAULT_MARQUEE;
    if (output && Array.isArray(output.ids) && !userExcludedLeagues.has('NBA')) {
      const selectedIds = new Set(output.ids.map((r: { id: string }) => r.id));
      for (const m of (Array.isArray(groups['NBA']) ? groups['NBA'] : [])) {
        const idx = String(m).split(':')[0];
        const title = String(m).slice(idx.length + 1);
        if (nbaMarquee.some((t) => title.includes(t)) && !selectedIds.has(idx)) {
          output.ids.push({ id: idx, importance: 'must_watch' as const });
          selectedIds.add(idx);
        }
      }
    }

    // ── Per-league caps: prevent any single league from flooding results ────
    // Now uses learned per-league budgets when available.
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

        // Determine per-league cap: learned budget → config default → 2
        let baseMax: number;
        if (userPatterns?.perLeagueBudget.has(league)) {
          // Use learned budget — the user consistently picks this many
          baseMax = Math.max(userPatterns.perLeagueBudget.get(league)!, LEAGUE_MAX_PICKS[league] ?? 2);
        } else {
          baseMax = LEAGUE_MAX_PICKS[league] ?? 2;
        }

        // For excluded leagues with high confidence: slash the cap hard
        // Still allow 1-2 for genuine must_watch events
        if (userExcludedLeagues.has(league) && r.importance !== 'must_watch') {
          const current = leagueCounts.get(league) ?? 0;
          if (current >= 1) return false; // Allow max 1 from excluded leagues (only if must_watch sneaked through)
          leagueCounts.set(league, current + 1);
          return true;
        }

        // Scan mode doubles per-league caps so good matches aren't artificially cut off
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
