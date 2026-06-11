'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getClientId, loadSelectionFromSupabase, type SavedSelectionState } from '@/lib/clientCache';

// Sync diagnostics are noisy on every remote change — dev builds only.
const debugLog: typeof console.log =
  process.env.NODE_ENV !== 'production' ? console.log.bind(console) : () => {};

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
 * Subscribe to real-time selection changes. Postgres changes cover legacy
 * per-user rows; Broadcast covers the org-aware canonical row written by
 * `/api/selections`.
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
  const latestBroadcastRef = useRef<string>('');

  useEffect(() => {
    cbRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    if (!enabled || !userId) return;

    let disposed = false;
    const myClientId = getClientId();
    const supabase = createClient();

    const handleBroadcast = async (rawPayload: unknown) => {
      const envelope = rawPayload && typeof rawPayload === 'object' ? rawPayload as Record<string, unknown> : {};
      const payload = envelope.payload && typeof envelope.payload === 'object'
        ? envelope.payload as Record<string, unknown>
        : envelope;
      const embedTarget = typeof payload.embedTarget === 'string' ? payload.embedTarget : '';
      const clientId = typeof payload.clientId === 'string' ? payload.clientId : null;
      const savedAt = typeof payload.savedAt === 'number' ? payload.savedAt : Date.now();
      const dedupeKey = `${embedTarget}:${savedAt}:${clientId ?? ''}`;

      if (clientId && clientId === myClientId) return;
      if (latestBroadcastRef.current === dedupeKey) return;
      latestBroadcastRef.current = dedupeKey;

      const state = await loadSelectionFromSupabase(embedTarget, { preferRemote: true });
      if (disposed) return;
      const deleted = Boolean(payload.deleted) || !state;
      const nextState = state ?? {
        selections: {},
        leagueOrder: [],
        featuredLeagues: {},
        savedAt,
      };
      const selectedCount = Object.values(nextState.selections).filter((s) => s.isSelected || s.isFeatured || s.tags.length > 0).length;
      debugLog(
        `[SelectionSync] broadcast embed=${embedTarget || '(default)'} selected=${selectedCount}`,
        { fromClient: clientId, deleted },
      );
      cbRef.current({ embedTarget, state: nextState, deleted });
    };

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

          const selections = row.selections ?? {};
          const selectedCount = Object.values(selections).filter((s) => s.isSelected || s.isFeatured || s.tags.length > 0).length;
          debugLog(
            `[SelectionSync] remote ${isDelete ? 'DELETE' : payload.eventType} embed=${row.embed_target || '(default)'} selected=${selectedCount}`,
            { updatedAt: row.updated_at, fromClient: row.client_id ?? null },
          );

          cbRef.current({
            embedTarget: row.embed_target ?? '',
            state: {
              selections,
              leagueOrder: row.league_order ?? [],
              featuredLeagues: row.featured_leagues ?? {},
              savedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
            },
            deleted: isDelete,
          });
        },
      )
      .subscribe();

    const broadcastChannels = [
      supabase
        .channel(`selection-sync:user:${userId}`)
        .on('broadcast', { event: 'selection-updated' }, handleBroadcast)
        .subscribe(),
    ];

    fetch('/api/selections?scope=1', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { scope?: { orgId?: string | null; topic?: string | null } } | null) => {
        if (disposed) return;
        const topic = data?.scope?.topic;
        if (!topic || topic === `selection-sync:user:${userId}`) return;
        broadcastChannels.push(
          supabase
            .channel(topic)
            .on('broadcast', { event: 'selection-updated' }, handleBroadcast)
            .subscribe(),
        );
      })
      .catch((error) => console.warn('[SelectionSync] Failed to subscribe to org broadcast scope:', error));

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
      for (const broadcastChannel of broadcastChannels) {
        supabase.removeChannel(broadcastChannel);
      }
    };
  }, [userId, enabled]);
}
