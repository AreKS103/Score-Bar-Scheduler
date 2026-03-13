import { create } from 'zustand';
import type { MatchEvent, ScreenTag, ScheduleStore, FetchStatus } from '@/types';
import { todayICT, daysFromTodayICT } from '@/lib/timezone';

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  events: [],
  fetchStatuses: {},
  dateRange: {
    start: todayICT(),
    end: daysFromTodayICT(7),
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
      updated[idx] = { ...updated[idx], isSelected: !updated[idx].isSelected };
      return { events: updated };
    }),

  toggleFeatured: (id: string) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return state;
      const updated = [...state.events];
      updated[idx] = { ...updated[idx], isFeatured: !updated[idx].isFeatured };
      return { events: updated };
    }),

  toggleTag: (id: string, tag: ScreenTag) =>
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === id);
      if (idx === -1) return state;
      const event = state.events[idx];
      const newTags = event.tags.includes(tag)
        ? event.tags.filter((t) => t !== tag)
        : [...event.tags, tag];
      const updated = [...state.events];
      updated[idx] = { ...updated[idx], tags: newTags };
      return { events: updated };
    }),

  selectAll: () =>
    set((state) => ({
      events: state.events.map((e) => ({ ...e, isSelected: true })),
    })),

  deselectAll: () =>
    set((state) => ({
      events: state.events.map((e) => ({ ...e, isSelected: false })),
    })),

  /** Batch toggle — set isSelected for many IDs in one render */
  batchSetSelected: (ids: string[], selected: boolean) =>
    set((state) => {
      const idSet = new Set(ids);
      return {
        events: state.events.map((e) =>
          idSet.has(e.id) ? { ...e, isSelected: selected } : e
        ),
      };
    }),

  bulkSetTags: (ids: string[], tags: ScreenTag[]) =>
    set((state) => {
      const idSet = new Set(ids);
      return {
        events: state.events.map((e) =>
          idSet.has(e.id) ? { ...e, tags } : e
        ),
      };
    }),

  setFetchStatus: (key: string, status: FetchStatus) =>
    set((state) => ({
      fetchStatuses: { ...state.fetchStatuses, [key]: status },
    })),

  setDateRange: (start: string, end: string) =>
    set({ dateRange: { start, end } }),

  setActiveSportFilter: (filter: string) =>
    set({ activeSportFilter: filter }),

  getSelectedEvents: () => get().events.filter((e) => e.isSelected),

  getFeaturedEvents: () =>
    get().events.filter((e) => e.isFeatured && e.isSelected),
}));
