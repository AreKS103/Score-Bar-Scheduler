import type { MatchEvent, ESPNScoreboardResponse, ESPNCompetitor } from '@/types';
import { SPORTS_CONFIG } from '@/lib/config';
import { utcToLocal, espnDateRange } from '@/lib/timezone';
import { WORLD_CUP_SPORT_ID } from '@/lib/worldCup';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ── Sport-type detection ──────────────────────────────────────────────────────

function isMMASlug(slug: string | null): boolean {
  return slug?.startsWith('mma/') ?? false;
}
function isGolfSlug(slug: string | null): boolean {
  return slug?.startsWith('golf/') ?? false;
}
function isMotorsportSlug(slug: string | null): boolean {
  return slug?.startsWith('racing/') ?? false;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCompetitorName(c: ESPNCompetitor | undefined): string {
  return c?.team?.displayName || c?.athlete?.displayName || c?.athlete?.fullName || '';
}
function getCompetitorLogo(c: ESPNCompetitor | undefined): string {
  return c?.team?.logo || '';
}

/**
 * Fetch a single page from ESPN scoreboard
 */
async function fetchScoreboard(
  espnSlug: string,
  startDate: string,
  endDate: string,
  page = 1
): Promise<ESPNScoreboardResponse> {
  const dateParam = espnDateRange(startDate, endDate);
  const url = `${ESPN_BASE}/${espnSlug}/scoreboard?dates=${dateParam}&limit=100&page=${page}`;

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`ESPN ${espnSlug} returned ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch all pages for leagues that may have paginated results.
 * Caps at 5 pages max and uses 200ms between requests to avoid rate-limiting.
 */
async function fetchAllPages(
  espnSlug: string,
  startDate: string,
  endDate: string
): Promise<ESPNScoreboardResponse['events']> {
  const first = await fetchScoreboard(espnSlug, startDate, endDate, 1);
  const all = [...(first.events ?? [])];
  const totalPages = Math.min((first as ESPNScoreboardResponse & { pageCount?: number }).pageCount ?? 1, 5);
  for (let p = 2; p <= totalPages; p++) {
    await sleep(200);
    const page = await fetchScoreboard(espnSlug, startDate, endDate, p);
    all.push(...(page.events ?? []));
  }
  return all;
}

// ── Team-sport mapper (soccer, basketball, football, baseball, hockey, cricket, rugby) ──

function mapTeamEvents(
  data: ESPNScoreboardResponse,
  sportConfig: { id: string; label: string; category: string; logo: string }
): MatchEvent[] {
  if (!data.events || !Array.isArray(data.events)) return [];

  return data.events.map((event) => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];

    // Try homeAway first (team sports), fall back to order (athlete sports like tennis)
    const home = competitors.find((c) => c.homeAway === 'home')
      ?? competitors.find((c) => c.order === 1)
      ?? competitors[0];
    const away = competitors.find((c) => c.homeAway === 'away')
      ?? competitors.find((c) => c.order === 2)
      ?? competitors[1];

    const { date, time } = utcToLocal(event.date);

    // Determine round info from event name if available
    let round = '';
    const name = event.name || '';
    if (name.includes(' - ')) {
      const parts = name.split(' - ');
      if (parts.length > 1) {
        round = parts[parts.length - 1].trim();
      }
    }

    return {
      id: `espn-${sportConfig.id}-${event.id}`,
      source: 'espn' as const,
      sportId: sportConfig.id,
      category: sportConfig.category,
      leagueLabel: sportConfig.label,
      leagueLogo: sportConfig.logo,
      date,
      time,
      home: getCompetitorName(home) || event.shortName?.split(' @ ')?.[1] || event.name || 'TBD',
      away: getCompetitorName(away) || '',
      homeLogo: getCompetitorLogo(home),
      awayLogo: getCompetitorLogo(away),
      round,
      tags: [],
      isFeatured: false,
      isSelected: false,
    };
  }).filter((event) => {
    const placeholderPattern = /\bwinner\b|\btbd\b|\bloser\b|\bqualifier\b/i;
    return !placeholderPattern.test(event.home) && !placeholderPattern.test(event.away);
  });
}

// ── Country name → ISO-3166-1 alpha-2 lookup (for fighter flag emojis) ────────
function countryNameToISO(name: string): string {
  const m: Record<string, string> = {
    'Afghanistan':'AF','Albania':'AL','Algeria':'DZ','American Samoa':'AS',
    'Argentina':'AR','Armenia':'AM','Australia':'AU','Austria':'AT',
    'Azerbaijan':'AZ','Bahrain':'BH','Belarus':'BY','Belgium':'BE',
    'Bolivia':'BO','Bosnia and Herzegovina':'BA','Brazil':'BR','Bulgaria':'BG',
    'Cameroon':'CM','Canada':'CA','Chile':'CL','China':'CN',
    'Colombia':'CO','Costa Rica':'CR','Croatia':'HR','Cuba':'CU',
    'Czech Republic':'CZ','Czechia':'CZ','Denmark':'DK','Dominican Republic':'DO',
    'Ecuador':'EC','Egypt':'EG','El Salvador':'SV','Estonia':'EE',
    'Ethiopia':'ET','Finland':'FI','France':'FR','Georgia':'GE',
    'Germany':'DE','Ghana':'GH','Great Britain':'GB','Greece':'GR',
    'Guatemala':'GT','Guyana':'GY','Honduras':'HN','Hungary':'HU',
    'Iceland':'IS','India':'IN','Indonesia':'ID','Iran':'IR',
    'Ireland':'IE','Israel':'IL','Italy':'IT','Jamaica':'JM',
    'Japan':'JP','Jordan':'JO','Kazakhstan':'KZ','Kenya':'KE',
    'Kosovo':'XK','Kyrgyzstan':'KG','Latvia':'LV','Lebanon':'LB',
    'Lithuania':'LT','Malaysia':'MY','Mexico':'MX','Moldova':'MD',
    'Montenegro':'ME','Morocco':'MA','Netherlands':'NL','New Zealand':'NZ',
    'Nicaragua':'NI','Nigeria':'NG','North Macedonia':'MK','Norway':'NO',
    'Pakistan':'PK','Panama':'PA','Paraguay':'PY','Peru':'PE',
    'Philippines':'PH','Poland':'PL','Portugal':'PT','Puerto Rico':'PR',
    'Romania':'RO','Russia':'RU','Saudi Arabia':'SA','Senegal':'SN',
    'Serbia':'RS','Singapore':'SG','Slovakia':'SK','Slovenia':'SI',
    'South Africa':'ZA','South Korea':'KR','Spain':'ES','Suriname':'SR',
    'Sweden':'SE','Switzerland':'CH','Tajikistan':'TJ','Thailand':'TH',
    'Trinidad and Tobago':'TT','Tunisia':'TN','Turkey':'TR','Turkiye':'TR',
    'Uganda':'UG','Ukraine':'UA','United Arab Emirates':'AE',
    'United Kingdom':'GB','United States':'US','Uruguay':'UY',
    'USA':'US','UK':'GB','England':'GB','Scotland':'GB','Wales':'GB','Northern Ireland':'GB',
    'Korea':'KR','DPR Korea':'KP','Chinese Taipei':'TW',
    'Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN',
    'Zambia':'ZM','Zimbabwe':'ZW',
  };
  return m[name] || '';
}

// ── MMA mapper (UFC, Bellator, PFL) ──────────────────────────────────────────
// ESPN MMA: one event = the card (e.g. "UFC 326"), many competitions = individual fights

function mapMMAEvents(
  data: ESPNScoreboardResponse,
  sportConfig: { id: string; label: string; category: string; logo: string }
): MatchEvent[] {
  if (!data.events) return [];
  const results: MatchEvent[] = [];

  for (const event of data.events) {
    // Use shortName ("UFC Fight Night") to avoid redundancy — the full event.name
    // often includes the main event fighters ("UFC Fight Night: Adesanya vs. Pyfer")
    // which would double-render when the fighters are already shown as home/away.
    const cardLabel = event.shortName ||
      (event.name?.includes(':')
        ? event.name.substring(0, event.name.indexOf(':')).trim()
        : (event.name || sportConfig.label));
    const { date, time } = utcToLocal(event.date);

    const competitions = event.competitions ?? [];
    if (competitions.length === 0) continue;

    for (let i = 0; i < competitions.length; i++) {
      const comp = competitions[i];
      const fighters = comp.competitors ?? [];
      const fighter1 = fighters[0];
      const fighter2 = fighters[1];

      const f1Name = getCompetitorName(fighter1);
      const f2Name = getCompetitorName(fighter2);
      if (!f1Name) continue;

      // Use individual competition date/time if available, else event date
      const fightTime = comp.date ? utcToLocal(comp.date) : { date, time };

      // Weight class from competition type abbreviation
      const weightClass = comp.type?.abbreviation ?? '';

      // Fighter flags: ESPN provides athlete.flag.href (image URL) and .alt (country name).
      // We prefer flagcdn.com over ESPN's own flag CDN — flagcdn is more reliable and
      // consistently returns a 40px webp flag for any ISO-3166-1 alpha-2 code.
      const f1Flag = fighter1?.athlete?.flag;
      const f2Flag = fighter2?.athlete?.flag;
      const f1Country = f1Flag?.alt ? countryNameToISO(f1Flag.alt) : '';
      const f2Country = f2Flag?.alt ? countryNameToISO(f2Flag.alt) : '';
      const f1Logo = getCompetitorLogo(fighter1)
        || (f1Country ? `https://flagcdn.com/w40/${f1Country.toLowerCase()}.webp` : '')
        || f1Flag?.href || '';
      const f2Logo = getCompetitorLogo(fighter2)
        || (f2Country ? `https://flagcdn.com/w40/${f2Country.toLowerCase()}.webp` : '')
        || f2Flag?.href || '';

      results.push({
        id: `espn-${sportConfig.id}-${event.id}-fight-${i}`,
        source: 'espn' as const,
        sportId: sportConfig.id,
        category: sportConfig.category,
        leagueLabel: cardLabel,
        leagueLogo: sportConfig.logo,
        date: fightTime.date,
        time: fightTime.time,
        home: f1Name,
        away: f2Name,
        homeLogo: f1Logo,
        awayLogo: f2Logo,
        homeCountry: f1Country,
        awayCountry: f2Country,
        round: weightClass,
        tags: [],
        isFeatured: false,
        isSelected: false,
      });
    }
  }

  return results;
}

