import type { MatchEvent } from '@/types';
import {
  renderScheduleLayout,
  type ScheduleLayoutOpts,
} from '@/lib/scheduleLayout';
import { getSchedulePreviewCss, stripScheduleStyleTags } from '@/lib/scheduleEmbedStyles';
import { isWorldCupStageGroupEmbed } from '@/lib/worldCup';

/**
 * Main HTML generation function.
 * Converts selected MatchEvents to the WordPress-ready HTML format.
 */
export function generateScheduleContent(
  events: MatchEvent[],
  leagueOrder?: string[],
  featuredLeagues?: Map<string, string>,
  embedTarget?: string,
): string {
  const isWcEmbed = isWorldCupStageGroupEmbed(embedTarget);
  const layoutOpts: ScheduleLayoutOpts = {
    showTime: true,
    hideLogos: false,
    groupWorldCupByStage: isWcEmbed,
    showDateMonth: isWcEmbed,
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
  embedTarget?: string,
): string {
  const content = generateScheduleContent(events, leagueOrder, featuredLeagues, embedTarget);
  return `<style>${getSchedulePreviewCss()}</style>\n${content}`;
}

export { stripScheduleStyleTags };
