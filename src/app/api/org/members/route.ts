import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getUserOrgId } from '@/lib/supabase/org';

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Resolve email addresses for a list of user IDs using DB function (reliable, no pagination) */
async function resolveEmails(userIds: string[]): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  try {
    const { data, error } = await adminClient.rpc('resolve_user_emails', { user_ids: userIds });
    if (error || !data) return {};
    const map: Record<string, string> = {};
    for (const row of data as Array<{ user_id: string; email: string }>) {
      if (row.email) map[row.user_id] = row.email;
    }
    return map;
  } catch {
    return {};
  }
}

/** Find a user ID by email using DB function (reliable, no pagination) */
async function findUserIdByEmail(email: string): Promise<string | null> {
  try {
    const { data, error } = await adminClient.rpc('find_user_by_email', {
      target_email: email.trim().toLowerCase(),
    });
    if (error || !data) return null;
    return data as string;
  } catch {
    return null;
  }
}

/** GET /api/org/members — list members of the user's primary org */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = await getUserOrgId(user.id);
    if (!orgId) return NextResponse.json({ members: [] });

    const { data: members, error } = await adminClient
      .from('organization_members')
      .select('id, user_id, role, status, invited_email, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const userIds = (members ?? []).map(m => m.user_id);
    const emails = await resolveEmails(userIds);

    // Auto-activate invited members whose email has been resolved (user confirmed)
    const toActivate: string[] = [];
    const enriched = (members ?? []).map(m => {
      const email = emails[m.user_id] ?? m.invited_email ?? null;
      let status = m.status ?? 'active';
      // If the member was invited but now has a resolved email (user confirmed), activate them
      if (status === 'invited' && emails[m.user_id]) {
        status = 'active';
        toActivate.push(m.id);
      }
      return {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        status,
        email,
        joinedAt: m.created_at,
        isYou: m.user_id === user.id,
      };
    });

    // Batch-update newly activated members in the background
    if (toActivate.length > 0) {
      adminClient
        .from('organization_members')
        .update({ status: 'active' })
        .in('id', toActivate)
        .then(() => {});
    }

    return NextResponse.json({ members: enriched, orgId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** POST /api/org/members — add a member by email */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email, orgId: bodyOrgId } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Caller can specify orgId; fall back to user's primary org
    const orgId = bodyOrgId ?? (await getUserOrgId(user.id));
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 404 });

    // Verify requesting user is a member (any role can invite for now, but typically owner)
    const { data: membership } = await adminClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // ── Step 1: Try to find existing user by email ──────────────────
    let targetUserId = await findUserIdByEmail(trimmedEmail);
    let invited = false;

    if (targetUserId) {
      // ── User exists — add them immediately ──────────────────────
      // Check not already a member
      const { data: existing } = await adminClient
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: 'This user is already a member of your organization' },
          { status: 409 },
        );
      }

      const { error: insertErr } = await adminClient
        .from('organization_members')
        .insert({
          organization_id: orgId,
          user_id: targetUserId,
          role: 'member',
          status: 'active',
          invited_by: user.id,
        });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, invited: false });
    }

    // ── Step 2: User doesn't exist — try Supabase invite ──────────
    // Build the redirect URL from the request origin
    const origin = req.headers.get('origin')
      || req.headers.get('referer')?.replace(/\/[^/]*$/, '')
      || process.env.NEXT_PUBLIC_SITE_URL
      || 'http://localhost:3000';
    const redirectTo = `${origin}/login`;

    try {
      const { data: inviteData, error: inviteErr } =
        await adminClient.auth.admin.inviteUserByEmail(trimmedEmail, {
          redirectTo,
        });

      if (inviteErr) {
        const msg = inviteErr.message || 'Unknown error';
        // Surface rate-limit errors clearly
        if (msg.toLowerCase().includes('rate') && msg.toLowerCase().includes('limit')) {
          return NextResponse.json(
            { error: 'Email rate limit exceeded. Please wait a few minutes and try again.', code: 'RATE_LIMIT' },
            { status: 429 },
          );
        }
        return NextResponse.json(
          { error: `Failed to send invite: ${msg}`, code: 'INVITE_FAILED' },
          { status: 400 },
        );
      }

      if (!inviteData?.user?.id) {
        return NextResponse.json(
          {
            error: `No account found for "${trimmedEmail}". Ask them to sign up at Score Bar first, then try again.`,
            code: 'NO_ACCOUNT',
          },
          { status: 404 },
        );
      }

      targetUserId = inviteData.user.id;
      invited = true;
    } catch (inviteCatchErr) {
      const msg = inviteCatchErr instanceof Error ? inviteCatchErr.message : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to send invite: ${msg}`, code: 'INVITE_FAILED' },
        { status: 500 },
      );
    }

    // ── Step 3: Insert the invited member ─────────────────────────
    // Check not already a member (in case invite re-used existing pending user)
    const { data: existing } = await adminClient
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'This user is already a member of your organization' },
        { status: 409 },
      );
    }

    const { error: insertErr } = await adminClient
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id: targetUserId,
        role: 'member',
        status: 'invited',
        invited_by: user.id,
        invited_email: trimmedEmail,
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invited });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/** DELETE /api/org/members — remove a member */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { memberId, orgId: bodyOrgId } = await req.json();
    if (!memberId) return NextResponse.json({ error: 'memberId is required' }, { status: 400 });

    const orgId = bodyOrgId ?? (await getUserOrgId(user.id));
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 404 });

    // Verify requesting user is an owner OR is removing themselves
    const { data: membership } = await adminClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    const { data: targetMembership } = await adminClient
      .from('organization_members')
      .select('user_id, role')
      .eq('id', memberId)
      .single();

    const isOwner = membership?.role === 'owner';
    const isRemovingSelf = targetMembership?.user_id === user.id;

    if (!isOwner && !isRemovingSelf) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Prevent removing the last owner
    if (targetMembership?.role === 'owner') {
      const { count } = await adminClient
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('role', 'owner');

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last owner. Transfer ownership or delete the organization.' },
          { status: 400 }
        );
      }
    }

    const { error } = await adminClient
      .from('organization_members')
      .delete()
      .eq('id', memberId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** PATCH /api/org/members — change a member's role (owner ↔ member) */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { memberId, role } = await req.json();
    if (!memberId || !role || !['owner', 'member'].includes(role)) {
      return NextResponse.json({ error: 'memberId and role (owner|member) are required' }, { status: 400 });
    }

    const orgId = await getUserOrgId(user.id);
    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 404 });

    // Verify the requesting user is an owner
    const { data: myMembership } = await adminClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (myMembership?.role !== 'owner') {
      return NextResponse.json({ error: 'Only owners can change roles' }, { status: 403 });
    }

    // Prevent demoting the last owner
    if (role === 'member') {
      const { data: targetMembership } = await adminClient
        .from('organization_members')
        .select('role')
        .eq('id', memberId)
        .single();

      if (targetMembership?.role === 'owner') {
        const { count } = await adminClient
          .from('organization_members')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('role', 'owner');

        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: 'Cannot demote the last owner. Promote another member to owner first.' },
            { status: 400 }
          );
        }
      }
    }

    const { error } = await adminClient
      .from('organization_members')
      .update({ role })
      .eq('id', memberId)
      .eq('organization_id', orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