// ── Golf mapper (tournament format, no head-to-head matchups) ────────────────

function mapGolfEvents(
  data: ESPNScoreboardResponse,
  sportConfig: { id: string; label: string; category: string; logo: string }
): MatchEvent[] {
  if (!data.events) return [];

  return data.events.map((event) => {
    const { date, time } = utcToLocal(event.date);

    // Clean tournament name (remove sponsor tags if too long)
    let tournamentName = event.name || event.shortName || 'TBD';
    // Keep it readable — strip "pres. by" sponsor text if present
    const presIdx = tournamentName.toLowerCase().indexOf(' pres.');
    if (presIdx > 0) tournamentName = tournamentName.substring(0, presIdx).trim();

    return {
      id: `espn-${sportConfig.id}-${event.id}`,
      source: 'espn' as const,
      sportId: sportConfig.id,
      category: sportConfig.category,
      leagueLabel: sportConfig.label,
      leagueLogo: sportConfig.logo,
      date,
      time,
      home: tournamentName,
      away: '', // No opponent — it's a tournament
      round: '',
      tags: [],
      isFeatured: false,
      isSelected: false,
    };
  });
}

// ── Motorsport mapper (F1/IndyCar via ESPN — one event = many sessions) ──────
// Each competition within the event is a separate session (FP1, FP2, Qual, Race)

