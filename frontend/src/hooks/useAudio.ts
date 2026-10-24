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
    const audioB = new Audio();
    audioB.id = 'noctune-audio-b';

    try {
      const visCtx = new AudioContext();
      const visAnalyser = visCtx.createAnalyser();
      visAnalyser.fftSize = 256;
      visAnalyser.smoothingTimeConstant = 0.8;

      const srcA = visCtx.createMediaElementSource(audioA);
      srcA.connect(visAnalyser);
      const srcB = visCtx.createMediaElementSource(audioB);
      srcB.connect(visAnalyser);

      createEqualizerNodes(visCtx, visAnalyser);
      (window as any).__noctune_analyser = visAnalyser;
      (window as any).__noctune_audioCtx = visCtx;
    } catch {}

    const setupAudio = (audio: HTMLAudioElement) => {
      audio.preload = 'auto';

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

    if (
      currentTrack.id.startsWith('spotify:') &&
      !currentTrack.youtubeId &&
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
          suppressNextErrorRef.current = true;
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
        apiUrl('/player/stream/' + cleanId)
          .then((src) => {
            preAudio.crossOrigin = src.startsWith('http') ? 'anonymous' : null;
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
              void usePlayerStore.getState().playTrack(nextTrack, state.queue);
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

    const actions = ['play','pause','previoustrack','nexttrack','seekforward','seekbackward','seekto'] as const;
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
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
        seekAudio(details.seekTime);
      }
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
