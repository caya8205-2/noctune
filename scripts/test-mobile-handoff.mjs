import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../frontend/src/hooks/useAudio.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function setup(mobile = true) {
  const effects = [];
  const refs = [];
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const audio = new EventTarget();
  Object.assign(audio, {
    src: 'http://localhost/track-a', currentSrc: 'http://localhost/track-a',
    currentTime: 90, duration: 200, readyState: 4, paused: false, muted: false,
    playbackRate: 1, volume: 1, seeking: false,
    buffered: { length: 1, start: () => 0, end: () => 200 },
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    load() {},
  });
  const track = { id: 'spotify:track:a', title: 'Track A', artist: 'Artist', duration: 200 };
  const state = {
    currentTrack: track, queue: [track], queueIndex: 0, isPlaying: true,
    progress: 90, duration: 200, volume: 1, playbackRate: 1, repeat: 'off',
    setProgress(value) { state.progress = value; },
    setIsPlaying(value) { state.isPlaying = value; },
    setLoading(value) { state.isLoading = value; },
  };
  const store = Object.assign(() => state, {
    getState: () => state,
    setState: (patch) => Object.assign(state, patch),
  });
  window.__noctune_audio = audio;
  window.__noctuneNowPlaying = () => ({
    trackId: state.currentTrack.id, title: state.currentTrack.title,
    artist: 'Artist', streamUrl: audio.src, upNext: [],
  });
  window.location = { href: 'http://localhost/' };
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  const context = {
    exports: {}, window, document, console, URL, Event, AbortController, performance,
    setTimeout, clearTimeout, setInterval, clearInterval,
    HTMLMediaElement: { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2, HAVE_FUTURE_DATA: 3 },
    navigator: {},
    require(name) {
      if (name === 'react') return {
        useEffect: (callback) => effects.push(callback),
        useState: (initial) => [initial, () => {}],
        useRef: (initial) => { const ref = { current: initial }; refs.push(ref); return ref; },
        useCallback: (callback) => callback,
      };
      if (name === '../store/player') return { usePlayerStore: store };
      if (name === '../utils/api') return {
        IS_TAURI_MOBILE: mobile, IS_TAURI: true, apiUrl: async (path) => `http://localhost${path}`,
        getMobileServerConfig: () => null, getSpotifyPlaybackSettingSync: () => 'youtube-match',
      };
      if (name === './useEqualizer') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  context.exports.useAudio();
  refs[0].current = audio;
  const handoff = effects.find((callback) => callback.toString().includes('applyNativePlaybackState'));
  assert.ok(handoff, 'actual Android handoff effect is mounted');
  const cleanup = handoff();
  const visibility = (value) => {
    document.visibilityState = value;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const native = (detail) => {
    window.__noctune_native_state = detail;
    const event = new Event('noctune:native-state');
    event.detail = detail;
    window.dispatchEvent(event);
  };
  const requests = () => {
    const result = [...(window.__noctune_native_requests || [])];
    window.__noctune_native_requests = [];
    if (window.__noctune_native_request) {
      result.push(window.__noctune_native_request);
      window.__noctune_native_request = null;
    }
    return result;
  };
  const initial = requests().find((request) => request.type === 'query');
  if (initial) native({ active: false, requestId: initial.requestId });
  return { window, audio, state, visibility, native, requests, cleanup };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const snapshot = (requestId, extra = {}) => ({
  active: true, playing: true, positionMs: 96000, durationMs: 200000,
  trackId: 'spotify:track:a', title: 'Track A', artist: 'Artist',
  streamUrl: 'http://localhost/track-a', requestId, ...extra,
});

test('the Activity drains playback commands FIFO without losing a legacy download', () => {
  const activity = readFileSync(new URL('../src-tauri/gen/android/app/src/main/java/dev/noctune/app/MainActivity.kt', import.meta.url), 'utf8');
  const declaration = activity.split('private const val TAKE_REQUEST_JS =')[1]?.split(/\r?\n\s*\r?\n/)[0];
  assert.ok(declaration);
  const script = [...declaration.matchAll(/"(?:\\.|[^"\\])*"/g)].map(([literal]) => JSON.parse(literal)).join('');
  const window = {
    __noctune_native_requests: [{ type: 'handoff' }, { type: 'query' }],
    __noctune_native_request: { type: 'download' },
  };
  const result = vm.runInNewContext(script, { window });
  assert.deepEqual(Array.from(result, (request) => request.type), ['handoff', 'query', 'download']);
  assert.equal(window.__noctune_native_requests.length, 0);
  assert.equal(window.__noctune_native_request, null);
  assert.equal(vm.runInNewContext(script, { window }).length, 0);
});

test('desktop playback does not enter the Android handoff protocol', () => {
  const h = setup(false);
  h.visibility('hidden'); h.visibility('visible');
  assert.equal(h.requests().length, 0);
  assert.equal(h.window.__noctune_native_owned, undefined);
  assert.equal(h.audio.paused, false);
});

test('foreground queries fresh state before releasing native playback', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden');
  assert.equal(h.requests()[0]?.type, 'handoff');
  h.visibility('visible');
  const commands = h.requests();
  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.type, 'query');
  assert.equal(h.audio.paused, true);
  h.native(snapshot(commands[0].requestId));
  await tick();
  const release = h.requests().find((command) => command.type === 'resume');
  assert.ok(release, 'release sent only after muted web playback is ready');
  assert.equal(h.audio.muted, true);
  assert.equal(h.audio.currentTime >= 96, true);
  h.native(snapshot(release.requestId, { active: false, playing: true }));
  assert.equal(h.audio.muted, false);
  assert.equal(h.audio.paused, false);
});

test('rapid background cancels an in-flight foreground response', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden'); h.requests();
  h.visibility('visible');
  const query = h.requests()[0];
  h.visibility('hidden'); h.requests();
  h.native(snapshot(query?.requestId));
  await tick();
  assert.equal(h.requests().some((command) => command.type === 'resume'), false);
  assert.equal(h.audio.paused, true);
});

test('native pause and zero position survive handback', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden'); h.requests();
  h.visibility('visible');
  const query = h.requests()[0];
  h.native(snapshot(query?.requestId, { playing: false, positionMs: 0 }));
  await tick();
  const release = h.requests().find((command) => command.type === 'resume');
  assert.ok(release);
  h.native(snapshot(release.requestId, { active: false, playing: false, positionMs: 0 }));
  assert.equal(h.state.isPlaying, false);
  assert.equal(h.audio.paused, true);
  assert.equal(h.audio.currentTime, 0);
});

