'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, ChevronDown, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PublishButtonProps {
  getHTML: () => string;
  disabled?: boolean;
  onSuccess?: (timestamp: string) => void;
  onDeleteSchedule?: () => Promise<void>;
}

export default function PublishButton({ getHTML, disabled, onSuccess, onDeleteSchedule }: PublishButtonProps) {
  const [status, setStatus] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setDeleteConfirm(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handlePush = async () => {
    if (disabled) return;
    const html = getHTML();
    if (!html) return;

    setStatus('pushing');
    setMessage('');

    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const result = await res.json();
      setStatus('success');
      setMessage(`Published at ${result.updated}`);
      onSuccess?.(result.updated);
      setTimeout(() => { setStatus('idle'); setMessage(''); }, 5000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Publish failed — check server logs');
    }
  };

  const handleDelete = async () => {
    if (!onDeleteSchedule) return;
    setIsDeleting(true);
    try {
      await onDeleteSchedule();
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(false);
      setDropdownOpen(false);
    }
  };

  const colorClass =
    status === 'success'
      ? 'bg-emerald-600 border-emerald-600 text-white'
      : status === 'error'
      ? 'bg-destructive border-destructive text-white'
      : disabled
      ? 'bg-secondary border-border text-muted-foreground'
      : 'bg-orange-600 border-orange-600 text-white';

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={dropdownRef}>
        {/* Split button */}
        <div className={cn('flex rounded-md overflow-hidden border text-sm font-medium', colorClass)}>
          {/* Main publish action */}
          <button
            onClick={handlePush}
            disabled={disabled || status === 'pushing'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
              !disabled && status === 'idle' && 'hover:bg-orange-500',
              status === 'success' && 'hover:bg-emerald-500',
              status === 'error' && 'hover:bg-destructive/90',
              (disabled || status === 'pushing') && 'opacity-60 cursor-not-allowed'
            )}
          >
            {status === 'pushing' && <Loader2 className="w-4 h-4 animate-spin" />}
            {status === 'success' && <CheckCircle className="w-4 h-4" />}
            {status === 'error' && <AlertCircle className="w-4 h-4" />}
            {status === 'idle' && <Upload className="w-4 h-4" />}
            {status === 'pushing' ? 'Publishing…' : 'Publish'}
          </button>

          {/* Divider */}
          <div className="w-px bg-white/20 self-stretch" />

          {/* Dropdown trigger */}
          <button
            onClick={() => { setDropdownOpen((o) => !o); setDeleteConfirm(false); }}
            className="flex items-center px-2 py-1.5 hover:bg-white/10 transition-colors"
            aria-label="More publish options"
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-150', dropdownOpen && 'rotate-180')} />
          </button>
        </div>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-1.5 z-200 bg-popover border border-border rounded-lg shadow-2xl shadow-black/40 min-w-55 overflow-hidden animate-in fade-in-0 zoom-in-95">
            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                Delete current schedule
              </button>
            ) : (
              <div className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Delete the published schedule from WordPress?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-accent transition-colors text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md bg-destructive hover:bg-destructive/80 transition-colors text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {message && (
        <span className={cn(
          'text-xs max-w-50 truncate',
          status === 'success' ? 'text-emerald-400' : 'text-destructive'
        )}>
          {message}
        </span>
      )}
    </div>
  );
}
