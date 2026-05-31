import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/player';
import { API_BASE, api } from '../utils/api';

let activeAudio: HTMLAudioElement | null = null;
const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function outputVolume(value: number): number {
  return Math.min(1, Math.max(0, Math.pow(value, 1.65)));
}

function getAudioContext(): AudioContext | null {
  return ((window as any).__noctune_audioCtx as AudioContext | undefined) ?? null;
}

async function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    await ctx.resume();
  }
}

async function playAudio(audio: HTMLAudioElement) {
  await resumeAudioContext();
  await audio.play();
}

function waitForAudioReady(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleReady);
      audio.removeEventListener('canplay', handleReady);
      audio.removeEventListener('error', handleError);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(audio.error ?? new Error('Audio failed to load'));
    };

    audio.addEventListener('loadedmetadata', handleReady, { once: true });
    audio.addEventListener('canplay', handleReady, { once: true });
    audio.addEventListener('error', handleError, { once: true });
  });
}

export function seekAudio(seconds: number) {
  if (!activeAudio) return;
  const state = usePlayerStore.getState();
  const fallbackDuration = state.currentTrack?.duration ?? state.duration;
  const duration = Number.isFinite(activeAudio.duration) && activeAudio.duration > 0
    ? activeAudio.duration
    : fallbackDuration;
  const target = Math.max(0, Math.min(seconds, duration || seconds));

  try {
    if ('fastSeek' in activeAudio && typeof activeAudio.fastSeek === 'function') {
      activeAudio.fastSeek(target);
    } else {
      activeAudio.currentTime = target;
    }
    state.setProgress(target);
  } catch (err) {
    console.warn('[audio] seek failed:', err);
  }
}

/**
 * Manages the actual HTMLAudioElement lifecycle.
 * Must be rendered once at the root level.
 */
