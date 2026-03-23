'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Upload, Loader2, Building2, CheckCircle, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BusinessInfo {
  business_name: string;
  logo_url: string | null;
  logo_path: string | null;
  website: string;
  description: string;
  phone: string;
}

interface BusinessInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful save so the parent can refresh the header */
  onSaved?: (info: Pick<BusinessInfo, 'business_name' | 'logo_url'>) => void;
}

const EMPTY: BusinessInfo = {
  business_name: '',
  logo_url: null,
  logo_path: null,
  website: '',
  description: '',
  phone: '',
};

export default function BusinessInfoModal({ isOpen, onClose, onSaved }: BusinessInfoModalProps) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<BusinessInfo>(EMPTY);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Load user + existing business info
  useEffect(() => {
    if (!isOpen) return;
    async function load() {
      setLoading(true);
      setError(null);
      setSaved(false);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from('business_info')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setForm({
          business_name: data.business_name ?? '',
          logo_url: data.logo_url ?? null,
          logo_path: data.logo_path ?? null,
          website: data.website ?? '',
          description: data.description ?? '',
          phone: data.phone ?? '',
        });
      } else {
        setForm(EMPTY);
      }
      setLoading(false);
    }
    load();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogoUpload = async (file: File) => {
    if (!userId) return;
    setUploading(true);
    setError(null);

    try {
      // Fixed path per user → auto-replaces old logo
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${userId}/logo.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('business-logos')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('business-logos')
        .getPublicUrl(path);

      // Bust the CDN cache with a version param
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      setForm(f => ({ ...f, logo_url: publicUrl, logo_path: path }));
    } catch (e: any) {
      setError(e.message ?? 'Logo upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!userId || !form.logo_path) return;
    setUploading(true);
    try {
      await supabase.storage.from('business-logos').remove([form.logo_path]);
      setForm(f => ({ ...f, logo_url: null, logo_path: null }));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);

    const payload = {
      user_id: userId,
      business_name: form.business_name.trim() || null,
      logo_url: form.logo_url,
      logo_path: form.logo_path,
      website: form.website.trim() || null,
      description: form.description.trim() || null,
      phone: form.phone.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error: saveErr } = await supabase
      .from('business_info')
      .upsert(payload, { onConflict: 'user_id' });

    setSaving(false);

    if (saveErr) {
      setError(saveErr.message);
      return;
    }

    setSaved(true);
    onSaved?.({ business_name: form.business_name, logo_url: form.logo_url });
    setTimeout(() => setSaved(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-500 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label="Business Information"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl shadow-black/30 animate-in fade-in-0 zoom-in-95">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-background rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-lg font-bold text-foreground">Business Information</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Logo upload */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Business Logo
                </label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="w-16 h-16 rounded-xl border border-border bg-secondary/40 flex items-center justify-center shrink-0 overflow-hidden">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="Business logo" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 className="w-6 h-6 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-full"
                    >
                      {uploading
                        ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Uploading…</>
                        : <><Upload className="w-3.5 h-3.5 mr-2" /> {form.logo_url ? 'Replace Logo' : 'Upload Logo'}</>
                      }
                    </Button>
                    {form.logo_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        disabled={uploading}
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                    e.target.value = '';
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Shown above the sport filter in the sidebar. Max 5 MB.
                </p>
              </div>

              {/* Business name */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Business Name
                </label>
                <input
                  type="text"
                  value={form.business_name}
                  onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                  placeholder="e.g. Acme Sports Bar"
                  className={cn(
                    'w-full px-3 py-2 rounded-md text-sm border border-border bg-secondary/40',
                    'text-foreground placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition',
                  )}
                />
              </div>

              {/* Website */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Website
                </label>
                <input
                  type="url"
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                  placeholder="https://example.com"
                  className={cn(
                    'w-full px-3 py-2 rounded-md text-sm border border-border bg-secondary/40',
                    'text-foreground placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition',
                  )}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Phone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 555 000 0000"
                  className={cn(
                    'w-full px-3 py-2 rounded-md text-sm border border-border bg-secondary/40',
                    'text-foreground placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition',
                  )}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="A short description of your business…"
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 rounded-md text-sm border border-border bg-secondary/40 resize-none',
                    'text-foreground placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition',
                  )}
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center gap-3 justify-end bg-background rounded-b-2xl">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading || uploading} className="min-w-22">
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : saved
                ? <><CheckCircle className="w-4 h-4 mr-1.5 text-emerald-400" /> Saved</>
                : 'Save'
            }
          </Button>
        </div>
      </div>
    </div>
  );
}
