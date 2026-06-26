/**
 * renderEmbed.ts
 *
 * Renders the schedule HTML content fresh from raw events data + customization
 * opts at request time. Used exclusively by the embed route handler.
 */

import type { MatchEvent } from '@/types';
import { isWorldCupStageGroupEmbed } from '@/lib/worldCup';
import { renderScheduleLayout, type ScheduleLayoutOpts } from '@/lib/scheduleLayout';

export interface EmbedRenderOpts {
  showTime: boolean;
  showDate: boolean;
  showHeader: boolean;
  hideLogos: boolean;
  showSportTabs: boolean;
  catLabels?: Record<string, string>;
  embedTarget?: string;
}

export interface EmbedRenderResult {
  html: string;
  categories: string[];
}

export function renderEmbedContent(
  events: MatchEvent[],
  leagueOrder: string[],
  featuredLeagues: Map<string, string>,
  opts: EmbedRenderOpts,
): EmbedRenderResult {
  const layoutOpts: ScheduleLayoutOpts = {
    showTime: opts.showTime,
    hideLogos: opts.hideLogos,
    groupWorldCupByStage: isWorldCupStageGroupEmbed(opts.embedTarget),
  };

  return renderScheduleLayout(events, leagueOrder, featuredLeagues, layoutOpts);
}