test('a pause received by native during preparation is honored on release', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.native(snapshot(query.requestId)); await tick();
  const release = h.requests()[0];
  h.native(snapshot(release.requestId, { active: false, playing: false, positionMs: 96500 }));
  assert.equal(h.audio.paused, true);
  assert.equal(h.audio.muted, false);
  assert.equal(h.state.isPlaying, false);
});

test('native remains owner until a pending seek completes', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.audio.seeking = true;
  h.native(snapshot(query.requestId)); await tick();
  assert.equal(h.requests().length, 0);
  assert.equal(h.audio.muted, true);
  h.audio.seeking = false;
  h.audio.dispatchEvent(new Event('seeked')); await tick();
  assert.equal(h.requests()[0]?.type, 'resume');
});

test('a native track change during handback prepares the new track before release', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.native(snapshot(query.requestId)); await tick();
  const release = h.requests()[0];
  h.native(snapshot(release.requestId, { trackId: 'spotify:track:b', title: 'Track B', streamUrl: 'http://localhost/track-b', positionMs: 0 }));
  await tick();
  assert.equal(h.state.currentTrack.id, 'spotify:track:b');
  assert.equal(h.audio.src, 'http://localhost/track-b');
  assert.equal(h.audio.muted, true);
  const nextRelease = h.requests()[0];
  assert.equal(nextRelease.trackId, 'spotify:track:b');
  assert.notEqual(nextRelease.requestId, release.requestId);
});

