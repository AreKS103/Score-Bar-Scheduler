'use client';
/**
 * Favorites store — persisted to Supabase with localStorage fallback.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface FavoritesState {
  favoriteOrder: string[];
  _loaded: boolean;
  addFavorite: (sportId: string) => void;
  removeFavorite: (sportId: string) => void;
  toggleFavorite: (sportId: string) => void;
  reorderFavorites: (newOrder: string[]) => void;
  isFavorite: (sportId: string) => boolean;
  loadFromSupabase: () => Promise<void>;
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(order: string[]) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('favorites').upsert({
        user_id: user.id,
        favorite_order: order,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[Favorites] save failed:', e);
    }
  }, 500);
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favoriteOrder: [],
      _loaded: false,

      addFavorite: (sportId) =>
        set((state) => {
          if (state.favoriteOrder.includes(sportId)) return state;
          const next = [...state.favoriteOrder, sportId];
          debouncedSave(next);
          return { favoriteOrder: next };
        }),

      removeFavorite: (sportId) =>
        set((state) => {
          const next = state.favoriteOrder.filter((id) => id !== sportId);
          debouncedSave(next);
          return { favoriteOrder: next };
        }),

      toggleFavorite: (sportId) => {
        const { favoriteOrder, addFavorite, removeFavorite } = get();
        if (favoriteOrder.includes(sportId)) removeFavorite(sportId);
        else addFavorite(sportId);
      },

      reorderFavorites: (newOrder) => {
        debouncedSave(newOrder);
        set({ favoriteOrder: newOrder });
      },

      isFavorite: (sportId) => get().favoriteOrder.includes(sportId),

      loadFromSupabase: async () => {
        if (!isSupabaseConfigured()) { set({ _loaded: true }); return; }
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { data } = await supabase
            .from('favorites')
            .select('favorite_order')
            .eq('user_id', user.id)
            .single();
          if (data?.favorite_order) {
            set({ favoriteOrder: data.favorite_order, _loaded: true });
          } else {
            // Push current localStorage favorites up to Supabase
            const current = get().favoriteOrder;
            if (current.length > 0) {
              await supabase.from('favorites').upsert({
                user_id: user.id,
                favorite_order: current,
                updated_at: new Date().toISOString(),
              });
            }
            set({ _loaded: true });
          }
        } catch (e) {
          console.error('[Favorites] load failed:', e);
          set({ _loaded: true });
        }
      },
    }),
    {
      name: 'score-favorites',
      partialize: (state) => ({ favoriteOrder: state.favoriteOrder }),
    }
  )
);
