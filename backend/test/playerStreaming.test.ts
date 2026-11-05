import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const MIB = 1024 * 1024;
const data = Buffer.alloc(3 * MIB);
for (let i = 0; i < data.length; i++) data[i] = (i * 31 + Math.floor(i / 997)) % 251;
const playerPath = path.resolve(__dirname, '../src/routes/player.ts');
const requirePlayer = createRequire(playerPath);
const source = transformSync(`${readFileSync(playerPath, 'utf8')}\nexport const testFetch = fetchAudioStream;`, {
  loader: 'ts', format: 'cjs', target: 'node20',
}).code;

type Fault = 'truncated' | 'shifted' | 'oversized' | 'total' | 'length' | 'ignored' | 'encoding' | 'validator' | '416';
async function harness(options: { recovery?: boolean; refreshSuccess?: boolean; fault?: Fault; faultAt?: number; holdAt?: number; status416?: boolean } = {}) {
  const requests: { start: number; end: number; signal?: AbortSignal | null }[] = [];
  let cancels = 0;
  let refreshes = 0;
  let recoveries = 0;
  let clears = 0;
  const held = new EventEmitter();
  const audio = { url: 'https://recovered.googlevideo.com/audio' };
  const cached = { id: 'abcdefghijk', audioUrl: 'https://test.googlevideo.com/audio', query: 'track', title: 'track' };
  const mockFetch = async (url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('range');
    assert.ok(range, 'upstream request must be bounded');
    const suffix = /^bytes=-(\d+)$/.exec(range);
    const match = /^bytes=(\d+)-(\d+)$/.exec(range);
    assert.ok(match || suffix, `unexpected upstream range: ${range}`);
    const start = suffix ? Math.max(0, data.length - Number(suffix[1])) : Number(match![1]);
    const requestedEnd = suffix ? data.length - 1 : Number(match![2]);
    assert.ok(requestedEnd - start + 1 <= MIB, 'upstream exceeds 1 MiB');
    requests.push({ start, end: requestedEnd, signal: init?.signal });
    if (options.recovery && !url.includes('recovered')) return new Response(null, { status: 403 });
    if (options.holdAt === requests.length) {
      held.emit('waiting');
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      });
    }
    if (start >= data.length || options.status416) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } });
    }
    const end = Math.min(requestedEnd, data.length - 1);
    const fault = requests.length === (options.faultAt ?? 2) ? options.fault : undefined;
    const headers = new Headers({
      'content-range': `bytes ${start + (fault === 'shifted' ? 1 : 0)}-${end}/${data.length + (fault === 'total' ? 1 : 0)}`,
      'content-length': String(end - start + 1 + (fault === 'length' ? 1 : 0)),
      'content-type': 'audio/mp4',
      'etag': fault === 'validator' ? '"changed"' : '"original"',
    });
    if (fault === 'encoding') headers.set('content-encoding', 'gzip');
    let position = start;
    const bodyEnd = end + (fault === 'truncated' ? -19 : fault === 'oversized' ? 19 : 0);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (position > bodyEnd) { controller.close(); return; }
        const next = Math.min(position + 16384, bodyEnd + 1);
        controller.enqueue(data.subarray(position, next));
        position = next;
      },
      cancel() { cancels++; },
    }, { highWaterMark: 0 });
    return new Response(body, { status: fault === 'ignored' ? 200 : fault === '416' ? 416 : 206, headers });
  };
  const services: Record<string, unknown> = {
    getEnvConfig: () => ({ audioQualityPreference: 'auto' }),
    getPrefetched: () => undefined,
    getCachedById: () => cached,
    isUrlFresh: () => true,
    cacheMatchesAudioQuality: () => true,
    isPlaybackBlacklisted: () => false,
    getExistingAudioCachePath: () => undefined,
    resolveAudioUrl: async () => { refreshes++; return options.refreshSuccess ? audio : { url: cached.audioUrl }; },
    resolveTrack: async () => { recoveries++; return { track: cached, audio }; },
    refreshTrackUrl: () => {},
    upsertTrack: () => ({ ...cached, audioUrl: audio.url }),
    clearAudioCacheForId: () => { clears++; },
    clearTrackCache: () => { clears++; },
    clearPrefetchForId: () => { clears++; },
    markPlaybackFailed: () => {},
  };
  const module = { exports: {} as any };
  runInNewContext(source, {
    module, exports: module.exports, fetch: mockFetch, console,
    AbortController, AbortSignal, Response, Headers, ReadableStream, Uint8Array,
    require: (id: string) => {
      if (id.startsWith('../services/')) return services;
      if (id === 'p-queue') return class {};
      return requirePlayer(id);
    },
  }, { filename: playerPath });
  let handler: any;
  await module.exports.playerRoutes({
    get(route: string, fn: any) { if (route === '/player/stream/:videoId') handler = fn; },
    post() {}, log: { info() {}, warn() {}, error() {} },
  });
  // The helper uses the same mocked fetch without loading resolver/database modules.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as typeof fetch;
  const reply = {
    raw: new EventEmitter(), statusCode: 200, headers: {} as Record<string, string>, payload: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    header(name: string, value: unknown) { this.headers[name.toLowerCase()] = String(value); return this; },
    send(payload?: unknown) { this.payload = payload; return this; },
  };
  return {
    requests, reply, held,
    stats: () => ({ cancels, refreshes, recoveries, clears }),
    run: (range?: string) => handler({ params: { videoId: cached.id }, headers: { range }, raw: new EventEmitter() }, reply),
    bounded: () => module.exports.testFetch(cached.id, cached.audioUrl, undefined, true, true),
    cleanup() { reply.payload?.destroy?.(); reply.raw.emit('close'); globalThis.fetch = originalFetch; },
  };
}

