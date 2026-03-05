import type { MatchEvent } from '@/types';
import { fetchAllESPNLeagues } from '@/lib/api/espn';
import { fetchF1Events } from '@/lib/api/openf1';
import { fetchAllSportsDBLeagues } from '@/lib/api/sportsdb';

export interface FetchResult {
  sportId: string;
  events: MatchEvent[];
  error?: string;
}

// ── Normalization helpers ────────────────────────────────────────────────────

/** Strip common suffixes/prefixes, lowercase, and collapse whitespace */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|ac|afc|bc|rc|us|as|ssc|rcd|cd|ud|sd)\b/g, '')
    .replace(/\bcity\b/g, '')
    .replace(/\bunited\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Generate a fuzzy match key from two team names + date */
function matchKey(home: string, away: string, date: string): string {
  const h = normalizeTeamName(home);
  const a = normalizeTeamName(away);
  // Sort alphabetically so "TeamA vs TeamB" and "TeamB vs TeamA" produce the same key
  const [first, second] = [h, a].sort();
  return `${first}|${second}|${date}`;
}

/** Check if two normalized names likely refer to the same team */
function fuzzyTeamMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Check if one contains the other (handles "Manchester" vs "Manchester Utd")
  if (a.length > 3 && b.length > 3) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  // Levenshtein-like: count shared words
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++;
  }
  const overlap = shared / Math.min(wordsA.size, wordsB.size);
  return overlap >= 0.5;
}

// ── Cross-reference & deduplication ──────────────────────────────────────────

interface MatchCluster {
  /** The canonical event we keep */
  primary: MatchEvent;
  /** Additional duplicates from other sources (for reference) */
  duplicates: MatchEvent[];
  /** Sources that confirmed this match */
  confirmedSources: Set<string>;
}

/**
 * Cross-reference events across ESPN, SportsDB and other sources.
 * When the same match appears in multiple APIs:
 *   - Prefer ESPN data (usually richer — has logos, round info)
 *   - Mark match as cross-verified (more confident it's correct)
 *   - Merge any missing data from the secondary source
 */
function crossReferenceEvents(events: MatchEvent[]): MatchEvent[] {
  const clusters = new Map<string, MatchCluster>();
  // Secondary index: date → events for that date (for fuzzy matching)
  const byDate = new Map<string, MatchCluster[]>();

  for (const event of events) {
    // Skip single-participant events (F1, UFC fight cards with no away)
    if (!event.away || event.away === '' || event.away === 'TBD') {
      const soloKey = `${event.id}`;
      if (!clusters.has(soloKey)) {
        clusters.set(soloKey, {
          primary: event,
          duplicates: [],
          confirmedSources: new Set([event.source]),
        });
      }
      continue;
    }

    const key = matchKey(event.home, event.away, event.date);
    const existing = clusters.get(key);

    if (!existing) {
      // Try fuzzy match against same-date events
      let matched = false;
      const dateClusters = byDate.get(event.date) ?? [];
      for (const cluster of dateClusters) {
        const p = cluster.primary;
        const hMatch = fuzzyTeamMatch(
          normalizeTeamName(event.home),
          normalizeTeamName(p.home)
        );
        const aMatch = fuzzyTeamMatch(
          normalizeTeamName(event.away),
          normalizeTeamName(p.away)
        );
        // Also check swapped home/away
        const hMatchSwap = fuzzyTeamMatch(
          normalizeTeamName(event.home),
          normalizeTeamName(p.away)
        );
        const aMatchSwap = fuzzyTeamMatch(
          normalizeTeamName(event.away),
          normalizeTeamName(p.home)
        );

        if ((hMatch && aMatch) || (hMatchSwap && aMatchSwap)) {
          // Found a fuzzy duplicate — merge
          cluster.confirmedSources.add(event.source);
          cluster.duplicates.push(event);
          // If new event is from ESPN and current primary is not, swap
          if (event.source === 'espn' && cluster.primary.source !== 'espn') {
            cluster.duplicates.push(cluster.primary);
            cluster.primary = mergeEventData(event, cluster.primary);
            cluster.duplicates = cluster.duplicates.filter(d => d.id !== event.id);
          } else {
            cluster.primary = mergeEventData(cluster.primary, event);
          }
          // Also store under the exact key for future lookups
          clusters.set(key, cluster);
          matched = true;
          break;
        }
      }

      if (!matched) {
        const cluster: MatchCluster = {
          primary: event,
          duplicates: [],
          confirmedSources: new Set([event.source]),
        };
        clusters.set(key, cluster);
        if (!byDate.has(event.date)) byDate.set(event.date, []);
        byDate.get(event.date)!.push(cluster);
      }
    } else {
      // Exact key match — definite duplicate
      existing.confirmedSources.add(event.source);
      existing.duplicates.push(event);
      // Prefer ESPN as primary
      if (event.source === 'espn' && existing.primary.source !== 'espn') {
        existing.duplicates.push(existing.primary);
        existing.primary = mergeEventData(event, existing.primary);
        existing.duplicates = existing.duplicates.filter(d => d.id !== event.id);
      } else {
        existing.primary = mergeEventData(existing.primary, event);
      }
    }
  }

  // Two keys can point to the same cluster (exact + fuzzy), deduplicate by id
  const seen = new Set<string>();
  const result: MatchEvent[] = [];
  for (const c of clusters.values()) {
    if (!seen.has(c.primary.id)) {
      seen.add(c.primary.id);
      result.push(c.primary);
    }
  }
  return result;
}

