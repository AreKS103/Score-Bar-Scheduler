import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getAIModel, getFallbackModel, type AIProviderResult } from '@/lib/ai/provider';
import { MatchFinderResponseSchema, MatchRatingSchema, type MatchFinderResponse } from '@/lib/ai/schemas';
import { LEAGUE_MAX_PICKS } from '@/lib/config';

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

const SYSTEM_PROMPT = `You curate a sports-bar big-screen schedule. Default is EXCLUDE. Only include matches a crowd would cheer for. Be SELECTIVE — quality over quantity.

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

must_watch (order these FIRST):
- Any rivalry/derby listed above
- Finals, semi-finals, championship deciders
- Football: top-2 clashes in any league, UCL knockout rounds
- F1: EVERY race, qualifying session, and sprint race — always must_watch regardless of circuit
- UFC: title fights, main events with top-5 fighters
- MotoGP: EVERY race and qualifying session — always must_watch
- Boxing: EVERY listed fight — always must_watch
- NBA: any game featuring Lakers, Celtics, Warriors, Knicks, Heat, Bucks, Nuggets, Mavericks; also playoffs, Finals
- Cycling: EVERY UCI World Tour race — always must_watch

high:
- Football (Tier 1 — include most matches): EPL, La Liga, Bundesliga, Serie A, Ligue 1, UCL, UEL, Copa Libertadores, FA Cup
- Football (Tier 2 — be selective, only top-half clashes or recognisable teams): EFL Championship, MLS, Eredivisie, Scottish Prem, UECL, Carabao Cup
- Football (Tier 3 — very selective, only include if a neutral crowd would recognise the teams): League One, A-League, J-League, Saudi Pro League, AFC competitions
- NBA: ONLY games with marquee teams (Lakers, Celtics, Warriors, Bulls, Knicks, Heat, Bucks, Nuggets, Mavericks, 76ers) or clear playoff implications. Skip games between two small-market non-playoff teams.
- NHL: ONLY original-six or division leaders, playoff-seeded teams, traditional rivalries. Skip mid-table games between non-contending teams.
- MLB: ONLY division leaders, pennant-race games, or classic rivalries. Skip routine regular-season games between teams with losing records.
- NFL: any regular-season or playoff game — NFL has few games per week, include all
- MotoGP: any session not already must_watch
- Rugby (Six Nations, NRL, Super Rugby, Premiership, Top 14, Champions Cup): any game
- Cricket (IPL, Test matches): any game
- Tennis (ATP, WTA, Grand Slams): any match with seeded players or notable rounds
- Golf (PGA, LPGA): any tournament round
- IndyCar: every race and qualifying session
- Combat Sports (UFC, Boxing, PFL): any fight event; include undercard if fighters are ranked

Default: EXCLUDE unless a sports-bar crowd would genuinely care. No-name teams with no stakes = skip.
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
    throw new Error('AI returned malformed JSON. Raw: ' + text.slice(0, 200));
  }

  const parsed = MatchFinderResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('AI JSON did not match schema: ' + parsed.error.message.slice(0, 200));
  }

  return parsed.data;
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

    if (!groups || typeof groups !== 'object' || Object.keys(groups).length === 0) {
      return NextResponse.json(
        { error: 'groups object is required.' },
        { status: 400 }
      );
    }

    // Build token-efficient plain-text prompt grouped by league
    const lines: string[] = [];
    let matchCount = 0;

    for (const [league, matches] of Object.entries(groups)) {
      if (!Array.isArray(matches)) continue;
      lines.push(`[${String(league)}]`);
      for (const m of matches) {
        if (matchCount >= 500) break;
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

    // ── Try primary → fallback ──────────────────────────────────────────────
    const primary = getAIModel();
    let output;

    try {
      output = await callAI(primary, condensed);
    } catch (primaryError) {
      console.error(`[AI Matches] Primary (${primary.provider}) failed:`, primaryError);

      const fallback = getFallbackModel();
      if (!fallback || fallback.modelId === primary.modelId) throw primaryError;

      output = await callAI(fallback, condensed);
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
    // F1, MotoGP, UFC, Boxing, Cycling have so few events per window that every
    // one is worth showing. Inject any the AI missed as must_watch.
    const ALWAYS_INCLUDE_ABBREVS = new Set(['F1', 'MGP', 'UFC', 'BOX', 'UCI']);
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
        const maxPicks = LEAGUE_MAX_PICKS[league] ?? 2;
        const current = leagueCounts.get(league) ?? 0;
        if (current >= maxPicks) return false;
        leagueCounts.set(league, current + 1);
        return true;
      });

      // ── Total budget cap ───────────────────────────────────────────────────
      const totalBudget = filterType === 'today' ? 80 : filterType === 'month' ? 250 : 150;
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
