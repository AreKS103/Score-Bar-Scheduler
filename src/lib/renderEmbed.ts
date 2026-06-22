/**
 * renderEmbed.ts
 *
 * Renders the schedule HTML content fresh from raw events data + customization
 * opts at request time. Used exclusively by the embed route handler.
 */

import type { MatchEvent } from '@/types';
import { renderScheduleLayout, type ScheduleLayoutOpts } from '@/lib/scheduleLayout';

export interface EmbedRenderOpts {
  showTime: boolean;
  showDate: boolean;
  showHeader: boolean;
  hideLogos: boolean;
  showSportTabs: boolean;
  catLabels?: Record<string, string>;
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
  };

  return renderScheduleLayout(events, leagueOrder, featuredLeagues, layoutOpts);
}
