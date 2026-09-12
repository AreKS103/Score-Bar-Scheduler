/* eslint-disable no-console */
import { performance } from 'node:perf_hooks';

const app = process.env.SCOREBAR_APP_URL ?? 'https://scorebar.vercel.app';
const site = process.env.SCOREBAR_SITE_URL ?? 'https://scorekh.com/';

interface Timing {
  ms: number;
  status: number;
  bytes: number;
  text: string;
}

async function timedFetch(url: string): Promise<Timing> {
  const start = performance.now();
  const response = await fetch(url);
  const text = await response.text();
  return {
    ms: Math.round(performance.now() - start),
    status: response.status,
    bytes: Buffer.byteLength(text),
    text,
  };
}

async function main(): Promise<void> {
  const siteHtml = await (await fetch(site)).text();
  const token = siteHtml.match(/\/embed\/([0-9a-f]{64})/)?.[1];
  if (!token) throw new Error(`No public embed token found at ${site}`);

  const base = `${app}/embed/${token}?_wid=dc8d77d&embedId=Schedule%20Page`;
  const full = await timedFetch(base);
  const changedPoll = await timedFetch(`${base}&_poll=1&_serial=stale`);
  const serial = (JSON.parse(changedPoll.text) as { serial?: string }).serial;
  if (!serial) throw new Error('Changed poll did not return a serial');

  const unchangedPolls: Timing[] = [];
  for (let i = 0; i < 10; i++) {
    unchangedPolls.push(await timedFetch(`${base}&_poll=1&_serial=${encodeURIComponent(serial)}`));
  }
  const unchangedTimes = unchangedPolls.map((sample) => sample.ms);

  console.log(JSON.stringify({
    app,
    full: { ms: full.ms, status: full.status, bytes: full.bytes },
    changedPoll: { ms: changedPoll.ms, status: changedPoll.status, bytes: changedPoll.bytes },
    unchangedPoll: {
      minMs: Math.min(...unchangedTimes),
      averageMs: Math.round(unchangedTimes.reduce((sum, ms) => sum + ms, 0) / unchangedTimes.length),
      maxMs: Math.max(...unchangedTimes),
      bytes: [...new Set(unchangedPolls.map((sample) => sample.bytes))],
      allUnchanged: unchangedPolls.every((sample) => {
        const payload = JSON.parse(sample.text) as { unchanged?: boolean };
        return payload.unchanged === true;
      }),
    },
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
