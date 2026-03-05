import type { Metadata } from 'next';
import { TooltipProvider } from '@/components/ui/tooltip';
import ThemeProvider from '@/components/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'SCORE Sports Bar — Schedule Admin',
  description:
    'Admin tool for SCORE Sports Bar & Grill. Fetch, curate, and publish weekly sports schedules to WordPress.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
