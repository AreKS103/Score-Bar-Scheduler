import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type InviteOrganization = {
  name?: string | null;
  slug?: string | null;
};

type InviteRow = {
  id: string;
  organization_id: string;
  invited_by: string | null;
  created_at: string;
  organizations?: InviteOrganization | InviteOrganization[] | null;
};

/** Resolve emails for a list of user IDs */
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

/**
 * GET /api/org/invites — list pending org invites for the current user.
 * Matches by user_id (Supabase creates a user record when inviteUserByEmail is called).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Find all organization_members rows where this user is invited
    const { data: invites, error } = await adminClient
      .from('organization_members')
      .select('id, organization_id, role, invited_by, invited_email, created_at, organizations(id, name, slug)')
      .eq('user_id', user.id)
      .eq('status', 'invited')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Resolve inviter emails
    const inviterIds = (invites ?? []).map(i => i.invited_by).filter(Boolean) as string[];
    const inviterEmails = await resolveEmails(inviterIds);

    const result = ((invites ?? []) as InviteRow[]).map(i => {
      const organization = Array.isArray(i.organizations) ? i.organizations[0] : i.organizations;

      return {
        id: i.id,
        orgId: i.organization_id,
        orgName: organization?.name ?? 'Unknown Organization',
        orgSlug: organization?.slug ?? '',
        invitedBy: i.invited_by ? (inviterEmails[i.invited_by] ?? 'Unknown') : 'Unknown',
        invitedAt: i.created_at,
      };
    });

    return NextResponse.json({ invites: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/org/invites — decline (reject) a pending org invite.
 * Body: { inviteId: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { inviteId } = await req.json();
    if (!inviteId) return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });

    // Verify the invite belongs to this user and is still pending
    const { data: invite, error: fetchErr } = await adminClient
      .from('organization_members')
      .select('id, user_id, status')
      .eq('id', inviteId)
      .single();

    if (fetchErr || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }
    if (invite.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (invite.status !== 'invited') {
      return NextResponse.json({ error: 'This invite is no longer pending' }, { status: 409 });
    }

    const { error: deleteErr } = await adminClient
      .from('organization_members')
      .delete()
      .eq('id', inviteId);

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
