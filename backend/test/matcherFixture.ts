// Fixture test for the Spotify->YouTube matcher scoring, focused on Japanese /
// VTuber tracks where multiple songs share the same official channel.
//
// Invariant under test: a candidate that is a DIFFERENT song from the same
// official channel (with close duration) must NOT be acceptable, even though
// it racks up big positive signals from artist-channel-match / official /
// duration-close. The title-evidence gate is what must catch it.
//
// Run: `npm run test:matcher` (uses tsx, no extra deps).

import {
  buildMatcherQueries,
  isAcceptableCandidate,
  scoreCandidate,
} from '../src/services/youtubeMatcher.js';
import type { Track } from '../src/types/index.js';

type Results = Array<{ name: string; ok: boolean; detail: string }>;
const results: Results = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, ok: true, detail: '' });
  } catch (err) {
    results.push({ name, ok: false, detail: (err as Error).message });
  }
}

function makeTrack(opts: {
  id: string;
  title: string;
  artist: string;
  duration: number;
  spotifyId?: string;
}): Track {
  return {
    id: opts.id,
    title: opts.title,
    artist: opts.artist,
    duration: opts.duration,
    thumbnail: '',
    query: `${opts.title} ${opts.artist}`,
    spotifyId: opts.spotifyId,
  };
}

interface Fixture {
  seed: { title: string; artist: string; duration: number };
  // A different song by the same artist/channel — must NOT be accepted.
  decoyTitle: string;
}

// Real JP / VTuber tracks that have historically confused the matcher because
// the same official channel uploads many songs with similar metadata.
const fixtures: Fixture[] = [
  { seed: { title: 'We Are Gamers!!!!', artist: 'hololive ID', duration: 215 }, decoyTitle: 'Dance Night (Official Audio)' },
  { seed: { title: 'Sugar Rush', artist: 'Ayunda Risu', duration: 200 }, decoyTitle: 'Lonely Night (Official Audio)' },
  { seed: { title: 'I I I', artist: 'Inugami Korone', duration: 192 }, decoyTitle: 'Marble Symphony (Official Audio)' },
  { seed: { title: 'イケ贄', artist: 'ヨルシカ', duration: 205 }, decoyTitle: 'Rainbow Storm (Official Audio)' },
  { seed: { title: 'ファッションビート', artist: 'hololive', duration: 188 }, decoyTitle: 'Neon Lights (Official Audio)' },
  { seed: { title: "Sakura Day's", artist: 'Sakamata Chloe', duration: 210 }, decoyTitle: 'Moonlight Drive (Official Audio)' },
  { seed: { title: 'べこみこ大戦争!!', artist: 'hololive', duration: 225 }, decoyTitle: 'Sunset Boulevard (Official Audio)' },
];

fixtures.forEach((fixture, index) => {
  const { seed, decoyTitle } = fixture;
  const base = makeTrack({
    id: `spotify:fixture-${index}`,
    title: seed.title,
    artist: seed.artist,
    duration: seed.duration,
    spotifyId: `fixture-${index}`,
  });
  const channel = `${seed.artist} Official Channel`;
  const correct = makeTrack({ id: `yt-correct-${index}`, title: seed.title, artist: channel, duration: seed.duration + 1 });
  const decoy = makeTrack({ id: `yt-decoy-${index}`, title: decoyTitle, artist: channel, duration: seed.duration + 2 });

  test(`[${seed.title}] buildMatcherQueries is non-empty`, () => {
    const queries = buildMatcherQueries(base);
    assert(queries.length > 0, 'expected at least one fallback query');
    assert(queries[0].length > 0, 'canonical query should not be empty');
  });

  test(`[${seed.title}] correct song from official channel is acceptable`, () => {
    const scored = scoreCandidate(base, correct);
    assert(
      isAcceptableCandidate(scored),
      `correct candidate should be acceptable (score ${scored.score}, reasons: ${scored.reasons.join(', ')})`
    );
  });

  test(`[${seed.title}] different song from same official channel is NOT acceptable`, () => {
    const scored = scoreCandidate(base, decoy);
    // The decoy should still score high from official/channel/duration signals —
    // that is exactly why the title-evidence gate matters.
    assert(scored.score >= 100, `decoy should score >=100 to make the test meaningful (got ${scored.score})`);
    assert(
      !isAcceptableCandidate(scored),
      `decoy "${decoyTitle}" must NOT be acceptable just because of official/channel/duration (score ${scored.score}, reasons: ${scored.reasons.join(', ')})`
    );
  });
});

// Report
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  // eslint-disable-next-line no-console
  console.log(`  ${mark}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`);
}
// eslint-disable-next-line no-console
console.log(`\n${passed}/${results.length} passed${failed ? `, ${failed} failed` : ''}.`);

if (failed > 0) process.exit(1);
