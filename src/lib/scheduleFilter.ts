/**
 * Embed sport filter — category-based pills derived from the published schedule.
 * Each embed only shows categories that have at least one match; hidden when ≤1 category.
 */

import type { MatchEvent } from '@/types';
import { CATEGORY_ORDER } from '@/lib/config';

export interface ScheduleFilterPill {
  key: string;
  label: string;
}

/** Stable DOM key for a category (used in data-filter-* attributes). */
export function categoryToFilterKey(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Filter key for a single match, or null when the event has no filterable category. */
export function getEventFilterKey(event: MatchEvent): string | null {
  const category = event.category?.trim();
  if (!category || category === 'Custom') return null;
  return categoryToFilterKey(category);
}

/** Distinct categories present in the schedule, in app display order. */
export function getActiveScheduleCategories(events: MatchEvent[]): string[] {
  const categories = new Set<string>();
  for (const event of events) {
    const category = event.category?.trim();
    if (category && category !== 'Custom') categories.add(category);
  }
  return CATEGORY_ORDER.filter((category) => categories.has(category));
}

/** Build filter pills for an embed. Returns empty when filtering would be pointless (≤1 category). */
export function getScheduleFilterPills(
  events: MatchEvent[],
  catLabels: Record<string, string> = {},
): ScheduleFilterPill[] {
  const categories = getActiveScheduleCategories(events);
  if (categories.length <= 1) return [];

  const pills: ScheduleFilterPill[] = [{ key: 'all', label: 'All' }];
  for (const category of categories) {
    const key = categoryToFilterKey(category);
    pills.push({
      key,
      label: catLabels[category] || catLabels[key] || category,
    });
  }
  return pills;
}
