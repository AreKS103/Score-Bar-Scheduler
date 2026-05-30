'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribe to real-time changes on the `embed_instances` table for the
 * current user.  Fires `onChange` on any INSERT, UPDATE, or DELETE so the
 * caller can re-fetch and refresh the embed pills without a page reload.
 *
 * Typical triggers:
 *  - A WordPress site registers a new embed (beacon POST)
 *  - An embed is renamed or deleted from another device / browser tab
 */
export function useEmbedRealtime({
  userId,
  onChange,
  enabled = true,
}: {
  userId?: string | null;
  onChange: () => void;
  enabled?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const queueRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => onChangeRef.current(), 200);
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`embed-instances-user-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'embed_instances',
          filter: `user_id=eq.${userId}`,
        },
        queueRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'embed_instances',
          filter: `user_id=eq.${userId}`,
        },
        queueRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'embed_instances',
        },
        queueRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, enabled]);
}