async function bytes(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

for (const [name, range, start, end] of [
  ['no range', undefined, 0, data.length - 1],
  ['zero open', 'bytes=0-', 0, data.length - 1],
  ['nonzero open', 'bytes=17777-', 17777, data.length - 1],
  ['closed', 'bytes=777-2500000', 777, 2500000],
  ['clamped closed', 'bytes=17777-9999999', 17777, data.length - 1],
  ['suffix', 'bytes=-1500000', data.length - 1500000, data.length - 1],
  ['oversized suffix', 'bytes=-9999999', 0, data.length - 1],
  ['small closed', 'bytes=111-222', 111, 222],
] as const) {
  test(`streams exact bytes: ${name}`, async () => {
    const h = await harness();
    try {
      await h.run(range);
      const actual = await bytes(h.reply.payload);
      assert.equal(actual.length, end - start + 1);
      assert.deepEqual(actual, data.subarray(start, end + 1));
      assert.equal(h.reply.statusCode, range ? 206 : 200);
      assert.equal(h.reply.headers['content-length'], String(end - start + 1));
      assert.equal(h.reply.headers['content-range'], range ? `bytes ${start}-${end}/${data.length}` : undefined);
    } finally { h.cleanup(); }
  });
}

for (const refreshSuccess of [false, true]) {
  for (const range of [undefined, 'bytes=777-', 'bytes=777-2500000', 'bytes=-1500000']) {
    test(`${refreshSuccess ? 'URL refresh' : 'full recovery'} streams ${range ?? 'full response'}`, async () => {
      const h = await harness({ recovery: true, refreshSuccess });
      try {
        await h.run(range);
        const start = range?.includes('-1500000') ? data.length - 1500000 : range ? 777 : 0;
        const end = range?.endsWith('-2500000') ? 2500000 : data.length - 1;
        const actual = await bytes(h.reply.payload);
        assert.equal(actual.length, end - start + 1);
        assert.deepEqual(actual, data.subarray(start, end + 1));
        assert.equal(h.reply.statusCode, range ? 206 : 200);
        assert.equal(h.reply.headers['content-length'], String(end - start + 1));
        assert.equal(h.reply.headers['content-range'], range ? `bytes ${start}-${end}/${data.length}` : undefined);
        assert.equal(h.stats().recoveries, refreshSuccess ? 0 : 1);
      } finally { h.cleanup(); }
    });
  }
}

for (const refreshSuccess of [false, true]) {
  test(`416 after ${refreshSuccess ? 'URL refresh' : 'full recovery'} stops further recovery`, async () => {
    const h = await harness({ recovery: true, refreshSuccess, status416: true });
    try {
      await h.run('bytes=0-');
      assert.equal(h.reply.statusCode, 416);
      assert.equal(h.reply.headers['content-range'], `bytes */${data.length}`);
      assert.equal(h.stats().refreshes, 1);
      assert.equal(h.stats().recoveries, refreshSuccess ? 0 : 1);
      assert.equal(h.stats().clears, 0);
    } finally { h.cleanup(); }
  });
}

for (const range of [`bytes=${data.length}-`, 'bytes=-0', 'bytes=200-100']) {
  test(`416 does not refresh or clear caches: ${range}`, async () => {
    const h = await harness();
    try {
      await h.run(range);
      assert.equal(h.reply.statusCode, 416);
      assert.equal(h.reply.headers['content-range'], `bytes */${data.length}`);
      assert.equal(h.stats().refreshes, 0);
      assert.equal(h.stats().recoveries, 0);
      assert.equal(h.stats().clears, 0);
    } finally { h.cleanup(); }
  });
}

for (const fault of ['truncated', 'shifted', 'oversized', 'total', 'length', 'ignored', 'encoding', 'validator', '416'] as const) {
  test(`rejects ${fault} continuation instead of completing corrupt audio`, async () => {
    const h = await harness({ fault });
    try {
      await h.run();
      await assert.rejects(bytes(h.reply.payload));
      assert.equal(h.requests.length, 2);
      assert.equal(h.stats().refreshes, 0);
    } finally { h.cleanup(); }
  });
}

test('backpressure does not fetch continuations; disconnect cancels current body', async () => {
  const h = await harness();
  try {
    await h.run();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.requests.length, 1);
    h.reply.raw.emit('close');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].signal?.aborted, true);
    assert.ok(h.stats().cancels > 0);
  } finally { h.cleanup(); }
});

