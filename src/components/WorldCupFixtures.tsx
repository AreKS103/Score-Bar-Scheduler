'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, RefreshCw, Search, Trophy } from 'lucide-react';
import type { WorldCupFixture, WorldCupFixturesPayload } from '@/lib/worldCup';
import { WORLD_CUP_LOGO } from '@/lib/worldCup';
import { cn } from '@/lib/utils';

const STAGE_ORDER = [
  'Group Stage',
  'Round of 32',
  'Round of 16',
  'Quarterfinals',
  'Semifinals',
  'Third Place',
  'Final',
];

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function isPlaceholderTeam(name: string): boolean {
  return /\b(group|winner|loser|round of|third place)\b/i.test(name);
}

function teamInitials(name: string): string {
  if (isPlaceholderTeam(name)) return 'TBD';
  const words = name.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'TBD';
}

function Team({ name, logo }: { name: string; logo?: string }) {
  const placeholder = isPlaceholderTeam(name);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold',
        placeholder ? 'border-dashed border-muted-foreground/35 bg-muted/50 text-muted-foreground' : 'border-border bg-background',
      )}>
        {logo ? <img src={logo} alt="" className="max-h-6 max-w-6 object-contain" loading="lazy" /> : teamInitials(name)}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{name}</span>
    </div>
  );
}

function FixtureRow({ fixture }: { fixture: WorldCupFixture }) {
  const venue = [fixture.venue, fixture.city].filter(Boolean).join(', ');

  return (
    <article className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-sm sm:grid-cols-[74px_minmax(0,1fr)] sm:items-center">
      <div className="flex items-center gap-2 sm:block">
        <div className="text-sm font-bold tabular-nums text-foreground">{fixture.time}</div>
        <div className="text-[11px] font-medium uppercase text-muted-foreground sm:mt-1">{fixture.status}</div>
      </div>
      <div className="min-w-0">
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <Team name={fixture.home} logo={fixture.homeLogo} />
          <span className="hidden text-xs font-semibold uppercase text-muted-foreground sm:block">vs</span>
          <Team name={fixture.away || 'TBD'} logo={fixture.awayLogo} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" />
            {fixture.stage}
          </span>
          {venue && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{venue}</span>
            </span>
          )}
          {fixture.broadcasts.length > 0 && <span>{fixture.broadcasts.slice(0, 3).join(', ')}</span>}
        </div>
      </div>
    </article>
  );
}

export default function WorldCupFixtures({ initialData }: { initialData: WorldCupFixturesPayload }) {
  const [data, setData] = useState(initialData);
  const [stage, setStage] = useState('All');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Phnom_Penh';
      const res = await fetch(`/api/world-cup?timeZone=${encodeURIComponent(timeZone)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`World Cup API returned ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh fixtures');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fixture of data.fixtures) {
      counts.set(fixture.stage, (counts.get(fixture.stage) ?? 0) + 1);
    }
    return counts;
  }, [data.fixtures]);

  const stages = useMemo(() => {
    const found = Array.from(stageCounts.keys());
    return ['All', ...STAGE_ORDER.filter((item) => stageCounts.has(item)), ...found.filter((item) => !STAGE_ORDER.includes(item))];
  }, [stageCounts]);

  const visibleFixtures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.fixtures.filter((fixture) => {
      if (stage !== 'All' && fixture.stage !== stage) return false;
      if (!q) return true;
      return [fixture.home, fixture.away, fixture.stage, fixture.venue, fixture.city, fixture.country]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
  }, [data.fixtures, query, stage]);

  const grouped = useMemo(() => {
    const sections = new Map<string, Map<string, WorldCupFixture[]>>();
    for (const fixture of visibleFixtures) {
      if (!sections.has(fixture.stage)) sections.set(fixture.stage, new Map());
      const dates = sections.get(fixture.stage)!;
      if (!dates.has(fixture.date)) dates.set(fixture.date, []);
      dates.get(fixture.date)!.push(fixture);
    }
    return Array.from(sections.entries()).sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a[0]);
      const bi = STAGE_ORDER.indexOf(b[0]);
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
    });
  }, [visibleFixtures]);

  const nextFixture = useMemo(() => {
    const now = Date.now();
    return data.fixtures.find((fixture) => new Date(fixture.isoDate).getTime() >= now) ?? data.fixtures[0];
  }, [data.fixtures]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-card p-2">
              <img src={WORLD_CUP_LOGO} alt="" className="max-h-10 max-w-10 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-normal sm:text-3xl">2026 FIFA World Cup</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{data.fixtures.length} fixtures</span>
                <span>{data.source.toUpperCase()}</span>
                <span>{formatUpdatedAt(data.updatedAt)}</span>
              </div>
            </div>
          </div>
          {nextFixture && (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm lg:min-w-80">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Next Fixture
              </div>
              <div className="truncate font-semibold">{nextFixture.home} vs {nextFixture.away || 'TBD'}</div>
              <div className="text-xs text-muted-foreground">{formatDate(nextFixture.date)} at {nextFixture.time}</div>
            </div>
          )}
        </header>

        <div className="flex flex-col gap-3 border-b border-border pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {stages.map((item) => {
              const active = item === stage;
              const count = item === 'All' ? data.fixtures.length : stageCounts.get(item) ?? 0;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStage(item)}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                  )}
                >
                  <span>{item}</span>
                  <span className={cn('rounded-sm px-1.5 py-0.5 text-[10px]', active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search fixtures"
                className="h-9 w-full rounded-md border border-border bg-card pl-8 pr-3 text-sm outline-none ring-0 transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-foreground/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-8">
          {grouped.map(([stageName, dates]) => (
            <section key={stageName} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-normal">{stageName}</h2>
                <span className="text-sm text-muted-foreground">{Array.from(dates.values()).reduce((sum, fixtures) => sum + fixtures.length, 0)}</span>
              </div>
              <div className="space-y-5">
                {Array.from(dates.entries()).map(([date, fixtures]) => (
                  <div key={`${stageName}-${date}`} className="space-y-2">
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 py-2 text-sm font-bold backdrop-blur">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {formatDate(date)}
                    </div>
                    <div className="grid gap-2 xl:grid-cols-2">
                      {fixtures.map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {visibleFixtures.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No fixtures match the current filters.
          </div>
        )}
      </div>
    </main>
  );
}