function mapMotorsportEvents(
  data: ESPNScoreboardResponse,
  sportConfig: { id: string; label: string; category: string; logo: string }
): MatchEvent[] {
  if (!data.events) return [];
  const results: MatchEvent[] = [];

  for (const event of data.events) {
    // Shorten "Grand Prix" to "GP"
    const gpName = (event.shortName || event.name || 'TBD')
      .replace(/Grand Prix/gi, 'GP')
      .replace(/\s+/g, ' ')
      .trim();

    for (let i = 0; i < (event.competitions ?? []).length; i++) {
      const comp = event.competitions[i];
      const sessionType = comp.type?.abbreviation ?? '';
      // Map abbreviations to user-friendly names
      const sessionLabel =
        sessionType === 'FP1' ? 'Practice 1' :
        sessionType === 'FP2' ? 'Practice 2' :
        sessionType === 'FP3' ? 'Practice 3' :
        sessionType === 'Qual' ? 'Qualifying' :
        sessionType === 'Race' ? 'Main Race' :
        sessionType || `Session ${i + 1}`;

      const sessionTime = comp.date ? utcToLocal(comp.date) : utcToLocal(event.date);

      results.push({
        id: `espn-${sportConfig.id}-${event.id}-${sessionType || i}`,
        source: 'espn' as const,
        sportId: sportConfig.id,
        category: sportConfig.category,
        leagueLabel: sportConfig.label,
        leagueLogo: sportConfig.logo,
        date: sessionTime.date,
        time: sessionTime.time,
        home: `${gpName} – ${sessionLabel}`,
        away: '',
        round: '',
        tags: [],
        isFeatured: false,
        isSelected: false,
      });
    }
  }

  return results;
}

