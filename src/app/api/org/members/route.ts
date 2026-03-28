import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getUserOrgId } from '@/lib/supabase/org';
import { sendOrgInviteEmail } from '@/lib/mailer';

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

    // Fetch username + avatar and business logo per member in parallel
    const usernameMap: Record<string, string | null> = {};
    const avatarMap: Record<string, string | null> = {};
    const logoMap: Record<string, string | null> = {};
    if (userIds.length) {
      const [profilesRes, bizRes] = await Promise.all([
        adminClient.from('user_profiles').select('user_id, username, avatar_url').in('user_id', userIds),
        adminClient.from('business_info').select('user_id, logo_url').in('user_id', userIds),
      ]);
      for (const p of (profilesRes.data ?? [])) {
        usernameMap[p.user_id] = p.username ?? null;
        avatarMap[p.user_id] = p.avatar_url ?? null;
      }
      for (const b of (bizRes.data ?? [])) {
        logoMap[b.user_id] = b.logo_url ?? null;
      }
    }

    const enriched = (members ?? []).map(m => {
      const email = emails[m.user_id] ?? m.invited_email ?? null;
      return {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        status: m.status ?? 'active',
        email,
        username: usernameMap[m.user_id] ?? null,
        businessLogoUrl: logoMap[m.user_id] ?? null,
        avatarUrl: avatarMap[m.user_id] ?? null,
        joinedAt: m.created_at,
        isYou: m.user_id === user.id,
      };
    });

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

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the org owner can invite members' }, { status: 403 });
    }

    // ── Step 1: Try to find existing user by email ──────────────────
    let targetUserId = await findUserIdByEmail(trimmedEmail);
    let invited = false;

    if (targetUserId) {
      // ── User exists — create a pending invite (not auto-add) ────
      // Check not already a member or already invited
      const { data: existing } = await adminClient
        .from('organization_members')
        .select('id, status')
        .eq('organization_id', orgId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (existing) {
        const msg = existing.status === 'invited'
          ? 'This user already has a pending invite to your organization'
          : 'This user is already a member of your organization';
        return NextResponse.json({ error: msg }, { status: 409 });
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

      // ── Send notification email to the existing user ────────────
      // (fire-and-forget — don't fail the invite if email errors)
      void (async () => {
        try {
          const [orgRes, inviterRes] = await Promise.all([
            adminClient.from('organizations').select('name').eq('id', orgId).single(),
            adminClient.auth.admin.getUserById(user.id),
          ]);
          const orgName = orgRes.data?.name ?? 'an organization';
          const inviterEmail = inviterRes.data?.user?.email ?? 'A team member';
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
          await sendOrgInviteEmail({
            toEmail: trimmedEmail,
            orgName,
            invitedByEmail: inviterEmail,
            acceptUrl: `${siteUrl}/schedule`,
          });
        } catch { /* ignore email errors */ }
      })();

      return NextResponse.json({ ok: true, invited: true });
    }

    // ── Step 2: User doesn't exist — try Supabase invite ──────────
    // Always use the server-controlled site URL, never the request origin header.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const redirectTo = `${siteUrl}/login`;

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
      .select('user_id, role, status')
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

    // Delete the membership row immediately.
    const { error: deleteError } = await adminClient
      .from('organization_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    // Push a Realtime Broadcast message directly to the removed user's
    // personal channel. This is instant and does not rely on postgres_changes
    // (which requires REPLICA IDENTITY FULL for non-PK column filters).
    if (targetMembership?.user_id) {
      const channelName = `user-push:${targetMembership.user_id}`;
      const channel = adminClient.channel(channelName);
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        channel.send({
          type: 'broadcast',
          event: 'org-membership-changed',
          payload: {},
        }).then(() => adminClient.removeChannel(channel));
      });
      // Fire-and-forget: don't block the response on broadcast delivery
    }

    // ── If this was a pending invite, try to invalidate the email link ──
    // Only delete the auth user if their email is unconfirmed (created solely by inviteUserByEmail).
    // This prevents the invite email link from being usable after revocation.
    if (targetMembership?.status === 'invited' && targetMembership.user_id) {
      void (async () => {
        try {
          const { data } = await adminClient.auth.admin.getUserById(targetMembership.user_id);
          if (data?.user && !data.user.email_confirmed_at) {
            await adminClient.auth.admin.deleteUser(targetMembership.user_id);
          }
        } catch { /* ignore cleanup errors */ }
      })();
    }

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