export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const suppressNextErrorRef = useRef(false);
  const recoveryAttemptRef = useRef<string | null>(null);
  const recordedTrackRef = useRef<string | null>(null);

  const {
    currentTrack,
    isPlaying,
    volume,
    setProgress,
    setDuration,
    setIsPlaying,
    setLoading,
    next,
  } = usePlayerStore();

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.id = 'noctune-audio';
    // Initialize Web Audio pipeline early (before playback) for visualizer
    try {
      const visCtx = new AudioContext();
      const visAnalyser = visCtx.createAnalyser();
      visAnalyser.fftSize = 256;
      visAnalyser.smoothingTimeConstant = 0.8;
      const visSrc = visCtx.createMediaElementSource(audio);
      visSrc.connect(visAnalyser);
      visAnalyser.connect(visCtx.destination);
      (window as any).__noctune_analyser = visAnalyser;
      (window as any).__noctune_audioCtx = visCtx;
    } catch {}
    audio.preload = 'auto';
    audioRef.current = audio;
    activeAudio = audio;

    audio.addEventListener('timeupdate', () => setProgress(audio.currentTime));
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    });
    audio.addEventListener('ended', () => {
      if (usePlayerStore.getState().repeat === 'one') {
        audio.currentTime = 0;
        playAudio(audio).catch(() => {});
      } else {
        next();
      }
    });
    audio.addEventListener('playing', () => {
      setIsPlaying(true);
      setLoading(false);
      const track = usePlayerStore.getState().currentTrack;
      if (track && recordedTrackRef.current !== track.id) {
        recordedTrackRef.current = track.id;
        api.recordPlayed(track).catch((err) => console.warn('[audio] record history failed:', err));
      }
    });
    audio.addEventListener('waiting', () => setLoading(true));
    audio.addEventListener('canplay', () => setLoading(false));
    audio.addEventListener('error', (e) => {
      const target = e.target as HTMLAudioElement;
      const error = target.error;
      if (
        suppressNextErrorRef.current ||
        !target.currentSrc ||
        error?.message?.toLowerCase().includes('empty src')
      ) {
        suppressNextErrorRef.current = false;
        return;
      }
      console.error('[audio] error', e, target.error);
      setLoading(false);

      const track = usePlayerStore.getState().currentTrack;
      if (!track || track.localAudioPath || recoveryAttemptRef.current === track.id) {
        setIsPlaying(false);
        return;
      }

      const resumeAt = Math.max(
        0,
        target.currentTime || usePlayerStore.getState().progress || 0
      );
      recoveryAttemptRef.current = track.id;
      setLoading(true);
      api.resolve(track.id, track.query)
        .then((resolved) => {
          const latestTrack = usePlayerStore.getState().currentTrack;
          if (!latestTrack || latestTrack.id !== track.id) return;
          usePlayerStore.setState({
            currentTrack: {
              ...resolved,
              title: latestTrack.title,
              artist: latestTrack.artist,
              duration: latestTrack.duration,
              thumbnail: latestTrack.thumbnail,
              query: latestTrack.query,
              spotifyId: latestTrack.spotifyId,
              spotifyUrl: latestTrack.spotifyUrl,
              youtubeId: latestTrack.youtubeId ?? resolved.id,
              youtubeTitle: latestTrack.youtubeTitle,
              youtubeArtist: latestTrack.youtubeArtist,
            },
          });
          target.src = `${API_BASE}/player/stream/${resolved.id}?retry=${Date.now()}`;
          target.load();
          return waitForAudioReady(target)
            .then(() => {
              if (resumeAt > 1) {
                target.currentTime = Math.min(resumeAt, target.duration || resumeAt);
                usePlayerStore.getState().setProgress(resumeAt);
              }
            })
            .then(() => playAudio(target));
        })
        .catch((err) => {
          console.warn('[audio] recovery failed:', err);
          setIsPlaying(false);
          usePlayerStore.getState().markTrackUnavailable(track.id, 'Playback failed');
          setLoading(false);
        });
    });

    return () => {
      suppressNextErrorRef.current = true;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      if (activeAudio === audio) activeAudio = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Swap src when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const src = API_BASE + '/player/stream/' + currentTrack.id;

    if (audio.src !== src) {
      recoveryAttemptRef.current = null;
      recordedTrackRef.current = null;
      audio.crossOrigin = src.startsWith('http') ? 'anonymous' : null;
      audio.src = src;
      audio.load();
    }
    if (isPlaying) {
      playAudio(audio).catch(err => console.warn('[audio] play blocked:', err));
    }
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      if (!currentTrack || !audio.currentSrc) return;
      playAudio(audio).catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrack]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = outputVolume(volume);
  }, [volume]);

  // Seek (only when progress changes externally — not from timeupdate)
  const seek = useCallback((seconds: number) => {
    seekAudio(seconds);
  }, [setProgress]);

  // Sync Media Session API (system media controls)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.youtubeTitle ?? '',
      artwork: currentTrack.thumbnail
        ? [{ src: currentTrack.thumbnail, sizes: '640x640', type: 'image/jpeg' }]
        : [],
    });

    const actions = ['play','pause','previoustrack','nexttrack','seekforward','seekbackward'] as const;
    for (const a of actions) {
      navigator.mediaSession.setActionHandler(a, null);
    }
    navigator.mediaSession.setActionHandler('play', () => usePlayerStore.getState().togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => usePlayerStore.getState().togglePlay());
    navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => usePlayerStore.getState().next());
    navigator.mediaSession.setActionHandler('seekforward', () => {
      const s = usePlayerStore.getState();
      seekAudio(Math.min(s.duration, s.progress + 10));
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      const s = usePlayerStore.getState();
      seekAudio(Math.max(0, s.progress - 10));
    });
  }, [currentTrack]);

  // Sync Discord Rich Presence through the local desktop backend.
  useEffect(() => {
    if (!IS_TAURI) return;

    function syncDiscordActivity() {
      const state = usePlayerStore.getState();
      api.updateDiscordActivity({
        track: state.currentTrack,
        isPlaying: state.isPlaying,
        progress: state.progress,
        duration: state.duration || state.currentTrack?.duration || 0,
      }).catch(() => {});
    }

    syncDiscordActivity();
    const interval = window.setInterval(syncDiscordActivity, 15_000);
    return () => window.clearInterval(interval);
  }, [currentTrack?.id, isPlaying]);

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  return { seek };
}










