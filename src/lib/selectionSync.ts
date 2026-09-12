export interface SelectionEntry {
  isSelected: boolean;
  isFeatured: boolean;
  tags: string[];
  snapshot?: unknown;
}

export interface SelectionSyncState {
  selections: Record<string, SelectionEntry>;
  leagueOrder: string[];
  featuredLeagues: Record<string, string>;
  savedAt: number;
}

export interface SelectionSyncDiff {
  selectionsSet: Record<string, SelectionEntry>;
  selectionsRemove: string[];
  featuredLeaguesSet: Record<string, string>;
  featuredLeaguesRemove: string[];
  leagueOrder: string[] | null;
}

export function emptySelectionSyncState(savedAt = Date.now()): SelectionSyncState {
  return {
    selections: {},
    leagueOrder: [],
    featuredLeagues: {},
    savedAt,
  };
}

export function countActiveSelections(selections: Record<string, SelectionEntry>): number {
  return Object.values(selections).filter(
    (selection) => selection.isSelected || selection.isFeatured || selection.tags.length > 0,
  ).length;
}

export function isSelectionSyncStateEmpty(state: SelectionSyncState): boolean {
  return (
    Object.keys(state.selections).length === 0 &&
    state.leagueOrder.length === 0 &&
    Object.keys(state.featuredLeagues).length === 0
  );
}

export function applySelectionSyncDiff(
  current: SelectionSyncState,
  diff: SelectionSyncDiff,
  savedAt = Date.now(),
): SelectionSyncState {
  const selections = { ...current.selections };
  for (const id of diff.selectionsRemove) delete selections[id];
  for (const [id, value] of Object.entries(diff.selectionsSet)) {
    selections[id] = {
      ...value,
      tags: Array.isArray(value.tags) ? [...value.tags] : [],
    };
  }

  const featuredLeagues = { ...current.featuredLeagues };
  for (const id of diff.featuredLeaguesRemove) delete featuredLeagues[id];
  for (const [id, value] of Object.entries(diff.featuredLeaguesSet)) {
    featuredLeagues[id] = value;
  }

  return {
    selections,
    leagueOrder: diff.leagueOrder ? [...diff.leagueOrder] : [...current.leagueOrder],
    featuredLeagues,
    savedAt,
  };
}

export function normalizeSelectionSyncState(input: Partial<SelectionSyncState> | null | undefined): SelectionSyncState {
  return {
    selections: input?.selections && typeof input.selections === 'object' ? input.selections : {},
    leagueOrder: Array.isArray(input?.leagueOrder) ? input.leagueOrder : [],
    featuredLeagues: input?.featuredLeagues && typeof input.featuredLeagues === 'object' ? input.featuredLeagues : {},
    savedAt: typeof input?.savedAt === 'number' ? input.savedAt : Date.now(),
  };
}