// ── Router: pick the right mapper based on sport slug ────────────────────────

function mapESPNEvents(
  data: ESPNScoreboardResponse,
  sportConfig: { id: string; label: string; category: string; logo: string; espnSlug: string | null }
): MatchEvent[] {
  const slug = sportConfig.espnSlug;

  if (isMMASlug(slug)) return mapMMAEvents(data, sportConfig);
  if (isGolfSlug(slug)) return mapGolfEvents(data, sportConfig);
  if (isMotorsportSlug(slug)) return mapMotorsportEvents(data, sportConfig);

  // Default: team sports (soccer, basketball, football, baseball, hockey,
  // cricket, rugby, tennis — tennis uses athlete competitors handled by getCompetitorName)
  return mapTeamEvents(data, sportConfig);
}

/**
 * Fetch all matches for a single ESPN-backed league
 */
export async function fetchESPNLeague(
  sportId: string,
  startDate: string,
  endDate: string
): Promise<MatchEvent[]> {
  if (sportId === WORLD_CUP_SPORT_ID) return [];
  const config = SPORTS_CONFIG.find((s) => s.id === sportId);
  if (!config || !config.espnSlug) return [];

  try {
    const events = await fetchAllPages(config.espnSlug, startDate, endDate);
    return mapESPNEvents({ events } as ESPNScoreboardResponse, config);
  } catch (err) {
    console.warn(`ESPN fetch failed for ${sportId}:`, err);
    return [];
  }
}

/**
 * Fetch all ESPN-backed leagues in parallel
 */
export async function fetchAllESPNLeagues(
  startDate: string,
  endDate: string
): Promise<{ sportId: string; events: MatchEvent[]; error?: string }[]> {
  const espnSports = SPORTS_CONFIG.filter(
    (sport) => sport.espnSlug !== null && sport.id !== WORLD_CUP_SPORT_ID,
  );

  const results = await Promise.allSettled(
    espnSports.map(async (sport) => {
      const events = await fetchESPNLeague(sport.id, startDate, endDate);
      return { sportId: sport.id, events };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      sportId: espnSports[i].id,
      events: [],
      error: result.reason?.message || 'Unknown error',
    };
  });
}
