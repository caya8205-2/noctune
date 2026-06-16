import { useEffect } from 'react';
import { keyboardShortcuts, type KeyboardShortcutDefinition } from '../constants/keyboardShortcuts';
import { usePlayerStore } from '../store/player';
import { seekAudio } from './useAudio';

const interactiveTargetSelector = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(', ');

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest(interactiveTargetSelector) !== null;
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const shortcutsByCode = new Map(
      keyboardShortcuts.map((shortcut) => [shortcut.code, shortcut] satisfies [string, KeyboardShortcutDefinition])
    );

    function handleKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || isInteractiveTarget(e.target)) return;

      const shortcut = shortcutsByCode.get(e.code);
      if (!shortcut) return;

      const {
        activeView, currentTrack, volume, duration,
        showShortcutsHelp,
        setView, togglePlay, setVolume,
        toggleMute, toggleShuffle, cycleRepeat, toggleShortcutsHelp,
      } = usePlayerStore.getState();

      switch (shortcut.action) {
        // ── Playback ──
        case 'togglePlay': {
          e.preventDefault();
          if (currentTrack) togglePlay();
          break;
        }
        case 'nextTrack': {
          e.preventDefault();
          usePlayerStore.getState().next();
          break;
        }
        case 'prevTrack': {
          e.preventDefault();
          usePlayerStore.getState().prev();
          break;
        }
        case 'toggleShuffle': {
          e.preventDefault();
          toggleShuffle();
          break;
        }
        case 'cycleRepeat': {
          e.preventDefault();
          cycleRepeat();
          break;
        }

        // ── Seek ──
        case 'seekBackward': {
          e.preventDefault();
          seekAudio(Math.max(0, usePlayerStore.getState().progress - 5));
          break;
        }
        case 'seekForward': {
          e.preventDefault();
          seekAudio(Math.min(duration, usePlayerStore.getState().progress + 5));
          break;
        }

        // ── Volume ──
        case 'volumeUp': {
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.05));
          break;
        }
        case 'volumeDown': {
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.05));
          break;
        }
        case 'toggleMute': {
          if (e.metaKey || e.ctrlKey) break;
          e.preventDefault();
          toggleMute();
          break;
        }

        // ── Navigation ──
        case 'toggleSearchHome': {
          if (e.metaKey || e.ctrlKey) break; // allow browser copy
          e.preventDefault();
          setView(activeView === 'search' ? 'home' : 'search');
          break;
        }
        case 'goHome': {
          if (e.metaKey || e.ctrlKey) break;
          e.preventDefault();
          setView('home');
          break;
        }
        case 'goBack': {
          e.preventDefault();
          // priority: close shortcuts help first, then go home
          if (showShortcutsHelp) {
            toggleShortcutsHelp();
          } else if (activeView !== 'home') {
            setView('home');
          }
          break;
        }

        // ── General ──
        case 'toggleShortcutsHelp': {
          if (!e.shiftKey) break; // only trigger on ? (Shift+/), not plain /
          e.preventDefault();
          toggleShortcutsHelp();
          break;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
