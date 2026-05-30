'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getClientId, type SavedSelectionState } from '@/lib/clientCache';

/**
 * Payload delivered to the consumer when another device updates a row in
 * `user_selections` for the current user. `embedTarget` indicates which embed
 * slot changed — consumers should compare against the embed they're currently
 * editing and decide whether to apply or just update local cache.
 */
export interface RemoteSelectionChange {
  embedTarget: string;
  state: SavedSelectionState;
  /** True when the change is a DELETE (row removed). */
  deleted: boolean;
}

/**
 * Subscribe to real-time changes on the `user_selections` table for the current
 * authenticated user. Fires `onRemoteChange` for INSERT/UPDATE/DELETE events
 * originating from OTHER devices/tabs (echoes from the same tab are suppressed
 * via the per-tab `client_id` written into the row).
 *
 * Pairs with `apply_user_selection_diff` RPC + migration 041.
 */
export function useSelectionsRealtime({
  userId,
  onRemoteChange,
  enabled = true,
}: {
  userId?: string | null;
  onRemoteChange: (change: RemoteSelectionChange) => void;
  enabled?: boolean;
}) {
  const cbRef = useRef(onRemoteChange);

  useEffect(() => {
    cbRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const myClientId = getClientId();
    const supabase = createClient();

    const channel = supabase
      .channel(`user-selections-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_selections',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const isDelete = payload.eventType === 'DELETE';
          const row = (isDelete ? payload.old : payload.new) as {
            embed_target?: string;
            selections?: SavedSelectionState['selections'];
            league_order?: string[];
            featured_leagues?: Record<string, string>;
            client_id?: string | null;
            updated_at?: string;
          } | null;

          if (!row) return;

          // Echo suppression — ignore events our own tab triggered. Empty-state
          // saves tag the row with this client id immediately before deleting it,
          // so DELETE echoes cannot briefly clear freshly-clicked local UI.
          if (row.client_id && row.client_id === myClientId) return;

          cbRef.current({
            embedTarget: row.embed_target ?? '',
            state: {
              selections: row.selections ?? {},
              leagueOrder: row.league_order ?? [],
              featuredLeagues: row.featured_leagues ?? {},
              savedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
            },
            deleted: isDelete,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enabled]);
}
