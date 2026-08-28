import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/player';
import { api, apiUrl, IS_TAURI } from '../utils/api';
import { createEqualizerNodes } from './useEqualizer';

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
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const crossfadeActiveRef = useRef(false);
  const lastCrossfadedTrackIdRef = useRef<string | null>(null);
  const suppressNextErrorRef = useRef(false);
  const recoveryAttemptsRef = useRef<Record<string, number>>({});

  const {
    currentTrack,
    queue,
    queueIndex,
    shuffle,
    isPlaying,
    volume,
    playbackRate,
    sleepTimerEnd,
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
      // Insert EQ filters between analyser and destination (dry/wet routing)
      createEqualizerNodes(visCtx, visAnalyser);
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
      if (!track || track.localAudioPath) {
        setIsPlaying(false);
        return;
      }

      const attemptCount = (recoveryAttemptsRef.current[track.id] || 0) + 1;
      recoveryAttemptsRef.current[track.id] = attemptCount;
      if (attemptCount > 2) {
        console.warn(`[audio] max recovery attempts reached for ${track.id}`);
        setIsPlaying(false);
        return;
      }

      const resumeAt = Math.max(
        0,
        target.currentTime || usePlayerStore.getState().progress || 0
      );
      setLoading(true);
      api.resolve(track.id, track.query)
        .then((resolved) => {
          const latestTrack = usePlayerStore.getState().currentTrack;
          if (!latestTrack || latestTrack.id !== track.id) return;
          const newYtId = resolved.youtubeId || resolved.id;
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
              youtubeId: newYtId,
              youtubeTitle: latestTrack.youtubeTitle,
              youtubeArtist: latestTrack.youtubeArtist,
            },
          });
          const streamPath = `/player/stream/${newYtId}?retry=${Date.now()}`;
          return apiUrl(streamPath)
            .then((src) => {
              target.crossOrigin = src.startsWith('http') ? 'anonymous' : null;
              target.src = src;
              target.load();
              return waitForAudioReady(target);
            })
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
    if (currentTrack.id.startsWith('spotify:') && !currentTrack.youtubeId) return;

    let cancelled = false;
    const targetId = (currentTrack.youtubeId || currentTrack.id).replace(/^(youtube|ytdlp):/, '').trim();
    
    // Check if we already have a prebuffered audio element in memory
    const prebufferedAudio = preloadedAudiosRef.current.get(targetId) || preloadedAudiosRef.current.get(currentTrack.id);
    if (prebufferedAudio && prebufferedAudio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      delete recoveryAttemptsRef.current[currentTrack.id];
      if (audio.src !== prebufferedAudio.src) {
        audio.crossOrigin = prebufferedAudio.crossOrigin;
        audio.src = prebufferedAudio.src;
      }
      setLoading(false);
      if (usePlayerStore.getState().isPlaying) {
        playAudio(audio).catch(() => {});
      }
      preloadedAudiosRef.current.delete(targetId);
      preloadedAudiosRef.current.delete(currentTrack.id);
      return;
    }

    apiUrl('/player/stream/' + targetId)
      .then((src) => {
        if (cancelled || !audioRef.current) return;
        delete recoveryAttemptsRef.current[currentTrack.id];
        if (audio.src !== src) {
          audio.crossOrigin = src.startsWith('http') ? 'anonymous' : null;
          audio.src = src;
          audio.load();
        }
        waitForAudioReady(audio)
          .then(() => {
            if (cancelled) return;
            setLoading(false);
            if (usePlayerStore.getState().isPlaying) {
              return playAudio(audio);
            }
          })
          .catch((err) => {
            console.warn('[audio] play blocked or metadata load failed:', err);
          });
      })
      .catch((err) => {
        console.warn('[audio] stream URL failed:', err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, currentTrack?.youtubeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prebuffer audio elements in background for next tracks in queue
  useEffect(() => {
    if (!queue || queue.length === 0 || queueIndex < 0) return;
    const upcoming = queue.slice(queueIndex + 1, queueIndex + 4);
    
    // Clean old prebuffered audios not in upcoming
    const upcomingIds = new Set(upcoming.map(t => (t.youtubeId || t.id).replace(/^(youtube|ytdlp):/, '').trim()));
    for (const [id, el] of preloadedAudiosRef.current.entries()) {
      if (!upcomingIds.has(id)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        preloadedAudiosRef.current.delete(id);
      }
    }

    // Preload next upcoming audio streams into browser media cache
    for (const track of upcoming) {
      const cleanId = (track.youtubeId || track.id).replace(/^(youtube|ytdlp):/, '').trim();
      if (!cleanId || cleanId.startsWith('spotify:') || preloadedAudiosRef.current.has(cleanId)) continue;

      apiUrl('/player/stream/' + cleanId)
        .then((src) => {
          if (preloadedAudiosRef.current.has(cleanId)) return;
          const preAudio = new Audio();
          preAudio.preload = 'auto';
          preAudio.crossOrigin = src.startsWith('http') ? 'anonymous' : null;
          preAudio.src = src;
          preAudio.load();
          preloadedAudiosRef.current.set(cleanId, preAudio);
        })
        .catch(() => {});
    }
  }, [queue, queueIndex, shuffle]);

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

  // Sync playback rate
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Sleep timer
  useEffect(() => {
    if (!sleepTimerEnd) return;
    const TICK = 1_000;

    const timer = window.setInterval(() => {
      const remaining = sleepTimerEnd - Date.now();
      if (remaining <= 0) {
        window.clearInterval(timer);
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          audio.pause();
          setIsPlaying(false);
        }
        usePlayerStore.setState({ sleepTimerEnd: null });
      }
    }, TICK);

    return () => window.clearInterval(timer);
  }, [sleepTimerEnd, setIsPlaying]);

  // Crossfade: when nearing end of track, start next track and fade
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const crossfadeDuration = usePlayerStore.getState().crossfadeDuration;
    if (!crossfadeDuration || crossfadeDuration <= 0) return;
    if (crossfadeActiveRef.current) return;
    if (lastCrossfadedTrackIdRef.current === currentTrack.id) return;

    const remaining = audio.duration - audio.currentTime;
    if (remaining > crossfadeDuration || remaining < 0.5) return;

    // Don't crossfade if repeat-one or no next track
    const state = usePlayerStore.getState();
    if (state.repeat === 'one') return;
    const nextIdx = state.queueIndex + 1;
    if (nextIdx >= state.queue.length) return;

    lastCrossfadedTrackIdRef.current = currentTrack.id;
    crossfadeActiveRef.current = true;

    const nextTrack = state.queue[nextIdx];
    const crossfadeMs = crossfadeDuration * 1000;
    const startVolume = outputVolume(state.volume);
    const nextAudio = new Audio();
    nextAudioRef.current = nextAudio;
    nextAudio.crossOrigin = 'anonymous';
    nextAudio.preload = 'auto';
    nextAudio.volume = 0;
    nextAudio.playbackRate = state.playbackRate;

    apiUrl('/player/stream/' + nextTrack.id).then((src) => {
      nextAudio.src = src;
      nextAudio.load();
      return waitForAudioReady(nextAudio).then(() => {
        nextAudio.play().catch(() => {});
        // Start crossfade
        const fadeStart = Date.now();
        const fadeInterval = window.setInterval(() => {
          const elapsed = Date.now() - fadeStart;
          const t = Math.min(1, elapsed / crossfadeMs);
          // Use sine easing for smoother crossfade
          const currentGain = Math.cos(t * Math.PI / 2);
          const nextGain = Math.sin(t * Math.PI / 2);
          audio.volume = startVolume * currentGain;
          nextAudio.volume = startVolume * nextGain;

          if (t >= 1) {
            window.clearInterval(fadeInterval);
            // Swap: next becomes active
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            // Point activeAudio to the next audio element
            activeAudio = nextAudio;
            audioRef.current = nextAudio;
            nextAudioRef.current = audio; // old audio becomes "next" for reuse
            crossfadeActiveRef.current = false;
            lastCrossfadedTrackIdRef.current = null;
            // Restore volume on the new active audio
            nextAudio.volume = startVolume;
            // Advance queue state
            usePlayerStore.getState().next();
          }
        }, 50);
      });
    }).catch((err) => {
      console.warn('[audio] crossfade failed:', err);
      crossfadeActiveRef.current = false;
      lastCrossfadedTrackIdRef.current = null;
    });
  }, [currentTrack?.id]);

  useEffect(() => {
    function handleSeek(event: Event) {
      const seconds = (event as CustomEvent<number>).detail;
      if (typeof seconds === 'number') seekAudio(seconds);
    }

    window.addEventListener('noctune:seek', handleSeek);
    return () => window.removeEventListener('noctune:seek', handleSeek);
  }, []);

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










