'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribe to real-time changes on the `organization_members` table.
 *
 * - `userId`  — subscribes to rows where `user_id` matches (detects new invites
 *   for the invitee, or your own membership being removed).
 * - `orgId`   — subscribes to rows where `organization_id` matches (admin view:
 *   detects when invitees accept/decline, members join/leave).
 *
 * Both filters are optional and can be used together.
 *
 * `onChange` fires on any INSERT, UPDATE, or DELETE.  The caller decides what to
 * refresh (e.g. re-fetch members, re-fetch invites, update org badge).
 */
export function useOrgRealtime({
  userId,
  orgId,
  onChange,
  enabled = true,
}: {
  userId?: string | null;
  orgId?: string | null;
  onChange: () => void;
  enabled?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    if (!userId && !orgId) return;

    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

    // ── Channel 1: changes for this user (invites arriving / membership removed)
    if (userId) {
      const ch = supabase
        .channel(`org-members-user-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_members',
            filter: `user_id=eq.${userId}`,
          },
          () => onChangeRef.current(),
        )
        .subscribe();
      channels.push(ch);
    }

    // ── Channel 2: changes for this org (admin sees accepts / removals)
    if (orgId) {
      const ch = supabase
        .channel(`org-members-org-${orgId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_members',
            filter: `organization_id=eq.${orgId}`,
          },
          () => onChangeRef.current(),
        )
        .subscribe();
      channels.push(ch);
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [userId, orgId, enabled]);
}
