import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/player';

let activeAudio: HTMLAudioElement | null = null;

export function seekAudio(seconds: number) {
  if (!activeAudio) return;
  activeAudio.currentTime = seconds;
  usePlayerStore.getState().setProgress(seconds);
}

/**
 * Manages the actual HTMLAudioElement lifecycle.
 * Must be rendered once at the root level.
 */
export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    audio.preload = 'auto';
    audioRef.current = audio;
    activeAudio = audio;

    audio.addEventListener('timeupdate', () => setProgress(audio.currentTime));
    audio.addEventListener('durationchange', () => setDuration(audio.duration));
    audio.addEventListener('ended', () => {
      if (usePlayerStore.getState().repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        next();
      }
    });
    audio.addEventListener('playing', () => { setIsPlaying(true); setLoading(false); });
    audio.addEventListener('waiting', () => setLoading(true));
    audio.addEventListener('canplay', () => setLoading(false));
    audio.addEventListener('error', (e) => {
      console.error('[audio] error', e);
      setLoading(false);
      setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = '';
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
      : currentTrack.audioUrl;

    if (audio.src !== src) {
      audio.src = src;
      audio.load();
    }
    if (isPlaying) {
      audio.play().catch(err => console.warn('[audio] play blocked:', err));
    }
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Seek (only when progress changes externally — not from timeupdate)
  const seek = useCallback((seconds: number) => {
    seekAudio(seconds);
  }, [setProgress]);

  return { seek };
}
