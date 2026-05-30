import { create } from 'zustand';
import type { MatchEvent, ScheduleStore, FetchStatus } from '@/types';
import { today, daysFromToday } from '@/lib/timezone';

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  events: [],
  fetchStatuses: {},
  customTags: [],
  setCustomTags: (tags: string[]) => set({ customTags: tags }),
  addCustomTag: (tag: string) =>
    set((state) => ({
      customTags: state.customTags.includes(tag) ? state.customTags : [...state.customTags, tag],
    })),
  removeCustomTag: (tag: string) =>
    set((state) => ({
      customTags: state.customTags.filter((t) => t !== tag),
    })),

  stripTagFromAllEvents: (tag: string) =>
    set((state) => ({
      events: state.events.map((e) =>
        e.tags.includes(tag) ? { ...e, tags: e.tags.filter((t) => t !== tag) } : e
      ),
    })),
  dateRange: {
    start: today(),
    end: daysFromToday(7),
  },
  activeSportFilter: 'All',

  setEvents: (events: MatchEvent[]) => set({ events }),

  addEvents: (newEvents: MatchEvent[]) =>
    set((state) => {
      const existingIds = new Set(state.events.map((e) => e.id));
      const unique = newEvents.filter((e) => !existingIds.has(e.id));
      if (unique.length === 0) return state;
      return { events: [...state.events, ...unique] };
    }),

  removeEvent: (id: string) =>
    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    })),

  updateEvent: (id: string, updates: Partial<MatchEvent>) =>
    set((state) => ({
      events: state.events.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    })),

  toggleSelected: (id: string) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return state;
      const updated = [...state.events];
      const wasSelected = updated[idx].isSelected;
      updated[idx] = {
        ...updated[idx],
        isSelected: !wasSelected,
        // Clear tags when deselecting so re-adding a match starts tag-free
        ...(wasSelected ? { tags: [] } : {}),
      };
      return { events: updated };
    }),

  toggleFeatured: (id: string) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return state;
      const updated = [...state.events];
      const nextFeatured = !updated[idx].isFeatured;
      updated[idx] = {
        ...updated[idx],
        isFeatured: nextFeatured,
        // A highlighted match should remain in the selected schedule and banner.
        ...(nextFeatured ? { isSelected: true } : {}),
      };
      return { events: updated };
    }),

  setNote: (id: string, note: string) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return state;
      const updated = [...state.events];
      updated[idx] = { ...updated[idx], tags: note.trim() ? [note.trim()] : [] };
      return { events: updated };
    }),

  toggleTag: (id: string, tag: string) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return state;
      const updated = [...state.events];
      const existing = updated[idx].tags;
      const hasTag = existing.includes(tag);
      updated[idx] = {
        ...updated[idx],
        tags: hasTag ? existing.filter((t) => t !== tag) : [...existing, tag],
      };
      return { events: updated };
    }),

  batchToggleTag: (ids: string[], tag: string) =>
    set((state) => {
      const idSet = new Set(ids);
      const targeted = state.events.filter((e) => idSet.has(e.id));
      const allHave = targeted.length > 0 && targeted.every((e) => e.tags.includes(tag));
      return {
        events: state.events.map((e) => {
          if (!idSet.has(e.id)) return e;
          if (allHave) {
            return { ...e, tags: e.tags.filter((t) => t !== tag) };
          }
          return e.tags.includes(tag) ? e : { ...e, tags: [...e.tags, tag] };
        }),
      };
    }),

  selectAll: () =>
    set((state) => ({
      events: state.events.map((e) => ({ ...e, isSelected: true })),
    })),

  deselectAll: () =>
    set((state) => ({
      events: state.events.map((e) => ({ ...e, isSelected: false, tags: [] })),
    })),

  /** Batch toggle — set isSelected for many IDs in one render */
  batchSetSelected: (ids: string[], selected: boolean) =>
    set((state) => {
      const idSet = new Set(ids);
      return {
        events: state.events.map((e) => {
          if (!idSet.has(e.id)) return e;
          // Clear tags when deselecting so re-adding starts tag-free
          return selected ? { ...e, isSelected: true } : { ...e, isSelected: false, tags: [] };
        }),
      };
    }),

  /** Clear isSelected + isFeatured + tags in one render for the given IDs */
  batchClearAll: (ids: string[]) =>
    set((state) => {
      const idSet = new Set(ids);
      return {
        events: state.events.map((e) =>
          idSet.has(e.id) ? { ...e, isSelected: false, isFeatured: false, tags: [] } : e
        ),
      };
    }),

  setFetchStatus: (key: string, status: FetchStatus) =>
    set((state) => ({
      fetchStatuses: { ...state.fetchStatuses, [key]: status },
    })),

  setFetchStatuses: (statuses: Record<string, FetchStatus>) =>
    set(() => ({
      fetchStatuses: statuses,
    })),

  setDateRange: (start: string, end: string) =>
    set({ dateRange: { start, end } }),

  setActiveSportFilter: (filter: string) =>
    set({ activeSportFilter: filter }),

  getSelectedEvents: () => get().events.filter((e) => e.isSelected),

  getFeaturedEvents: () =>
    get().events.filter((e) => e.isFeatured && e.isSelected),
}));