test('background during pending seek never starts the web element', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.audio.seeking = true;
  h.native(snapshot(query.requestId)); await tick();
  h.visibility('hidden');
  h.audio.seeking = false;
  h.audio.dispatchEvent(new Event('seeked')); await tick();
  assert.equal(h.audio.paused, true);
  assert.equal(h.requests().some((command) => command.type === 'resume'), false);
});

test('a snapshot from an earlier resume cannot rewind released web audio', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.native(snapshot(query?.requestId)); await tick();
  const release = h.requests().find((command) => command.type === 'resume');
  if (release) h.native(snapshot(release.requestId, { active: false, playing: true }));
  h.audio.currentTime = 110;
  h.native(snapshot(query?.requestId, { positionMs: 92000 }));
  assert.equal(h.audio.currentTime, 110);
});

test('live streams skip the buffer lead wait and release as soon as ready', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.audio.duration = Infinity;
  h.audio.buffered = { length: 0, start: () => 0, end: () => 0 };
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.native(snapshot(query.requestId)); await tick();
  const release = h.requests().find((command) => command.type === 'resume');
  assert.ok(release, 'live stream releases without waiting for an impossible lead');
});

test('handback holds native ownership until the web buffer has a playback lead', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.audio.buffered = { length: 0, start: () => 0, end: () => 0 };
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.native(snapshot(query.requestId)); await tick();
  assert.equal(h.requests().some((command) => command.type === 'resume'), false,
    'release must not be sent while the buffer cannot sustain playback');
  assert.equal(h.audio.muted, true);
  h.audio.buffered = { length: 1, start: () => h.audio.currentTime - 1, end: () => h.audio.currentTime + 5 };
  h.audio.dispatchEvent(new Event('progress')); await tick();
  assert.equal(h.requests()[0]?.type, 'resume');
});

test('handback releases after a bounded wait when the buffer lead never arrives', async (t) => {
  const h = setup(); t.after(h.cleanup);
  h.audio.buffered = { length: 0, start: () => 0, end: () => 0 };
  h.visibility('hidden'); h.requests();
  h.visibility('visible'); const query = h.requests()[0];
  h.native(snapshot(query.requestId));
  const started = Date.now();
  const release = await new Promise((resolve) => {
    const timer = setInterval(() => {
      const command = h.requests().find((entry) => entry.type === 'resume');
      if (command) { clearInterval(timer); resolve({ command, waitedMs: Date.now() - started }); }
      else if (Date.now() - started > 30000) { clearInterval(timer); resolve({ command: null, waitedMs: Date.now() - started }); }
    }, 100);
  });
  assert.ok(release.command, 'release is eventually sent even without buffer progress');
  assert.ok(release.waitedMs >= 19000 && release.waitedMs < 26000,
    `wait must be bounded by the lead timeout, waited ${release.waitedMs}ms`);
});

test('youtube handoff preserves canonical URL without reloading while spotify adds single join=1', async (t) => {
  const h = setup(); t.after(h.cleanup);
  let loads = 0;
  h.audio.load = () => { loads++; };
  h.audio.src = 'http://localhost/player/stream/Ws2UqahG3sg?apiKey=test';
  h.visibility('hidden');
  const ytHandoff = h.requests()[0];
  assert.equal(ytHandoff.url, 'http://localhost/player/stream/Ws2UqahG3sg?apiKey=test');
  h.visibility('visible');
  const query = h.requests()[0];
  h.native(snapshot(query.requestId, { streamUrl: ytHandoff.url }));
  await tick();
  assert.equal(loads, 0, 'matching youtube stream URL must not cold-reload the audio element');
  const release = h.requests().find((c) => c.type === 'resume');
  h.native(snapshot(release.requestId, { active: false, playing: true, streamUrl: ytHandoff.url }));

  h.audio.src = 'http://localhost/player/stream/spotify:1s1n67uXQnz6YXm0nxohya?apiKey=test&join=1';
  h.visibility('hidden');
  const spHandoff = h.requests()[0];
  assert.equal(spHandoff.url, 'http://localhost/player/stream/spotify:1s1n67uXQnz6YXm0nxohya?apiKey=test&join=1');
});
