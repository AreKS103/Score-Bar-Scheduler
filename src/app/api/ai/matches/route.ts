import { NextRequest, NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import type { GroqLanguageModelOptions } from '@ai-sdk/groq';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getAIModel, getFallbackModel, type AIProviderResult } from '@/lib/ai/provider';
import { MatchFinderResponseSchema, MatchRatingSchema } from '@/lib/ai/schemas';
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

const SYSTEM_PROMPT = `You curate a sports-bar big-screen schedule. Default is EXCLUDE. Only include matches a crowd would cheer for.

DERBIES & RIVALRIES — always must_watch when they appear:
Football: Man City v Liverpool, Man Utd v Liverpool, Arsenal v Tottenham, Real Madrid v Barcelona, AC Milan v Inter, Boca v River, Bayern v Dortmund, Celtic v Rangers, Galatasaray v Fenerbahce, Roma v Lazio, Ajax v Feyenoord, PSG v Marseille, Benfica v Porto, Al Ahly v Zamalek, Juventus v Inter, Atletico v Real Madrid, Man Utd v Man City, Chelsea v Arsenal, Liverpool v Everton, Tottenham v West Ham
NBA: Lakers v Celtics, Lakers v Warriors, Celtics v 76ers, Knicks v Nets, Bulls v Pistons, Heat v Knicks, Warriors v Clippers, Mavs v Spurs
NFL: Cowboys v Eagles, Packers v Bears, 49ers v Seahawks, Steelers v Ravens, Chiefs v Raiders, Patriots v Jets, Giants v Eagles, Saints v Falcons
NHL: Rangers v Islanders, Bruins v Canadiens, Penguins v Capitals, Blackhawks v Red Wings, Oilers v Flames, Maple Leafs v Canadiens
MLB: Yankees v Red Sox, Dodgers v Giants, Cubs v Cardinals, Mets v Yankees, White Sox v Cubs

must_watch (order these FIRST):
- Any rivalry/derby listed above
- Finals, semi-finals, championship deciders
- Football: top-2 clashes in any league, UCL knockout rounds
- F1: every race session (Monaco, British, season opener, title-deciding rounds)
- UFC: title fights, main events with top-5 fighters
- NBA: playoffs, Finals, top-seed matchups
- MotoGP: title rounds, home GPs for top riders

high:
- Football: top-6 vs top-6, European group stage for big clubs
- F1: qualifying, sprint races
- UFC: co-main events, ranked contenders
- NBA: conference leaders, nationally televised
- MotoGP: mid-season rounds, close championship

If a match doesn't clearly fit — EXCLUDE it.
Return must_watch first, then high. Be generous with marquee matchups.`

// ── Call AI with provider-specific options ───────────────────────────────────

async function callAI(provider: AIProviderResult, matchData: string) {
  const providerOptions = provider.provider === 'groq'
    ? { groq: { structuredOutputs: false } satisfies GroqLanguageModelOptions }
    : undefined;

  const result = await generateText({
    model: provider.model,
    output: Output.object({ schema: MatchFinderResponseSchema }),
    prompt: matchData,
    system: SYSTEM_PROMPT,
    temperature: 0.1,
    ...(providerOptions ? { providerOptions } : {}),
  });

  return result.output;
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
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again tomorrow.' },
        { status: 429 }
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

      const leagueCounts = new Map<string, number>();
      output.ids = output.ids.filter((r: { id: string; importance: string }) => {
        const league = idToLeague.get(r.id) ?? '';
        const maxPicks = LEAGUE_MAX_PICKS[league] ?? 2;
        const current = leagueCounts.get(league) ?? 0;
        if (current >= maxPicks) return false;
        leagueCounts.set(league, current + 1);
        return true;
      });

      // ── Total budget cap: prevent overall result bloat ────────────────────
      const totalBudget = filterType === 'today' ? 20 : filterType === 'month' ? 60 : 40;
      output.ids = output.ids.slice(0, totalBudget);
    }

    return NextResponse.json(output);
  } catch (error) {
    console.error('[AI Matches] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get AI recommendations. Please try again.' },
      { status: 500 }
    );
  }
}
