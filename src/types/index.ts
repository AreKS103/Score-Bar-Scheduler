// ─── Core Data Model ─────────────────────────────────────────────────────────

export type ScreenTag = string; // free-text custom note per match

export interface MatchEvent {
  id: string;
  source: 'espn' | 'openf1' | 'sportsdb' | 'manual';
  sportId: string;         // e.g. 'soccer-epl'
  category: string;        // e.g. 'Football', 'Motorsport'
  leagueLabel: string;     // e.g. 'EPL', 'Formula 1'
  leagueLogo: string;      // URL to logo image
  customLogoPath?: string; // Supabase Storage object path for custom league logos
  date: string;            // YYYY-MM-DD in active timezone
  time: string;            // HH:mm in active timezone (24hr)
  home: string;            // Home team or event name
  away: string;            // Away team (empty for F1/UFC)
  homeLogo?: string;       // URL to home team logo (ESPN)
  awayLogo?: string;       // URL to away team logo (ESPN)
  round: string;           // e.g. 'Quarter Final (Leg 1)' or weight class for MMA
  tags: ScreenTag[];       // Screen/viewing tags
  isFeatured: boolean;     // Star toggle — appears in highlights
  isSelected: boolean;     // Whether included in the published schedule
  // ── MMA / Boxing fight card fields ──
  isMainCard?: boolean;    // true = main event, false = undercard
  cardName?: string;       // e.g. "UFC 326" — groups fights under one card
  fightOrder?: number;     // 0 = main event, 1+ = undercard order
  homeCountry?: string;    // 2-letter ISO country code for home fighter (e.g. "GB", "US")
  awayCountry?: string;    // 2-letter ISO country code for away fighter
}

// ─── Sports Configuration ────────────────────────────────────────────────────

export interface SportConfig {
  id: string;
  label: string;
  category: string;
  espnSlug: string | null;
  sportsdbId?: string;
  openf1?: boolean;
  logo: string;
  publishLogo?: string;
}

// ─── WordPress ───────────────────────────────────────────────────────────────

export interface WPConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
}

// ─── Organization Types ──────────────────────────────────────────────────────

export type OrgRole = 'owner';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface ESPNCompetitor {
  homeAway?: 'home' | 'away';
  order?: number;
  team?: {
    displayName: string;
    shortDisplayName: string;
    logo?: string;
  };
  athlete?: {
    fullName?: string;
    displayName: string;
    shortName?: string;
    flag?: { href: string; alt: string };
  };
  score?: string;
  winner?: boolean;
}

export interface ESPNCompetition {
  id?: string;
  competitors: ESPNCompetitor[];
  type?: {
    abbreviation?: string;
  };
  venue?: {
    fullName: string;
    address?: {
      city: string;
      country: string;
    };
  };
  date?: string;
  status?: {
    type: {
      name: string;
      description: string;
    };
  };
}

export interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  competitions: ESPNCompetition[];
  season?: { slug: string };
  status: {
    type: {
      description: string;
      name: string;
    };
  };
}

export interface ESPNScoreboardResponse {
  events: ESPNEvent[];
  leagues?: Array<{
    name: string;
    slug: string;
    logos?: Array<{ href: string }>;
  }>;
}

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  country_name: string;
  date_start: string;
  year: number;
}

export interface OpenF1Session {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  meeting_key: number;
}

export interface SportsDBEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string;     // YYYY-MM-DD
  strTime: string;       // HH:mm:ss
  strHomeTeam: string;
  strAwayTeam: string;
  strRound: string;
  strLeague: string;
  strSeason: string;
  strThumb?: string;
}

// ─── Store Types ─────────────────────────────────────────────────────────────

export interface FetchStatus {
  loading: boolean;
  error: string | null;
}

export interface ScheduleStore {
  events: MatchEvent[];
  fetchStatuses: Record<string, FetchStatus>;
  dateRange: { start: string; end: string };
  activeSportFilter: string;

  setEvents: (events: MatchEvent[]) => void;
  addEvents: (events: MatchEvent[]) => void;
  removeEvent: (id: string) => void;
  updateEvent: (id: string, updates: Partial<MatchEvent>) => void;
  toggleSelected: (id: string) => void;
  toggleFeatured: (id: string) => void;
  setNote: (id: string, note: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  batchSetSelected: (ids: string[], selected: boolean) => void;
  batchClearAll: (ids: string[]) => void;
  setFetchStatus: (key: string, status: FetchStatus) => void;
  setFetchStatuses: (statuses: Record<string, FetchStatus>) => void;
  setDateRange: (start: string, end: string) => void;
  setActiveSportFilter: (filter: string) => void;
  getSelectedEvents: () => MatchEvent[];
  getFeaturedEvents: () => MatchEvent[];
}
