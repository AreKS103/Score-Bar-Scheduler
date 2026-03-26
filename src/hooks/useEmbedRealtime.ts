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
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || !userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`embed-instances-user-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'embed_instances',
          filter: `user_id=eq.${userId}`,
        },
        () => onChangeRef.current(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enabled]);
}
