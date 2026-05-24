import { useEffect } from 'react';
import { usePlayerStore } from '../store/player';
import { seekAudio } from './useAudio';

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const {
        activeView, currentTrack, volume, duration,
        setView, togglePlay, setVolume,
      } = usePlayerStore.getState();

      switch (e.code) {
        case 'Space': {
          e.preventDefault();
          if (currentTrack) togglePlay();
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          seekAudio(Math.max(0, usePlayerStore.getState().progress - 5));
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          seekAudio(Math.min(duration, usePlayerStore.getState().progress + 5));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.05));
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.05));
          break;
        }
        case 'KeyC': {
          if (e.metaKey || e.ctrlKey) break; // allow browser copy
          e.preventDefault();
          setView(activeView === 'search' ? 'home' : 'search');
          break;
        }
        case 'KeyL': {
          if (e.metaKey || e.ctrlKey) break;
          e.preventDefault();
          setView('home');
          break;
        }
        case 'KeyM': {
          if (e.metaKey || e.ctrlKey) break;
          e.preventDefault();
          usePlayerStore.getState().setVolume(volume > 0 ? 0 : 0.8);
          break;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
