/**
 * Giro d'Italia (Men + Women) deterministic fetcher.
 *
 * TheSportsDB UCI World Tour league (id 4465) does not ingest the Giro stages,
 * so the entire race vanishes from the schedule during the actual race window.
 * This module provides a free, zero-dependency fallback by shipping the
 * official 2026 stage schedules as static data, sourced from the official
 * RCS route announcements and cross-checked against ProCyclingStats and
 * Wikipedia. Future seasons can be added by appending to GIRO_SCHEDULES.
 *
 * Source URLs (for the 2026 data below):
 *   Men:   https://www.procyclingstats.com/race/giro-d-italia/2026
 *          https://en.wikipedia.org/wiki/2026_Giro_d%27Italia
 *   Women: https://www.procyclingstats.com/race/giro-d-italia-women/2026
 *          https://en.wikipedia.org/wiki/2026_Giro_d%27Italia_Women
 */

import { MatchEvent } from '@/types';

interface GiroStage {
  /** Calendar date in YYYY-MM-DD (CEST/CET, i.e. Italian local). */
  date: string;
  stage: number;
  /** "Start - Finish" route string. */
  route: string;
  /** Distance in km, used for the round/label. */
  km: number;
  /** Stage type label ("Flat", "Mountain", "ITT", etc.). */
  type: string;
}

interface GiroSchedule {
  sportId: 'cycling-giro' | 'cycling-giro-women';
  leagueLabel: string;
  shortName: string;
  /** Default local start time (HH:mm, Italy time) — typical Giro stage start. */
  defaultTime: string;
  stages: GiroStage[];
}

// Logo path is overridden by LOCAL_LEAGUE_LOGOS in src/lib/config.ts; the
// value below only matters as a fallback if the override map is bypassed.
const GIRO_LOGO = '/league-logos/cycling-giro.svg';

const GIRO_MEN_2026: GiroSchedule = {
  sportId: 'cycling-giro',
  leagueLabel: "Giro d'Italia",
  shortName: "Giro d'Italia",
  defaultTime: '12:30',
  stages: [
    { date: '2026-05-08', stage: 1,  route: 'Nessebar – Burgas',                  km: 147, type: 'Flat' },
    { date: '2026-05-09', stage: 2,  route: 'Burgas – Veliko Tarnovo',            km: 221, type: 'Hilly' },
    { date: '2026-05-10', stage: 3,  route: 'Plovdiv – Sofia',                    km: 175, type: 'Flat' },
    { date: '2026-05-12', stage: 4,  route: 'Catanzaro – Cosenza',                km: 138, type: 'Flat' },
    { date: '2026-05-13', stage: 5,  route: 'Praia a Mare – Potenza',             km: 203, type: 'Hilly' },
    { date: '2026-05-14', stage: 6,  route: 'Paestum – Naples',                   km: 142, type: 'Flat' },
    { date: '2026-05-15', stage: 7,  route: 'Formia – Blockhaus',                 km: 244, type: 'Mountain' },
    { date: '2026-05-16', stage: 8,  route: 'Chieti – Fermo',                     km: 156, type: 'Hilly' },
    { date: '2026-05-17', stage: 9,  route: 'Cervia – Corno alle Scale',          km: 184, type: 'Hilly' },
    { date: '2026-05-19', stage: 10, route: 'Viareggio – Massa',                  km: 42,  type: 'ITT' },
    { date: '2026-05-20', stage: 11, route: 'Porcari – Chiavari',                 km: 195, type: 'Hilly' },
    { date: '2026-05-21', stage: 12, route: 'Imperia – Novi Ligure',              km: 175, type: 'Flat' },
    { date: '2026-05-22', stage: 13, route: 'Alessandria – Verbania',             km: 189, type: 'Hilly' },
    { date: '2026-05-23', stage: 14, route: 'Aosta – Pila',                       km: 133, type: 'Mountain' },
    { date: '2026-05-24', stage: 15, route: 'Voghera – Milan',                    km: 157, type: 'Flat' },
    { date: '2026-05-26', stage: 16, route: 'Bellinzona – Carì',                  km: 113, type: 'Mountain' },
    { date: '2026-05-27', stage: 17, route: "Cassano d'Adda – Andalo",            km: 202, type: 'Hilly' },
    { date: '2026-05-28', stage: 18, route: 'Fai della Paganella – Pieve di Soligo', km: 171, type: 'Flat' },
    { date: '2026-05-29', stage: 19, route: 'Feltre – Alleghe',                   km: 151, type: 'Mountain' },
    { date: '2026-05-30', stage: 20, route: 'Gemona del Friuli – Piancavallo',    km: 200, type: 'Mountain' },
    { date: '2026-05-31', stage: 21, route: 'Rome – Rome',                        km: 131, type: 'Flat' },
  ],
};

