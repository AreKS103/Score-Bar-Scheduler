import { toZonedTime, format } from 'date-fns-tz';
import { addDays, parseISO, startOfDay } from 'date-fns';
import { getActiveTimezone } from './timezoneStore';

/** IANA identifier — must use underscore for date-fns-tz */
const DEFAULT_TZ = 'Asia/Phnom_Penh';

/** Get the currently active timezone (from store or fallback) */
function tz(): string {
  try {
    return getActiveTimezone();
  } catch {
    return DEFAULT_TZ;
  }
}

/**
 * Convert a UTC ISO string to date string (YYYY-MM-DD) in active timezone
 */
export function utcToICTDate(utcISO: string): string {
  const zone = tz();
  const zonedDate = toZonedTime(parseISO(utcISO), zone);
  return format(zonedDate, 'yyyy-MM-dd', { timeZone: zone });
}

/**
 * Convert a UTC ISO string to time string (HH:mm) in active timezone
 */
export function utcToICTTime(utcISO: string): string {
  const zone = tz();
  const zonedDate = toZonedTime(parseISO(utcISO), zone);
  return format(zonedDate, 'HH:mm', { timeZone: zone });
}

/**
 * Convert a UTC ISO string to both date and time in active timezone
 */
export function utcToICT(utcISO: string): { date: string; time: string } {
  return {
    date: utcToICTDate(utcISO),
    time: utcToICTTime(utcISO),
  };
}

/**
 * Format a date string (YYYY-MM-DD) to display format: "Friday 15 March"
 */
export function formatDisplayDate(dateStr: string): string {
  const d = parseISO(dateStr);
  return format(d, 'EEEE d MMMM');
}

/**
 * Get today's date in active timezone as YYYY-MM-DD
 */
export function todayICT(): string {
  const zone = tz();
  const now = toZonedTime(new Date(), zone);
  return format(now, 'yyyy-MM-dd', { timeZone: zone });
}

/**
 * Get a date N days from today in active timezone as YYYY-MM-DD
 */
export function daysFromTodayICT(days: number): string {
  const zone = tz();
  const now = toZonedTime(new Date(), zone);
  const future = addDays(startOfDay(now), days);
  return format(future, 'yyyy-MM-dd', { timeZone: zone });
}

/**
 * Format a date string to ESPN API format: YYYYMMDD
 */
export function toESPNDateFormat(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Build a date range string for ESPN API: YYYYMMDD-YYYYMMDD
 */
export function espnDateRange(startDate: string, endDate: string): string {
  return `${toESPNDateFormat(startDate)}-${toESPNDateFormat(endDate)}`;
}

/**
 * Convert a TheSportsDB date+time (already in UTC) to active timezone
 * dateEvent: "2025-03-06", strTime: "19:00:00"
 */
export function sportsDBToICT(dateEvent: string, strTime: string): { date: string; time: string } {
  const utcISO = `${dateEvent}T${strTime || '00:00:00'}Z`;
  return utcToICT(utcISO);
}
