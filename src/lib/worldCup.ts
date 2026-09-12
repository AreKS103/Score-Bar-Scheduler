import type { MatchEvent } from '@/types';

export const WORLD_CUP_SPORT_ID = 'soccer-fifa-world-cup-2026';

/** Canonical knockout / group stage order for World Cup embed section headers. */
export const WORLD_CUP_STAGE_ORDER = [
  'group-stage',
  'round-of-32',
  'round-of-16',
  'quarterfinals',
  'semifinals',
  '3rd-place-match',
  'final',
] as const;

export type WorldCupStageSlug = (typeof WORLD_CUP_STAGE_ORDER)[number];

const WORLD_CUP_STAGE_GROUP_EMBED_TARGETS = [
  'World Cup',
  'WC26',
  '2026 FIFA World Cup',
] as const;

function roundLabelToStageSlug(round: string): string {
  const normalized = round.trim().toLowerCase();
  if (!normalized || normalized.includes('group')) return 'group-stage';
  if (normalized.includes('round of 32') || normalized === 'r32') return 'round-of-32';
  if (normalized.includes('round of 16') || normalized === 'r16') return 'round-of-16';
  if (normalized.includes('quarter')) return 'quarterfinals';
  if (normalized.includes('semi')) return 'semifinals';
  if (normalized.includes('third')) return '3rd-place-match';
  if (normalized === 'final' || normalized.includes('final')) return 'final';
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group-stage';
}

function getWorldCupStageKey(event: MatchEvent): string {
  if (event.stageSlug) return event.stageSlug;
  if (event.round) return roundLabelToStageSlug(event.round);
  return 'group-stage';
}

export function sortWorldCupStageKeys(stages: Iterable<string>): string[] {
  const set = new Set(stages);
  const ordered = WORLD_CUP_STAGE_ORDER.filter((slug) => set.has(slug));
  const unknown = [...set]
    .filter((slug) => !WORLD_CUP_STAGE_ORDER.includes(slug as WorldCupStageSlug))
    .sort();
  return [...ordered, ...unknown];
}

export function groupWorldCupEventsByStage(events: MatchEvent[]): Map<string, MatchEvent[]> {
  const grouped = new Map<string, MatchEvent[]>();
  for (const event of events) {
    const key = getWorldCupStageKey(event);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(event);
  }
  return grouped;
}

export function isWorldCupStageGroupEmbed(embedTarget: string | null | undefined): boolean {
  const key = (embedTarget ?? '').trim().toLowerCase();
  if (!key) return false;
  if (key.replace(/\s+/g, '') === 'worldcup') return true;
  return WORLD_CUP_STAGE_GROUP_EMBED_TARGETS.some((target) => target.toLowerCase() === key);
}
