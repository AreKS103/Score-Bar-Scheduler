import type { Metadata } from 'next';
import WorldCupFixtures from '@/components/WorldCupFixtures';
import { fetchWorldCupFixtures } from '@/lib/worldCup';

export const metadata: Metadata = {
  title: '2026 FIFA World Cup Fixtures',
  description: 'Live-updated 2026 FIFA World Cup fixtures and knockout bracket slots.',
};

export const dynamic = 'force-dynamic';

export default async function WorldCupPage() {
  const initialData = await fetchWorldCupFixtures('Asia/Phnom_Penh');
  return <WorldCupFixtures initialData={initialData} />;
}