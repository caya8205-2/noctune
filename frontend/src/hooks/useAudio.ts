import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/player';
import { api, apiUrl, IS_TAURI, IS_TAURI_MOBILE, getMobileServerConfig, getSpotifyPlaybackSettingSync } from '../utils/api';
import { createEqualizerNodes } from './useEqualizer';

let activeAudio: HTMLAudioElement | null = null;

function outputVolume(value: number): number {
  return Math.min(1, Math.max(0, Math.pow(value, 1.65)));
}

function getAudioContext(): AudioContext | null {
  return ((window as any).__noctune_audioCtx as AudioContext | undefined) ?? null;
}

export async function resumeAudioContext() {
  const visCtx = getAudioContext();
  if (visCtx && visCtx.state !== 'running') {
    try {
      await visCtx.resume();
    } catch {}
  }
}

if (typeof window !== 'undefined') {
  (window as any).__noctune_resumeAudioCtx = resumeAudioContext;
}

async function playAudio(audio: HTMLAudioElement) {
  const visCtx = getAudioContext();
  if (visCtx && visCtx.state !== 'running') {
    try {
      await visCtx.resume();
    } catch {}
  }
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
  const trackDuration = state.currentTrack?.duration;
  const duration = trackDuration && trackDuration > 0
    ? trackDuration
    : (Number.isFinite(activeAudio.duration) && activeAudio.duration > 0 ? activeAudio.duration : state.duration);
  const target = Math.max(0, Math.min(seconds, duration || seconds));

  try {
    if ('fastSeek' in activeAudio && typeof activeAudio.fastSeek === 'function') {
      activeAudio.fastSeek(target);
    } else {
      activeAudio.currentTime = target;
    }
    state.setProgress(target);
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: state.playbackRate || 1.0,
          position: target,
        });
      } catch {}
    }
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
  const secondaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const skipNextTrackLoadRef = useRef<string | null>(null);
  const preloadedAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const crossfadeActiveRef = useRef(false);
  const lastCrossfadedTrackIdRef = useRef<string | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const checkCrossfadeRef = useRef<(audio: HTMLAudioElement) => void>(() => {});
  const suppressNextErrorRef = useRef(false);
  const recoveryAttemptsRef = useRef<Record<string, number>>({});
  const trackEndedTriggeredRef = useRef(false);
  const handleTrackEndedRef = useRef<() => void>(() => {});
  const pendingInitialSeekRef = useRef<number | null>(null);

  const cancelCrossfade = useCallback(() => {
    if (fadeIntervalRef.current) {
      window.clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    crossfadeActiveRef.current = false;
    skipNextTrackLoadRef.current = null;
    const secondary = secondaryAudioRef.current;
    if (secondary) {
      secondary.pause();
      secondary.removeAttribute('src');
      secondary.load();
    }
    const primary = audioRef.current;
    if (primary) {
      primary.volume = outputVolume(usePlayerStore.getState().volume);
    }
  }, []);

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

  handleTrackEndedRef.current = () => {
    if (trackEndedTriggeredRef.current) return;
    trackEndedTriggeredRef.current = true;
    const state = usePlayerStore.getState();
    if (state.repeat === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        playAudio(audio).catch(() => {});
      }
      setTimeout(() => {
        trackEndedTriggeredRef.current = false;
      }, 1000);
    } else {
      next();
    }
  };

  // Create dual persistent audio elements for gapless and seamless crossfade
  useEffect(() => {
    const audioA = new Audio();
    audioA.id = 'noctune-audio-a';
    audioA.crossOrigin = 'anonymous';
    const audioB = new Audio();
    audioB.id = 'noctune-audio-b';
    audioB.crossOrigin = 'anonymous';

    try {
      const visCtx = new AudioContext();
      const visAnalyser = visCtx.createAnalyser();
      visAnalyser.fftSize = 1024;
      visAnalyser.smoothingTimeConstant = 0.8;

      const srcA = visCtx.createMediaElementSource(audioA);
      srcA.connect(visAnalyser);
      const srcB = visCtx.createMediaElementSource(audioB);
      srcB.connect(visAnalyser);

      createEqualizerNodes(visCtx, visAnalyser);
      (window as any).__noctune_analyser = visAnalyser;
      (window as any).__noctune_audioCtx = visCtx;
      (window as any).__noctune_resumeAudioCtx = resumeAudioContext;
    } catch {}

    const setupAudio = (audio: HTMLAudioElement) => {
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';

      audio.addEventListener('timeupdate', () => {
        if (activeAudio === audio) {
          setProgress(audio.currentTime);
          checkCrossfadeRef.current(audio);
        }
      });

      audio.addEventListener('durationchange', () => {
        if (activeAudio === audio && Number.isFinite(audio.duration) && audio.duration > 0) {
          const currentMetaDuration = usePlayerStore.getState().currentTrack?.duration;
          if (!currentMetaDuration || currentMetaDuration <= 0) {
            setDuration(audio.duration);
          } else if (audio.duration >= currentMetaDuration - 1) {
            setDuration(audio.duration);
          }
        }
      });

      audio.addEventListener('ended', () => {
        if (activeAudio === audio) {
          if (crossfadeActiveRef.current) return;
          handleTrackEndedRef.current();
        }
      });

      audio.addEventListener('playing', () => {
        if (activeAudio === audio) {
          if (audio.currentTime < 2) {
            trackEndedTriggeredRef.current = false;
          }
          setIsPlaying(true);
          setLoading(false);
        }
      });

      audio.addEventListener('waiting', () => {
        if (activeAudio !== audio) return;
        const state = usePlayerStore.getState();
        const trackDuration = state.currentTrack?.duration || state.duration || audio.duration;
        if (
          !trackEndedTriggeredRef.current &&
          Number.isFinite(trackDuration) &&
          trackDuration > 10 &&
          audio.currentTime >= Math.max(0, trackDuration - 4.5)
        ) {
          console.info('[audio] Stream ended near completion (waiting at end-of-track), advancing to next track');
          handleTrackEndedRef.current();
          return;
        }
        setLoading(true);
      });

      audio.addEventListener('seeked', () => {
        if (activeAudio === audio) {
          trackEndedTriggeredRef.current = false;
        }
      });

      audio.addEventListener('canplay', () => {
        if (activeAudio === audio) setLoading(false);
      });

      audio.addEventListener('error', (e) => {
        if (activeAudio !== audio) return;
        const target = e.target as HTMLAudioElement;
        const error = target.error;
        if (
          suppressNextErrorRef.current ||
          !target.currentSrc ||
          error?.code === 1 ||
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
                target.crossOrigin = 'anonymous';
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
    };

    setupAudio(audioA);
    setupAudio(audioB);

    audioRef.current = audioA;
    secondaryAudioRef.current = audioB;
    activeAudio = audioA;

    return () => {
      cancelCrossfade();
      suppressNextErrorRef.current = true;
      for (const el of [audioA, audioB]) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
      audioRef.current = null;
      secondaryAudioRef.current = null;
      activeAudio = null;
    };
  }, [cancelCrossfade]);

  // Swap src when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    trackEndedTriggeredRef.current = false;

    // If crossfade already pre-loaded and transitioned this track, skip reloading
    if (skipNextTrackLoadRef.current === currentTrack.id) {
      skipNextTrackLoadRef.current = null;
      return;
    }

    // Cancel any active crossfade on manual track switch
    if (crossfadeActiveRef.current) {
      cancelCrossfade();
    }

    const isSpotifyDirect = getSpotifyPlaybackSettingSync() === 'spotify-direct';
    if (
      currentTrack.id.startsWith('spotify:') &&
      !currentTrack.youtubeId &&
      !isSpotifyDirect &&
      (currentTrack as any).resolverSource !== 'spotstream' &&
      !(currentTrack as any).audioUrl?.includes('spotify:')
    ) {
      return;
    }

    let cancelled = false;
    const targetId = (currentTrack.youtubeId || currentTrack.id).replace(/^(youtube|ytdlp):/, '').trim();

    // Check if we already have a prebuffered audio element in memory
    const prebufferedAudio = preloadedAudiosRef.current.get(targetId) || preloadedAudiosRef.current.get(currentTrack.id);
    if (prebufferedAudio && prebufferedAudio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      delete recoveryAttemptsRef.current[currentTrack.id];
      if (audio.src !== prebufferedAudio.src) {
        suppressNextErrorRef.current = true;
        audio.crossOrigin = 'anonymous';
        audio.src = prebufferedAudio.src;
      }
      setLoading(false);
      if (pendingInitialSeekRef.current != null) {
        const seekSec = pendingInitialSeekRef.current;
        pendingInitialSeekRef.current = null;
        if (Number.isFinite(seekSec) && seekSec > 0) {
          audio.currentTime = seekSec;
        }
      }
      if (usePlayerStore.getState().isPlaying) {
        if (IS_TAURI_MOBILE) {
          (window as any).__noctune_native_request = { type: 'resume' };
        }
        playAudio(audio).catch(() => {});
      }
      preloadedAudiosRef.current.delete(targetId);
      preloadedAudiosRef.current.delete(currentTrack.id);
      return;
    }

    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    // Exposed so the native media service (and on-device debugging) can read
    // the live element state without holding a JS reference.
    (window as any).__noctune_audio = audio;
    const clearStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };
    audio.addEventListener('loadedmetadata', clearStallTimer, { once: true });
    audio.addEventListener('canplay', clearStallTimer, { once: true });

    apiUrl('/player/stream/' + targetId)
      .then((src) => {
        if (cancelled || !audioRef.current) return;
        delete recoveryAttemptsRef.current[currentTrack.id];
        if (audio.src !== src) {
          suppressNextErrorRef.current = true;
          audio.crossOrigin = 'anonymous';
          audio.src = src;
          audio.load();
        }
        // A stream that returns headers but never sends bytes (wedged upstream
        // daemon) fires no error event, so the spinner would spin forever.
        // Force the normal recovery path when metadata never arrives.
        clearStallTimer();
        stallTimer = setTimeout(() => {
          stallTimer = null;
          if (cancelled || audio.readyState >= HTMLMediaElement.HAVE_METADATA) return;
          console.warn('[audio] stream stalled: no metadata after 12s, forcing recovery', {
            id: currentTrack.id,
            src: audio.currentSrc,
          });
          audio.dispatchEvent(new Event('error'));
        }, 12000);
        waitForAudioReady(audio)
          .then(() => {
            if (cancelled) return;
            setLoading(false);
            if (pendingInitialSeekRef.current != null) {
              const seekSec = pendingInitialSeekRef.current;
              pendingInitialSeekRef.current = null;
              if (Number.isFinite(seekSec) && seekSec > 0) {
                audio.currentTime = seekSec;
              }
            }
            if (usePlayerStore.getState().isPlaying) {
              if (IS_TAURI_MOBILE) {
                (window as any).__noctune_native_request = { type: 'resume' };
              }
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
      clearStallTimer();
    };
  }, [
    currentTrack?.id,
    currentTrack?.youtubeId,
    (currentTrack as any)?.resolverSource,
    (currentTrack as any)?.audioUrl,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prebuffer audio elements in background for next tracks in queue
  useEffect(() => {
    if (!queue || queue.length === 0 || queueIndex < 0) return;
    const upcoming = queue.slice(queueIndex + 1, queueIndex + 4);

    // Clean old prebuffered audios not in upcoming
    const upcomingIds = new Set(
      upcoming
        .map((t) => (t.youtubeId || t.id).replace(/^(youtube|ytdlp):/, '').trim())
        .filter(Boolean)
    );
    for (const [id, el] of preloadedAudiosRef.current.entries()) {
      if (!upcomingIds.has(id)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        preloadedAudiosRef.current.delete(id);
      }
    }

    // Preload next upcoming audio streams into browser media cache.
    // Delay prebuffering by 2s so current track's initial playback buffers smoothly without bandwidth contention.
    const timer = setTimeout(() => {
      for (const track of upcoming) {
        const cleanId = (track.youtubeId || track.id).replace(/^(youtube|ytdlp):/, '').trim();
        if (!cleanId || preloadedAudiosRef.current.has(cleanId)) continue;
        if (track.id.startsWith('spotify:') && !track.youtubeId) continue;

        const preAudio = new Audio();
        preAudio.preload = 'auto';
        preAudio.crossOrigin = 'anonymous';
        apiUrl('/player/stream/' + cleanId)
          .then((src) => {
            preAudio.crossOrigin = 'anonymous';
            preAudio.src = src;
            preAudio.load();
            preloadedAudiosRef.current.set(cleanId, preAudio);
          })
          .catch(() => {});
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [queue, queueIndex, shuffle]);

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      if (!currentTrack || !audio.currentSrc) return;
      playAudio(audio).catch(() => {});
      if (crossfadeActiveRef.current && secondaryAudioRef.current?.currentSrc) {
        playAudio(secondaryAudioRef.current).catch(() => {});
      }
    } else {
      audio.pause();
      if (secondaryAudioRef.current) {
        secondaryAudioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current && !crossfadeActiveRef.current) {
      audioRef.current.volume = outputVolume(volume);
    }
  }, [volume]);

  // Sync playback rate
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    if (secondaryAudioRef.current) secondaryAudioRef.current.playbackRate = playbackRate;
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

  // Crossfade: evaluate during timeupdate near end of track and fade into next track
  useEffect(() => {
    checkCrossfadeRef.current = (audio: HTMLAudioElement) => {
      const state = usePlayerStore.getState();
      const crossfadeDuration = state.crossfadeDuration;
      if (!crossfadeDuration || crossfadeDuration <= 0) return;
      if (crossfadeActiveRef.current) return;

      const track = state.currentTrack;
      if (!track) return;
      if (lastCrossfadedTrackIdRef.current === track.id) return;

      // Guard: Audio must be actively playing, and duration must be finite, valid, and > crossfadeDuration + 2s
      if (!state.isPlaying || !Number.isFinite(audio.duration) || audio.duration <= crossfadeDuration + 2) {
        return;
      }

      const remaining = audio.duration - audio.currentTime;
      // Guard: Remaining must be a valid finite number within the crossfade window
      if (!Number.isFinite(remaining) || remaining > crossfadeDuration || remaining < 0.3) {
        return;
      }

      // Don't crossfade if repeat-one or single-track queue
      if (state.repeat === 'one') return;
      if (state.queue.length <= 1) return;

      // Pick next track index
      let nextIdx: number;
      if (state.shuffle) {
        const rand = Math.floor(Math.random() * (state.queue.length - 1));
        nextIdx = rand >= state.queueIndex ? rand + 1 : rand;
      } else {
        nextIdx = state.queueIndex + 1;
        if (nextIdx >= state.queue.length) {
          if (state.repeat === 'all') nextIdx = 0;
          else return;
        }
      }

      const nextTrack = state.queue[nextIdx];
      if (!nextTrack) return;

      // Spotify Direct single active stream constraint:
      // Spotify accounts permit only one active playback stream per session.
      // Concurrently streaming two Spotify Direct tracks terminates the active session.
      const isCurrentSpotify = track.id.startsWith('spotify:') &&
        ((track as any).resolverSource === 'spotstream' || !(track as any).youtubeId);
      const isNextSpotify = nextTrack.id.startsWith('spotify:') &&
        ((nextTrack as any).resolverSource === 'spotstream' || !nextTrack.youtubeId);
      if (isCurrentSpotify || isNextSpotify) {
        return;
      }

      const nextAudio = secondaryAudioRef.current;
      if (!nextAudio) return;

      lastCrossfadedTrackIdRef.current = track.id;
      crossfadeActiveRef.current = true;

      const crossfadeMs = crossfadeDuration * 1000;
      const startVolume = outputVolume(state.volume);
      nextAudio.crossOrigin = 'anonymous';
      nextAudio.volume = 0;
      nextAudio.playbackRate = state.playbackRate;

      const targetId = (nextTrack.youtubeId || nextTrack.id).replace(/^(youtube|ytdlp):/, '').trim();
      apiUrl('/player/stream/' + targetId)
        .then((src) => {
          if (!crossfadeActiveRef.current || audioRef.current !== audio) return;
          nextAudio.crossOrigin = 'anonymous';
          nextAudio.src = src;
          nextAudio.load();
          return waitForAudioReady(nextAudio);
        })
        .then(() => {
          if (!crossfadeActiveRef.current || audioRef.current !== audio) return;
          return playAudio(nextAudio);
        })
        .then(() => {
          if (!crossfadeActiveRef.current || audioRef.current !== audio) return;

          const fadeStart = Date.now();
          fadeIntervalRef.current = window.setInterval(() => {
            if (!crossfadeActiveRef.current || audioRef.current !== audio) {
              if (fadeIntervalRef.current) {
                window.clearInterval(fadeIntervalRef.current);
                fadeIntervalRef.current = null;
              }
              return;
            }

            const elapsed = Date.now() - fadeStart;
            const t = Math.min(1, elapsed / crossfadeMs);
            const currentGain = Math.cos((t * Math.PI) / 2);
            const nextGain = Math.sin((t * Math.PI) / 2);
            audio.volume = startVolume * currentGain;
            nextAudio.volume = startVolume * nextGain;

            if (t >= 1) {
              if (fadeIntervalRef.current) {
                window.clearInterval(fadeIntervalRef.current);
                fadeIntervalRef.current = null;
              }

              audio.pause();
              audio.removeAttribute('src');
              audio.load();

              // Swap pointers: secondary becomes primary
              activeAudio = nextAudio;
              audioRef.current = nextAudio;
              secondaryAudioRef.current = audio;
              crossfadeActiveRef.current = false;
              lastCrossfadedTrackIdRef.current = null;
              nextAudio.volume = startVolume;

              skipNextTrackLoadRef.current = nextTrack.id;
              usePlayerStore.getState().transitionTrack(nextTrack, nextIdx);
            }
          }, 50);
        })
        .catch((err) => {
          console.warn('[audio] crossfade failed:', err);
          cancelCrossfade();
        });
    };
  }, [cancelCrossfade]);

  useEffect(() => {
    function handleSeek(event: Event) {
      const seconds = (event as CustomEvent<number>).detail;
      if (typeof seconds === 'number') {
        cancelCrossfade();
        seekAudio(seconds);
      }
    }

    window.addEventListener('noctune:seek', handleSeek);
    return () => window.removeEventListener('noctune:seek', handleSeek);
  }, [cancelCrossfade]);

  // Seek (only when progress changes externally — not from timeupdate)
  const seek = useCallback((seconds: number) => {
    seekAudio(seconds);
  }, [setProgress]);

  // Ensure AudioContext is unlocked on user interaction (especially touch on mobile)
  useEffect(() => {
    const handleInteraction = () => {
      resumeAudioContext().catch(() => {});
    };

    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('touchend', handleInteraction, { passive: true });
    window.addEventListener('pointerdown', handleInteraction, { passive: true });
    window.addEventListener('click', handleInteraction, { passive: true });
    window.addEventListener('keydown', handleInteraction, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('touchend', handleInteraction);
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // Screen / Audio WakeLock: Keep screen/CPU awake during active playback
  useEffect(() => {
    let released = false;
    let wakeLockSentinel: any = null;

    async function acquireLock() {
      if (!isPlaying || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
      try {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        if (released && wakeLockSentinel) {
          wakeLockSentinel.release().catch(() => {});
          wakeLockSentinel = null;
        } else if (wakeLockSentinel) {
          wakeLockSentinel.addEventListener(
            'release',
            () => {
              wakeLockSentinel = null;
            },
            { once: true }
          );
        }
      } catch {
        // Ignored: wakeLock may be rejected or unsupported in background/headless
      }
    }

    if (isPlaying) {
      acquireLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying && !wakeLockSentinel) {
        acquireLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
    };
  }, [isPlaying]);

  // Sync Media Session API (system media controls)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    let artworkUrl = currentTrack.thumbnail || '';
    if (
      artworkUrl &&
      !artworkUrl.startsWith('http://') &&
      !artworkUrl.startsWith('https://') &&
      !artworkUrl.startsWith('data:')
    ) {
      try {
        artworkUrl = new URL(artworkUrl, window.location.href).href;
      } catch {}
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.youtubeTitle || currentTrack.artist || 'Noctune',
      artwork: artworkUrl
        ? [
            { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
          ]
        : [],
    });

    const safeSetAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    safeSetAction('play', () => {
      resumeAudioContext().catch(() => {});
      usePlayerStore.getState().setIsPlaying(true);
    });
    safeSetAction('pause', () => {
      usePlayerStore.getState().setIsPlaying(false);
    });
    safeSetAction('previoustrack', () => {
      resumeAudioContext().catch(() => {});
      usePlayerStore.getState().prev();
    });
    safeSetAction('nexttrack', () => {
      resumeAudioContext().catch(() => {});
      usePlayerStore.getState().next();
    });
    safeSetAction('seekforward', () => {
      const s = usePlayerStore.getState();
      seekAudio(Math.min(s.duration, s.progress + 10));
    });
    safeSetAction('seekbackward', () => {
      const s = usePlayerStore.getState();
      seekAudio(Math.max(0, s.progress - 10));
    });
    safeSetAction('seekto', (details) => {
      if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
        seekAudio(details.seekTime);
      }
    });

    return () => {
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekforward',
        'seekbackward',
        'seekto',
      ];
      for (const a of actions) {
        safeSetAction(a, null);
      }
    };
  }, [currentTrack]);

  // Android media service bridge: expose the playback snapshot as plain globals.
  // The native foreground service polls these with evaluateJavascript, which
  // works regardless of when the WebView was created (addJavascriptInterface
  // only reaches documents that load after it is registered).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window as any;

    host.__noctuneIsPlaying = () => usePlayerStore.getState().isPlaying;

    host.__noctuneNowPlaying = () => {
      const state = usePlayerStore.getState();
      const track = state.currentTrack;
      if (!track) return null;
      let artwork = track.thumbnail ?? '';
      if (artwork && !/^(https?:|data:)/.test(artwork)) {
        try {
          artwork = new URL(artwork, window.location.href).href;
        } catch {}
      }
      // The service runs in its own process, so hand it the tracks that are coming
      // up: once the UI process dies, this is the only thing that can keep the
      // queue moving.
      const server = getMobileServerConfig();
      const buildStreamUrl = (id: string) => {
        if (!server) return '';
        const key = server.apiKey ? `?apiKey=${encodeURIComponent(server.apiKey)}` : '';
        return `${server.baseUrl}/player/stream/${encodeURIComponent(id)}${key}`;
      };
      const upcoming = state.queue
        .slice(state.queueIndex + 1, state.queueIndex + 5)
        .map((queued) => ({
          trackId: queued.id,
          url: buildStreamUrl(queued.id),
          title: queued.title,
          artist: queued.artist,
          album: queued.album ?? queued.youtubeTitle ?? 'Noctune',
          artwork: queued.thumbnail ?? '',
        }))
        .filter((entry) => Boolean(entry.url));

      return {
        playing: state.isPlaying,
        trackId: track.id,
        streamUrl: ((host.__noctune_audio as HTMLAudioElement | undefined)?.src || ''),
        title: track.title,
        artist: track.artist,
        album: track.album ?? track.youtubeTitle ?? 'Noctune',
        artwork,
        positionMs: Math.round((state.progress || 0) * 1000),
        durationMs: Math.round((state.duration || track.duration || 0) * 1000),
        upNext: upcoming,
      };
    };

    return () => {
      delete host.__noctuneIsPlaying;
      delete host.__noctuneNowPlaying;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>)?.detail?.action;
      const state = usePlayerStore.getState();
      switch (action) {
        case 'play':
          resumeAudioContext().catch(() => {});
          state.setIsPlaying(true);
          break;
        case 'pause':
          state.setIsPlaying(false);
          break;
        case 'next':
          resumeAudioContext().catch(() => {});
          state.next();
          break;
        case 'prev':
          resumeAudioContext().catch(() => {});
          state.prev();
          break;
        default:
          break;
      }
    };
    window.addEventListener('noctune:native-media-action', handler as EventListener);
    return () => window.removeEventListener('noctune:native-media-action', handler as EventListener);
  }, []);

  // Android background handoff & cold-start state rehydration.
  useEffect(() => {
    if (!IS_TAURI_MOBILE || typeof document === 'undefined') return;

    const host = window as any;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;

    const applyNativePlaybackState = (nativeState: any) => {
      if (!nativeState || (!nativeState.active && !nativeState.playing)) return;

      const state = usePlayerStore.getState();
      const current = state.currentTrack;
      const element = host.__noctune_audio as HTMLAudioElement | undefined;
      const trackId = nativeState.trackId as string | undefined;
      const positionSec = typeof nativeState.positionMs === 'number' && nativeState.positionMs > 0
        ? nativeState.positionMs / 1000
        : 0;

      // Determine if we need to switch or rehydrate currentTrack
      const needsTrackUpdate = !current || (trackId && current.id !== trackId);

      if (needsTrackUpdate) {
        let matchedTrack: any = undefined;
        let matchedIndex = -1;

        if (trackId) {
          matchedIndex = state.queue.findIndex((t) => t.id === trackId);
          if (matchedIndex >= 0) matchedTrack = state.queue[matchedIndex];
        }
        if (!matchedTrack && nativeState.title) {
          matchedIndex = state.queue.findIndex(
            (t) =>
              t.title.toLowerCase() === nativeState.title?.toLowerCase() &&
              (!nativeState.artist || t.artist.toLowerCase() === nativeState.artist?.toLowerCase())
          );
          if (matchedIndex >= 0) matchedTrack = state.queue[matchedIndex];
        }
        if (!matchedTrack && (trackId || nativeState.title)) {
          matchedTrack = {
            id: trackId || 'native-track',
            title: nativeState.title || 'Unknown Title',
            artist: nativeState.artist || 'Unknown Artist',
            album: nativeState.album || '',
            duration: nativeState.durationMs ? nativeState.durationMs / 1000 : 0,
            thumbnail: nativeState.artwork || '',
            audioUrl: nativeState.streamUrl || undefined,
          };
        }

        if (matchedTrack) {
          if (positionSec > 0) {
            pendingInitialSeekRef.current = positionSec;
          }
          usePlayerStore.setState({
            currentTrack: matchedTrack,
            queueIndex: matchedIndex >= 0 ? matchedIndex : (state.queueIndex >= 0 ? state.queueIndex : 0),
            isPlaying: nativeState.playing ?? true,
            progress: positionSec,
            duration: (nativeState.durationMs ? nativeState.durationMs / 1000 : matchedTrack.duration) || 0,
          });
        }
      } else {
        // Same track is already loaded; sync position if element is paused or behind
        if (element && positionSec > 0 && Math.abs(element.currentTime - positionSec) > 1.5) {
          element.currentTime = positionSec;
        }
      }
    };

    const handleNativeStateEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || host.__noctune_native_state;
      applyNativePlaybackState(detail);
    };

    window.addEventListener('noctune:native-state', handleNativeStateEvent);
    if (host.__noctune_native_state) {
      applyNativePlaybackState(host.__noctune_native_state);
    }

    const handleVisibility = () => {
      const state = usePlayerStore.getState();
      const element = host.__noctune_audio as HTMLAudioElement | undefined;

      if (document.visibilityState === 'hidden') {
        if (resumeTimer) {
          clearTimeout(resumeTimer);
          resumeTimer = null;
        }
        if (!state.isPlaying || !element || !element.src) return;
        host.__noctune_native_request = {
          type: 'handoff',
          url: element.src,
          positionMs: Math.round(element.currentTime * 1000),
          trackId: state.currentTrack?.id,
          title: state.currentTrack?.title,
          artist: state.currentTrack?.artist,
          album: state.currentTrack?.album ?? state.currentTrack?.youtubeTitle ?? 'Noctune',
          artwork: state.currentTrack?.thumbnail,
        };
        element.pause();
        return;
      }

      host.__noctune_native_request = { type: 'resume' };
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        resumeTimer = null;
        const nativeState = host.__noctune_native_state;
        applyNativePlaybackState(nativeState);
        const nativePosition = nativeState?.positionMs;
        if (typeof nativePosition === 'number' && nativePosition > 0) {
          if (element && Math.abs(element.currentTime - (nativePosition / 1000)) > 1.2) {
            element.currentTime = nativePosition / 1000;
          }
        }
        if (usePlayerStore.getState().isPlaying && element && element.paused) {
          element.play().catch(() => {});
        }
      }, 150);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('noctune:native-state', handleNativeStateEvent);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (resumeTimer) clearTimeout(resumeTimer);
    };
  }, []);

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

  // Update playback state & timeline position for native OS controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    if ('setPositionState' in navigator.mediaSession && currentTrack) {
      const state = usePlayerStore.getState();
      const trackDuration = currentTrack.duration || state.duration || 0;
      if (trackDuration > 0 && Number.isFinite(state.progress)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: trackDuration,
            playbackRate: state.playbackRate || 1.0,
            position: Math.min(trackDuration, Math.max(0, state.progress)),
          });
        } catch {}
      }
    }
  }, [isPlaying, currentTrack?.id]);

  return { seek };
}
