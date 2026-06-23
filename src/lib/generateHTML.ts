import type { MatchEvent } from '@/types';
import {
  renderScheduleLayout,
  type ScheduleLayoutOpts,
} from '@/lib/scheduleLayout';
import { getSchedulePreviewCss, stripScheduleStyleTags } from '@/lib/scheduleEmbedStyles';

/**
 * Main HTML generation function.
 * Converts selected MatchEvents to the WordPress-ready HTML format.
 */
export function generateScheduleContent(
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

  return html;
}

export function generateHTML(
  events: MatchEvent[],
  leagueOrder?: string[],
  featuredLeagues?: Map<string, string>,
): string {
  const content = generateScheduleContent(events, leagueOrder, featuredLeagues);
  return `<style>${getSchedulePreviewCss()}</style>\n${content}`;
}

export { stripScheduleStyleTags };