test('disconnect aborts a pending continuation fetch', async () => {
  const h = await harness({ holdAt: 2 });
  try {
    await h.run();
    const waiting = once(h.held, 'waiting');
    const reading = bytes(h.reply.payload);
    const rejected = assert.rejects(reading);
    await waiting;
    h.reply.raw.emit('close');
    await rejected;
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].signal?.aborted, true);
  } finally { h.cleanup(); }
});

test('disconnect aborts the initial fetch without resolver or cache work', async () => {
  const h = await harness({ holdAt: 1 });
  try {
    const waiting = once(h.held, 'waiting');
    const running = h.run();
    await waiting;
    h.reply.raw.emit('close');
    await running;
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].signal?.aborted, true);
    assert.equal(h.stats().refreshes, 0);
    assert.equal(h.stats().recoveries, 0);
    assert.equal(h.stats().clears, 0);
  } finally { h.cleanup(); }
});

for (const faultAt of [1, 3]) {
  test(`rejects truncation in chunk ${faultAt}`, async () => {
    const h = await harness({ fault: 'truncated', faultAt });
    try {
      await h.run();
      await assert.rejects(bytes(h.reply.payload), /Truncated/);
      assert.equal(h.requests.length, faultAt);
    } finally { h.cleanup(); }
  });
}

test('rejects shifted first chunk before sending audio', async () => {
  const h = await harness({ fault: 'shifted', faultAt: 1 });
  try {
    await h.run();
    assert.equal(h.reply.statusCode, 502);
    assert.equal(h.requests.length, 1);
    assert.equal(h.stats().cancels, 1);
    assert.equal(h.stats().refreshes, 0);
    assert.equal(h.stats().clears, 0);
  } finally { h.cleanup(); }
});

test('explicit bounded cache fetch remains one chunk', async () => {
  const h = await harness();
  try {
    const { res } = await h.bounded();
    assert.equal((await res.arrayBuffer()).byteLength, MIB);
    assert.equal(res.headers.get('content-range'), `bytes 0-${MIB - 1}/${data.length}`);
    assert.equal(h.requests.length, 1);
  } finally { h.cleanup(); }
});