const GIRO_WOMEN_2026: GiroSchedule = {
  sportId: 'cycling-giro-women',
  leagueLabel: "Giro d'Italia Women",
  shortName: "Giro d'Italia Women",
  defaultTime: '13:00',
  stages: [
    { date: '2026-05-30', stage: 1, route: 'Cesenatico – Ravenna',                  km: 139,   type: 'Flat' },
    { date: '2026-05-31', stage: 2, route: 'Roncade – Caorle',                      km: 146,   type: 'Flat' },
    { date: '2026-06-01', stage: 3, route: 'Bibione – Buja',                        km: 154,   type: 'Hilly' },
    { date: '2026-06-02', stage: 4, route: 'Belluno – Nevegal',                     km: 12.7,  type: 'ITT' },
    { date: '2026-06-03', stage: 5, route: 'Longarone – Santo Stefano di Cadore',   km: 138,   type: 'Mountain' },
    { date: '2026-06-04', stage: 6, route: 'Ala – Brescello',                       km: 155,   type: 'Flat' },
    { date: '2026-06-05', stage: 7, route: 'Sorbolo Mezzani – Salice Terme',        km: 165,   type: 'Hilly' },
    { date: '2026-06-06', stage: 8, route: 'Rivoli – Sestriere',                    km: 101,   type: 'Mountain' },
    { date: '2026-06-07', stage: 9, route: 'Saluzzo – Saluzzo',                     km: 143,   type: 'Mountain' },
  ],
};

const GIRO_SCHEDULES: GiroSchedule[] = [GIRO_MEN_2026, GIRO_WOMEN_2026];

function stageToMatchEvent(schedule: GiroSchedule, stage: GiroStage): MatchEvent {
  const stageLabel = stage.type === 'ITT' ? `Stage ${stage.stage} (ITT)` : `Stage ${stage.stage}`;
  return {
    id: `giro-${schedule.sportId}-${stage.date}-s${stage.stage}`,
    source: 'sportsdb', // existing union; treat as a deterministic data source
    sportId: schedule.sportId,
    category: 'Cycling',
    leagueLabel: schedule.leagueLabel,
    leagueLogo: GIRO_LOGO,
    date: stage.date,
    time: schedule.defaultTime,
    home: `${schedule.shortName} \u2013 ${stageLabel}`,
    away: stage.route,
    round: `${stage.km} km`,
    tags: [],
    isFeatured: false,
    isSelected: false,
    sourceEventId: `giro-${schedule.sportId}-2026-s${stage.stage}`,
    country: 'Italy',
  };
}

/**
 * Fetch Giro Men + Giro Women stage events whose dates fall within [startDate, endDate].
 * Dates are inclusive, format YYYY-MM-DD, interpreted in Italian local time.
 * `timeZone` is accepted for parity with other fetchers but not currently used —
 * Giro stages are listed by Italian calendar date and the small time-of-day
 * window means the date never shifts in any user's timezone.
 */
export async function fetchAllGiroEvents(
  startDate: string,
  endDate: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _timeZone: string
): Promise<MatchEvent[]> {
  const out: MatchEvent[] = [];
  for (const schedule of GIRO_SCHEDULES) {
    for (const stage of schedule.stages) {
      if (stage.date >= startDate && stage.date <= endDate) {
        out.push(stageToMatchEvent(schedule, stage));
      }
    }
  }
  if (out.length > 0) {
    console.log(`[Giro] Returning ${out.length} stage events for ${startDate}..${endDate}`);
  }
  return out;
}