/**
 * Merge data from a secondary source into the primary event.
 * Fills in missing fields without overwriting good data.
 */
function mergeEventData(primary: MatchEvent, secondary: MatchEvent): MatchEvent {
  return {
    ...primary,
    // Use secondary's round if primary is missing
    round: primary.round || secondary.round,
    // Use secondary's league logo if primary is missing
    leagueLogo: primary.leagueLogo || secondary.leagueLogo,
    // Use secondary's time if primary shows midnight (likely missing time)
    time: primary.time === '00:00' && secondary.time !== '00:00'
      ? secondary.time
      : primary.time,
  };
}

// ── Main fetcher ─────────────────────────────────────────────────────────────

/**
 * Fetch all sports data from all API sources in parallel.
 * Cross-references across ESPN + SportsDB to deduplicate and verify.
 */
export async function fetchAllSports(
  startDate: string,
  endDate: string,
  onProgress?: (sportId: string, status: 'loading' | 'done' | 'error', error?: string) => void
): Promise<FetchResult[]> {
  // Launch all three API source fetches in parallel
  const [espnResults, f1Result, sportsDBResults] = await Promise.allSettled([
    fetchAllESPNLeagues(startDate, endDate),
    fetchF1Events(startDate, endDate),
    fetchAllSportsDBLeagues(startDate, endDate),
  ]);

  const allResults: FetchResult[] = [];

  // Process ESPN results
  if (espnResults.status === 'fulfilled') {
    allResults.push(...espnResults.value);
  } else {
    console.warn('ESPN batch fetch failed:', espnResults.reason);
  }

  // Process F1 results
  if (f1Result.status === 'fulfilled') {
    allResults.push({
      sportId: 'f1',
      events: f1Result.value,
    });
  } else {
    allResults.push({
      sportId: 'f1',
      events: [],
      error: f1Result.reason?.message || 'F1 fetch failed',
    });
  }

  // Process SportsDB results
  if (sportsDBResults.status === 'fulfilled') {
    allResults.push(...sportsDBResults.value);
  } else {
    console.warn('SportsDB batch fetch failed:', sportsDBResults.reason);
  }

  // Cross-reference & deduplicate across all sources
  const allEvents = allResults.flatMap((r) => r.events);
  const deduped = crossReferenceEvents(allEvents);

  // Build a set of surviving event IDs
  const survivingIds = new Set(deduped.map(e => e.id));

  // Group deduplicated events back into per-league results
  // Events may have been assigned to a different primary than their original sportId
  const dedupedBySport = new Map<string, MatchEvent[]>();
  for (const event of deduped) {
    const list = dedupedBySport.get(event.sportId) ?? [];
    list.push(event);
    dedupedBySport.set(event.sportId, list);
  }

  // Rebuild FetchResult array preserving sportIds that had data
  const seenSportIds = new Set<string>();
  const finalResults: FetchResult[] = [];

  for (const result of allResults) {
    if (seenSportIds.has(result.sportId)) continue;
    seenSportIds.add(result.sportId);
    finalResults.push({
      ...result,
      events: dedupedBySport.get(result.sportId) ?? [],
    });
  }

  // Add any sportIds that only appeared after merging
  for (const [sportId, events] of dedupedBySport) {
    if (!seenSportIds.has(sportId)) {
      seenSportIds.add(sportId);
      finalResults.push({ sportId, events });
    }
  }

  return finalResults;
}
