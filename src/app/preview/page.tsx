'use client';

import { useMemo, useCallback, useState } from 'react';
import { Copy, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useScheduleStore } from '@/lib/store';
import { generateHTML } from '@/lib/generateHTML';
import PreviewPanel from '@/components/PreviewPanel';
import PublishButton from '@/components/PublishButton';
import { Button } from '@/components/ui/button';

export default function PreviewPage() {
  const events = useScheduleStore((s) => s.events);
  const [lastPushed, setLastPushed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => generateHTML(events), [events]);
  const getHTML = useCallback(() => html, [html]);
  const selectedCount = events.filter((e) => e.isSelected).length;
  const selectedLeagues = new Set(
    events.filter((e) => e.isSelected).map((e) => e.sportId)
  ).size;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = html;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/schedule"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <h1 className="text-base font-semibold text-foreground">HTML Preview</h1>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? (
                <><CheckCircle className="w-4 h-4 text-emerald-400" /> Copied!</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy HTML</>
              )}
            </Button>

            <PublishButton
              getHTML={getHTML}
              disabled={selectedCount === 0}
              onSuccess={(t) => setLastPushed(t)}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6">
        {selectedCount === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📋</div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              No matches selected
            </h2>
            <p className="text-sm text-muted-foreground">
              Go back to the schedule and select matches to preview.
            </p>
          </div>
        ) : (
          <PreviewPanel
            html={html}
            matchCount={selectedCount}
            leagueCount={selectedLeagues}
            lastPushed={lastPushed}
          />
        )}

        {/* Raw HTML section */}
        {selectedCount > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Raw HTML</h3>
              <Button variant="ghost" size="xs" onClick={handleCopy}>
                {copied ? (
                  <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Copied</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Copy</>
                )}
              </Button>
            </div>
            <pre className="bg-secondary border border-border rounded-lg p-4 text-xs text-muted-foreground overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap wrap-break-word">
              {html}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
