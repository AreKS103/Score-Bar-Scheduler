'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import WPConnectWizard from '@/components/onboarding/WPConnectWizard';

function ConnectPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [existingConnection, setExistingConnection] = useState<{
    siteUrl: string;
    connectedAt: string;
  } | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  useEffect(() => {
    // Handle callback query params
    const connected = searchParams.get('connected');
    const site = searchParams.get('site');
    const error = searchParams.get('error');

    if (error) {
      const messages: Record<string, string> = {
        denied: 'Authorization was denied. Please try again.',
        invalid_token: 'Invalid connection token. Please try again from Step 1.',
        missing_params: 'Missing parameters. Please try again.',
        update_failed: 'Failed to save connection. Please try again.',
        internal: 'An internal error occurred. Please try again.',
      };
      const message = messages[error] || 'Connection failed. Please try again.';
      queueMicrotask(() => setCallbackError(message));
    }

    if (connected === 'true' && site) {
      queueMicrotask(() => {
        setExistingConnection({
          siteUrl: decodeURIComponent(site),
          connectedAt: new Date().toISOString(),
        });
        setLoading(false);
      });
      return;
    }

    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data, error: authErr }) => {
      if (authErr || !data.user) {
        router.push('/login');
        return;
      }

      // Check if user already has a WP connection
      try {
        const { data: keyData } = await supabase
          .from('user_api_keys')
          .select('connected_site, updated_at')
          .eq('user_id', data.user.id)
          .maybeSingle();

        if (keyData?.connected_site) {
          setExistingConnection({
            siteUrl: keyData.connected_site,
            connectedAt: keyData.updated_at || new Date().toISOString(),
          });
        }
      } catch {
        // Continue without existing connection
      }

      setLoading(false);
    });
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-lg">
        {callbackError && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {callbackError}
          </div>
        )}
        <WPConnectWizard
          existingConnection={existingConnection}
          onConnected={() => router.push('/schedule')}
        />
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Loading…
      </div>
    }>
      <ConnectPageContent />
    </Suspense>
  );
}
