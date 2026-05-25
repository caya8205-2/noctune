import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/player';
import { API_BASE } from '../utils/api';

let activeAudio: HTMLAudioElement | null = null;

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
    audio.addEventListener('playing', () => { setIsPlaying(true); setLoading(false); });
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
      setIsPlaying(false);
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

    // Use local file if available, else stream URL
    const src = currentTrack.localAudioPath
      ? `file://${currentTrack.localAudioPath}`
      : API_BASE + '/player/stream/' + currentTrack.id;

    if (audio.src !== src) {
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

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  return { seek };
}










