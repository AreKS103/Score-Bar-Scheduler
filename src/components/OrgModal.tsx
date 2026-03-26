'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Building2, Users, UserPlus, Crown, UserMinus,
  CheckCircle, Loader2, Mail, LogOut, ShieldCheck, Inbox, Trash2, Pencil, RefreshCw, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OrgMember {
  id: string;
  userId: string;
  email: string | null;
  role: string;
  status?: 'active' | 'invited';
  isYou: boolean;
  joinedAt: string;
}

interface Org {
  id: string;
  name: string;
  slug: string;
}

interface PendingInvite {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  invitedBy: string;
  invitedAt: string;
}

interface OrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrgNameChange?: (name: string) => void;
}

export default function OrgModal({ isOpen, onClose, onOrgNameChange }: OrgModalProps) {
  const [org, setOrg] = useState<Org | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [orgLoading, setOrgLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Org name (auto-save with debounce)
  const [orgNameDraft, setOrgNameDraft] = useState('');
  const [orgNameSaving, setOrgNameSaving] = useState(false);
  const [orgNameSaved, setOrgNameSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<false | 'added' | 'invited'>(false);

  // Remove
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Role dropdown
  const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Leave org
  const [leavingOrg, setLeavingOrg] = useState(false);

  // Delete org
  const [deletingOrg, setDeletingOrg] = useState(false);
  const [deleteOrgConfirm, setDeleteOrgConfirm] = useState('');

  // Create org
  const [orgCreateName, setOrgCreateName] = useState('');
  const [orgCreating, setOrgCreating] = useState(false);
  const [orgCreateError, setOrgCreateError] = useState<string | null>(null);

  // Pending invites (join section)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [decliningInviteId, setDecliningInviteId] = useState<string | null>(null);
  const [inviteAcceptError, setInviteAcceptError] = useState<string | null>(null);
  const [refreshingInvites, setRefreshingInvites] = useState(false);

  // ── Fetch data ─────────────────────────────────────────────────
  const initialLoadedRef = useRef(false);

  const loadOrg = useCallback(async (showSpinner = false) => {
    if (showSpinner && !initialLoadedRef.current) setOrgLoading(true);
    try {
      // Only fetch org info on first load; members are the dynamic part
      if (!initialLoadedRef.current) {
        const [orgRes, membersRes] = await Promise.all([
          fetch('/api/org'),
          fetch('/api/org/members'),
        ]);
        let hasOrg = false;
        if (orgRes.ok) {
          const { organizations } = await orgRes.json();
          const first = organizations?.[0] ?? null;
          hasOrg = !!first;
          setOrg(first ? { id: first.id, name: first.name, slug: first.slug } : null);
          setOrgNameDraft(first?.name ?? '');
        }
        if (membersRes.ok) {
          const { members } = await membersRes.json();
          setOrgMembers(members ?? []);
        }
        // If no org, also fetch pending invites
        if (!hasOrg) {
          try {
            const invitesRes = await fetch('/api/org/invites');
            if (invitesRes.ok) {
              const { invites } = await invitesRes.json();
              setPendingInvites(invites ?? []);
            }
          } catch { /* ignore */ }
        }
      } else {
        // Subsequent loads: only refresh members
        const membersRes = await fetch('/api/org/members');
        if (membersRes.ok) {
          const { members } = await membersRes.json();
          setOrgMembers(members ?? []);
        }
      }
    } finally {
      setOrgLoading(false);
      initialLoadedRef.current = true;
      setInitialLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadOrg(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, loadOrg]);

  // Close role dropdown on outside click
  useEffect(() => {
    if (!roleDropdownId) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [roleDropdownId]);

  // ── Org name editing ──────────────────────────────────────────
  function handleOrgNameChange(value: string) {
    setOrgNameDraft(value);
    setOrgNameSaved(false);
  }

  function commitName() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const trimmed = orgNameDraft.trim();
    setEditingName(false);
    if (!org || !trimmed || trimmed === org.name) {
      setOrgNameDraft(org?.name ?? '');
      return;
    }
    // Optimistic: show new name instantly
    const prevName = org.name;
    setOrg(o => o ? { ...o, name: trimmed } : o);
    onOrgNameChange?.(trimmed);
    // Save in background; revert on failure
    void saveOrgNameBg(org.id, trimmed, prevName);
  }

  function revertName() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setOrgNameDraft(org?.name ?? '');
    setEditingName(false);
  }

  async function saveOrgNameBg(orgId: string, newName: string, prevName: string) {
    setOrgNameSaving(true);
    const res = await fetch('/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, name: newName }),
    });
    setOrgNameSaving(false);
    if (res.ok) {
      setOrgNameSaved(true);
      setTimeout(() => setOrgNameSaved(false), 2000);
    } else {
      // Revert on failure
      setOrg(o => o ? { ...o, name: prevName } : o);
      onOrgNameChange?.(prevName);
      setOrgNameDraft(prevName);
    }
  }

  // ── Invite ─────────────────────────────────────────────────────
  async function inviteMember() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);
    const res = await fetch('/api/org/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const data = await res.json();
    setInviting(false);
    if (!res.ok) {
      setInviteError(data.error ?? 'Failed to add member');
    } else {
      setInviteSuccess(data.invited ? 'invited' : 'added');
      setInviteEmail('');
      setTimeout(() => setInviteSuccess(false), 5000);
      await loadOrg();
    }
  }

  // ── Remove member (optimistic — immediate UI update) ─────────
  async function removeMember(memberId: string) {
    // Snapshot for rollback
    const prevMembers = orgMembers;
    // Optimistic: remove from UI immediately
    setOrgMembers(prev => prev.filter(m => m.id !== memberId));
    setRoleDropdownId(null);

    const res = await fetch('/api/org/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
    if (!res.ok) {
      // Rollback on failure
      const data = await res.json();
      setOrgMembers(prevMembers);
      alert(data.error ?? 'Failed to remove member');
    }
  }

  // ── Change role ────────────────────────────────────────────────
  async function changeRole(memberId: string, newRole: 'owner' | 'member') {
    setChangingRoleId(memberId);
    setRoleDropdownId(null);
    const res = await fetch('/api/org/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, role: newRole }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? 'Failed to change role');
    }
    setChangingRoleId(null);
    await loadOrg();
  }

  // ── Leave org ──────────────────────────────────────────────────
  async function leaveOrg() {
    const me = orgMembers.find(m => m.isYou);
    if (!me) return;
    if (!confirm('Are you sure you want to leave this organization? You will lose access to shared resources.')) return;
    setLeavingOrg(true);
    const res = await fetch('/api/org/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: me.id }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? 'Failed to leave organization');
      setLeavingOrg(false);
      return;
    }
    setLeavingOrg(false);
    setOrg(null);
    setOrgMembers([]);
    initialLoadedRef.current = false;
    setInitialLoaded(false);
    onOrgNameChange?.('');
    onClose();
  }

  // ── Delete org (owner only) ─────────────────────────────────
  async function deleteOrg() {
    if (!org) return;
    if (deleteOrgConfirm !== org.name) return;
    setDeletingOrg(true);
    const res = await fetch('/api/org', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: org.id }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? 'Failed to delete organization');
      setDeletingOrg(false);
      return;
    }
    setDeletingOrg(false);
    setOrg(null);
    setOrgMembers([]);
    setDeleteOrgConfirm('');
    initialLoadedRef.current = false;
    setInitialLoaded(false);
    onOrgNameChange?.('');
    // Reload to show create/join view
    await loadOrg(true);
  }

  // ── Create org ─────────────────────────────────────────────────
  async function createOrg() {
    if (!orgCreateName.trim()) return;
    setOrgCreating(true);
    setOrgCreateError(null);
    const res = await fetch('/api/org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orgCreateName.trim() }),
    });
    const data = await res.json();
    setOrgCreating(false);
    if (!res.ok) {
      setOrgCreateError(data.error ?? 'Failed to create organization');
    } else {
      const createdName = orgCreateName.trim();
      setOrgCreateName('');
      onOrgNameChange?.(createdName);
      initialLoadedRef.current = false;
      await loadOrg(true);
    }
  }

  // ── Accept invite ──────────────────────────────────────────────
  async function acceptInvite(inviteId: string) {
    setAcceptingInviteId(inviteId);
    setInviteAcceptError(null);
    const res = await fetch('/api/org/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    const data = await res.json();
    setAcceptingInviteId(null);
    if (!res.ok) {
      setInviteAcceptError(data.error ?? 'Failed to join organization');
    } else {
      // Successfully joined — reload org data
      const accepted = pendingInvites.find(i => i.id === inviteId);
      onOrgNameChange?.(accepted?.orgName ?? '');
      initialLoadedRef.current = false;
      setPendingInvites([]);
      await loadOrg(true);
    }
  }

  // ── Decline invite ─────────────────────────────────────────────
  async function declineInvite(inviteId: string) {
    setDecliningInviteId(inviteId);
    setInviteAcceptError(null);
    // Optimistic removal
    setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
    const res = await fetch('/api/org/invites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    const data = await res.json();
    setDecliningInviteId(null);
    if (!res.ok) {
      // Rollback
      await refreshInvites();
      setInviteAcceptError(data.error ?? 'Failed to decline invite');
    }
  }

  // ── Refresh invites ────────────────────────────────────────────
  async function refreshInvites() {
    setRefreshingInvites(true);
    try {
      const res = await fetch('/api/org/invites');
      if (res.ok) {
        const { invites } = await res.json();
        setPendingInvites(invites ?? []);
      }
    } finally {
      setRefreshingInvites(false);
    }
  }

  if (!isOpen) return null;

  const myMembership = orgMembers.find(m => m.isYou);
  const isOwner = myMembership?.role === 'owner';
  const isMemberOfOrg = !!myMembership;

  return (
    <div
      className="fixed inset-0 z-600 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Organization Management"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl shadow-black/40 animate-in fade-in-0 zoom-in-95 duration-150">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Building2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-normal">Organization</p>
              {org ? (
                editingName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={orgNameDraft}
                      onChange={e => handleOrgNameChange(e.target.value)}
                      onBlur={commitName}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitName(); }
                        if (e.key === 'Escape') revertName();
                      }}
                      maxLength={100}
                      className="text-sm font-bold bg-transparent border-b border-primary focus:outline-none text-foreground w-44 leading-normal"
                    />
                    {orgNameSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
                    {orgNameSaved && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 group/orgname">
                    <h2 className="text-sm font-bold text-foreground leading-normal">{org.name}</h2>
                    {isOwner && (
                      <button
                        onClick={() => setEditingName(true)}
                        className="p-0.5 opacity-0 group-hover/orgname:opacity-100 text-muted-foreground hover:text-foreground transition-all rounded"
                        aria-label="Edit organization name"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )
              ) : (
                <h2 className="text-sm font-bold text-foreground leading-normal">—</h2>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {orgLoading && !initialLoaded ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : org ? (
            <>
              {/* ── Members ─────────────────────────────────────────── */}
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 leading-normal">
                  <Users className="w-3 h-3" />
                  Members <span className="font-normal normal-case tracking-normal">({orgMembers.length})</span>
                </p>
                <div className="space-y-1.5">
                  {orgMembers.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-secondary/30 border border-border group transition-colors hover:bg-secondary/50"
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-bold shrink-0 select-none leading-none">
                        {(m.email ?? '?').slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate leading-normal">
                          {m.email ?? <span className="text-muted-foreground italic">Unknown</span>}
                          {m.isYou && <span className="ml-1.5 text-[10px] text-muted-foreground leading-normal">(you)</span>}
                        </p>
                      </div>

                      {/* Role badge with dropdown for owners */}
                      <div className="relative shrink-0" ref={roleDropdownId === m.id ? dropdownRef : undefined}>
                        {isOwner && !m.isYou ? (
                          <button
                            onClick={() => setRoleDropdownId(v => v === m.id ? null : m.id)}
                            disabled={changingRoleId === m.id}
                            className={cn(
                              'text-[11px] px-2 py-1 rounded-full border font-medium flex items-center gap-1 transition-all cursor-pointer leading-normal',
                              m.role === 'owner'
                                ? 'text-amber-500 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
                                : 'text-muted-foreground bg-secondary border-border hover:border-primary/40 hover:text-primary'
                            )}
                          >
                            {changingRoleId === m.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : m.role === 'owner' ? (
                              <><Crown className="w-2.5 h-2.5" /> Admin</>
                            ) : (
                              <>Member</>
                            )}
                          </button>
                        ) : (
                          <span className={cn(
                            'text-[11px] px-2 py-1 rounded-full border font-medium flex items-center gap-1 leading-normal',
                            m.role === 'owner'
                              ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                              : 'text-muted-foreground bg-secondary border-border'
                          )}>
                            {m.role === 'owner' ? <><Crown className="w-2.5 h-2.5" /> Admin</> : 'Member'}
                          </span>
                        )}

                        {/* Dropdown menu */}
                        {roleDropdownId === m.id && (
                          <div className="absolute right-0 top-full mt-1 z-50 min-w-32 bg-popover border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
                            <button
                              onClick={() => changeRole(m.id, 'owner')}
                              className={cn(
                                'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-left leading-normal',
                                m.role === 'owner' && 'text-amber-500 font-semibold'
                              )}
                            >
                              <Crown className="w-3 h-3" />
                              Admin
                              {m.role === 'owner' && <CheckCircle className="w-3 h-3 ml-auto" />}
                            </button>
                            <button
                              onClick={() => changeRole(m.id, 'member')}
                              className={cn(
                                'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-left leading-normal',
                                m.role === 'member' && 'text-primary font-semibold'
                              )}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Member
                              {m.role === 'member' && <CheckCircle className="w-3 h-3 ml-auto" />}
                            </button>
                            <div className="border-t border-border" />
                            <button
                              onClick={() => { setRoleDropdownId(null); removeMember(m.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors text-left leading-normal"
                            >
                              <UserMinus className="w-3 h-3" />
                              Remove
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Remove/spacer — always rendered in non-owner view to keep badge aligned */}
                      {!isOwner && (
                        m.isYou ? (
                          <button
                            onClick={() => removeMember(m.id)}
                            disabled={removingMemberId === m.id}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
                            aria-label="Leave organization"
                            title="Leave organization"
                          >
                            {removingMemberId === m.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <UserMinus className="w-3.5 h-3.5" />
                            }
                          </button>
                        ) : (
                          <div className="w-7.5 shrink-0" aria-hidden="true" />
                        )
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Invite (owner only) ─────────────────────────────── */}
              {isOwner && (
                <section>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 leading-normal">
                    <UserPlus className="w-3 h-3" />
                    Invite member
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') inviteMember(); }}
                      placeholder="colleague@example.com"
                      className={cn(
                        'flex-1 px-3 py-2 rounded-md text-sm border bg-secondary/40 leading-normal',
                        'text-foreground placeholder:text-muted-foreground/50',
                        'focus:outline-none focus:ring-2 focus:ring-ring transition',
                        inviteError ? 'border-destructive/60' : 'border-border',
                      )}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={inviteMember}
                      disabled={inviting || !inviteEmail.trim()}
                      className="shrink-0 gap-1.5"
                    >
                      {inviting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : inviteSuccess ? (
                        <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> {inviteSuccess === 'invited' ? 'Sent!' : 'Added!'}</>
                      ) : (
                        <><Mail className="w-3.5 h-3.5" /> Invite</>
                      )}
                    </Button>
                  </div>
                  {inviteError && (
                    <p className="text-xs text-destructive mt-1.5 leading-normal">{inviteError}</p>
                  )}
                  {inviteSuccess === 'invited' && (
                    <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1 leading-normal">
                      <CheckCircle className="w-3 h-3" />
                      Invite sent
                    </p>
                  )}
                  {inviteSuccess === 'added' && (
                    <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1 leading-normal">
                      <CheckCircle className="w-3 h-3" />
                      Member added to your organization.
                    </p>
                  )}
                </section>
              )}

              {/* ── Leave org (member only, not owner) ──────────────── */}
              {isMemberOfOrg && !isOwner && (
                <section className="pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={leaveOrg}
                    disabled={leavingOrg}
                    className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {leavingOrg ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LogOut className="w-3.5 h-3.5" />
                    )}
                    Leave Organization
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-center leading-normal">
                    You must leave this org before creating your own.
                  </p>
                </section>
              )}

              {/* ── Delete org (owner only) ─────────────────────────── */}
              {isOwner && (
                <section className="pt-2 border-t border-border">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 leading-normal">
                    <Trash2 className="w-3 h-3" />
                    Danger zone
                  </p>
                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                    Permanently delete <span className="font-semibold text-foreground">{org?.name}</span> and
                    remove all members. This action cannot be undone. Type the organization name to confirm.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deleteOrgConfirm}
                      onChange={e => setDeleteOrgConfirm(e.target.value)}
                      placeholder={org?.name ?? 'Organization name'}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-md text-sm border border-border bg-secondary/40 leading-normal',
                        'text-foreground placeholder:text-muted-foreground/50',
                        'focus:outline-none focus:ring-2 focus:ring-destructive/30 transition',
                      )}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deleteOrg}
                      disabled={deletingOrg || deleteOrgConfirm !== org?.name}
                      className="shrink-0 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    >
                      {deletingOrg ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <><Trash2 className="w-3.5 h-3.5" /> Delete</>
                      )}
                    </Button>
                  </div>
                </section>
              )}
            </>
          ) : (
            /* ── No org yet — Create / Join ─────────────────────────── */
            <div className="space-y-6 py-2">
              {/* ── Create an Organization ──────────────────────────── */}
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 leading-normal">
                  <Building2 className="w-3 h-3" />
                  Create an organization
                </p>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Start your own org to manage team members, share embeds, and control access.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={orgCreateName}
                    onChange={e => setOrgCreateName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createOrg(); }}
                    placeholder="Organization name"
                    maxLength={100}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-md text-sm border border-border bg-secondary/40 leading-normal',
                      'text-foreground placeholder:text-muted-foreground/50',
                      'focus:outline-none focus:ring-2 focus:ring-ring transition',
                    )}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={createOrg}
                    disabled={orgCreating || !orgCreateName.trim()}
                    className="shrink-0"
                  >
                    {orgCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
                  </Button>
                </div>
                {orgCreateError && (
                  <p className="text-xs text-destructive mt-1.5 leading-normal">{orgCreateError}</p>
                )}
              </section>

              {/* ── Divider ────────────────────────────────────────── */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted-foreground font-medium">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* ── Join an Organization ────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 leading-normal">
                    <Inbox className="w-3 h-3" />
                    Pending invites
                  </p>
                  <button
                    onClick={refreshInvites}
                    disabled={refreshingInvites}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    aria-label="Refresh invites"
                    title="Refresh invites"
                  >
                    <RefreshCw className={cn('w-3 h-3', refreshingInvites && 'animate-spin')} />
                  </button>
                </div>
                {inviteAcceptError && (
                  <p className="text-xs text-destructive mb-2 leading-normal">{inviteAcceptError}</p>
                )}
                {pendingInvites.length === 0 ? (
                  <div className="text-center py-4 px-3 rounded-xl bg-secondary/20 border border-dashed border-border">
                    <Mail className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      No pending invites. Ask your admin to send you an invite.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingInvites.map(inv => (
                      <div
                        key={inv.id}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl bg-secondary/30 border border-border transition-colors hover:bg-secondary/50"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate leading-normal">
                            {inv.orgName}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate leading-normal">
                            Invited by {inv.invitedBy}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acceptInvite(inv.id)}
                            disabled={acceptingInviteId === inv.id || decliningInviteId === inv.id}
                            className="gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-500"
                          >
                            {acceptingInviteId === inv.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <><UserPlus className="w-3.5 h-3.5" /> Join</>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => declineInvite(inv.id)}
                            disabled={decliningInviteId === inv.id || acceptingInviteId === inv.id}
                            className="gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-2"
                            aria-label="Decline invite"
                          >
                            {decliningInviteId === inv.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
