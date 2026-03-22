import type { MatchEvent, OpenF1Meeting, OpenF1Session } from '@/types';
import { utcToLocal } from '@/lib/timezone';

const OPENF1_BASE = 'https://api.openf1.org/v1';

// Show all session types: Practice, Qualifying, Sprint, Race
const SESSION_TYPES_TO_SHOW = ['Race', 'Qualifying', 'Sprint', 'Practice'];

/** Shorten "Grand Prix" to "GP" for cleaner display */
function shortenGPName(name: string): string {
  return name.replace(/Grand Prix/gi, 'GP').replace(/\s+/g, ' ').trim();
}

/** Map session names to user-friendly labels */
function formatSessionName(name: string): string {
  if (name === 'Race') return 'Main Race';
  return name; // "Practice 1", "Practice 2", "Practice 3", "Qualifying", "Sprint", etc.
}

/**
 * Fetch all F1 meetings (race weekends) for a given year
 */
async function fetchMeetings(year: number): Promise<OpenF1Meeting[]> {
  try {
    const res = await fetch(`${OPENF1_BASE}/meetings?year=${year}`);
    if (!res.ok) throw new Error(`OpenF1 meetings returned ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn('OpenF1 meetings fetch failed:', err);
    return [];
  }
}

/**
 * Fetch sessions for a given meeting
 */
async function fetchSessions(meetingKey: number): Promise<OpenF1Session[]> {
  try {
    const res = await fetch(`${OPENF1_BASE}/sessions?meeting_key=${meetingKey}`);
    if (!res.ok) throw new Error(`OpenF1 sessions returned ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn(`OpenF1 sessions fetch failed for meeting ${meetingKey}:`, err);
    return [];
  }
}

/**
 * Filter sessions to only Race, Qualifying, Sprint
 */
function filterRelevantSessions(sessions: OpenF1Session[]): OpenF1Session[] {
  return sessions.filter((s) =>
    SESSION_TYPES_TO_SHOW.some(
      (type) =>
        s.session_type?.toLowerCase().includes(type.toLowerCase()) ||
        s.session_name?.toLowerCase().includes(type.toLowerCase())
    )
  );
}

/**
 * Convert F1 sessions to MatchEvent format
 */
function mapF1Sessions(
  sessions: OpenF1Session[],
  meeting: OpenF1Meeting
): MatchEvent[] {
  const gpName = shortenGPName(meeting.meeting_name);

  return sessions.map((session) => {
    const { date, time } = utcToLocal(session.date_start);
    const sessionLabel = formatSessionName(session.session_name);

    return {
      id: `openf1-${session.session_key}`,
      source: 'openf1' as const,
      sportId: 'f1',
      category: 'Motorsport',
      leagueLabel: 'Formula 1',
      leagueLogo: 'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png',
      date,
      time,
      home: `${gpName} – ${sessionLabel}`,
      away: '',
      round: '',
      tags: [],
      isFeatured: false,
      isSelected: false,
    };
  });
}

/**
 * Fetch all upcoming F1 sessions within a date range
 */
export async function fetchF1Events(
  startDate: string,
  endDate: string
): Promise<MatchEvent[]> {
  try {
    const year = new Date().getFullYear();
    const meetings = await fetchMeetings(year);

    if (!meetings.length) return [];

    // Fetch sessions for all meetings in parallel
    const allSessionResults = await Promise.allSettled(
      meetings.map(async (meeting) => {
        const sessions = await fetchSessions(meeting.meeting_key);
        const relevant = filterRelevantSessions(sessions);
        return mapF1Sessions(relevant, meeting);
      })
    );

    const allEvents = allSessionResults
      .filter(
        (r): r is PromiseFulfilledResult<MatchEvent[]> =>
          r.status === 'fulfilled'
      )
      .flatMap((r) => r.value);

    // Filter to date range
    return allEvents.filter((e) => e.date >= startDate && e.date <= endDate);
  } catch (err) {
    console.warn('OpenF1 fetch failed:', err);
    return [];
  }
}
