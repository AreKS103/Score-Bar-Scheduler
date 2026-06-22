import type { MatchEvent } from '@/types';
import {
  renderScheduleLayout,
  SCHEDULE_LAYOUT_CSS,
  type ScheduleLayoutOpts,
} from '@/lib/scheduleLayout';

/**
 * Main HTML generation function.
 * Converts selected MatchEvents to the WordPress-ready HTML format.
 */
export function generateHTML(
  events: MatchEvent[],
  leagueOrder?: string[],
  featuredLeagues?: Map<string, string>,
): string {
  const layoutOpts: ScheduleLayoutOpts = {
    showTime: true,
    hideLogos: false,
  };

  const { html } = renderScheduleLayout(
    events.filter((e) => e.isSelected),
    leagueOrder,
    featuredLeagues ?? new Map(),
    layoutOpts,
  );

  return `<style>${SCHEDULE_LAYOUT_CSS}</style>\n${html}`;
}
