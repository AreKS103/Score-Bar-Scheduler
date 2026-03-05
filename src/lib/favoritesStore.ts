'use client';
/**
 * Favorites store — persisted to localStorage via Zustand persist middleware.
 * Future: swap the 'localStorage' storage implementation for a Supabase adapter
 * to sync favorites per user account.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavoritesState {
  /** Ordered list of favorited sportIds (order follows drag reordering) */
  favoriteOrder: string[];

  /** Add a league to favorites (appends to end) */
  addFavorite: (sportId: string) => void;

  /** Remove a league from favorites */
  removeFavorite: (sportId: string) => void;

  /** Toggle favorite status */
  toggleFavorite: (sportId: string) => void;

  /** Reorder favorites (called after drag-and-drop) */
  reorderFavorites: (newOrder: string[]) => void;

  /** Check if a league is favorited */
  isFavorite: (sportId: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favoriteOrder: [],

      addFavorite: (sportId) =>
        set((state) => {
          if (state.favoriteOrder.includes(sportId)) return state;
          return { favoriteOrder: [...state.favoriteOrder, sportId] };
        }),

      removeFavorite: (sportId) =>
        set((state) => ({
          favoriteOrder: state.favoriteOrder.filter((id) => id !== sportId),
        })),

      toggleFavorite: (sportId) => {
        const { favoriteOrder, addFavorite, removeFavorite } = get();
        if (favoriteOrder.includes(sportId)) {
          removeFavorite(sportId);
        } else {
          addFavorite(sportId);
        }
      },

      reorderFavorites: (newOrder) => set({ favoriteOrder: newOrder }),

      isFavorite: (sportId) => get().favoriteOrder.includes(sportId),
    }),
    {
      name: 'score-favorites', // localStorage key
      // TODO: swap storage for Supabase when ready:
      // storage: createSupabaseStorage(supabaseClient, userId),
    }
  )
);
