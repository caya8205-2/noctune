export interface KeyboardShortcutDefinition {
  action: string;
  code: string;
  key: string;
  keys: string;
  label: string;
  category?: 'playback' | 'navigation' | 'volume' | 'general';
}

export const keyboardShortcuts: KeyboardShortcutDefinition[] = [
  // ── Playback ──
  { action: 'togglePlay', code: 'Space', key: 'Space', keys: 'Space', label: 'Play or pause the current track', category: 'playback' },
  { action: 'nextTrack', code: 'KeyN', key: 'N', keys: 'N', label: 'Next track', category: 'playback' },
  { action: 'prevTrack', code: 'KeyP', key: 'P', keys: 'P', label: 'Previous track', category: 'playback' },
  { action: 'toggleShuffle', code: 'KeyS', key: 'S', keys: 'S', label: 'Toggle shuffle', category: 'playback' },
  { action: 'cycleRepeat', code: 'KeyR', key: 'R', keys: 'R', label: 'Cycle repeat (off → all → one)', category: 'playback' },
  { action: 'toggleSleepTimer', code: 'KeyT', key: 'T', keys: 'T', label: 'Toggle sleep timer (30 min)', category: 'playback' },
  { action: 'increasePlaybackRate', code: 'BracketRight', key: ']', keys: ']', label: 'Increase playback speed', category: 'playback' },
  { action: 'decreasePlaybackRate', code: 'BracketLeft', key: '[', keys: '[', label: 'Decrease playback speed', category: 'playback' },

  // ── Seek ──
  { action: 'seekBackward', code: 'ArrowLeft', key: 'Left arrow', keys: '←', label: 'Seek backward 5 seconds', category: 'playback' },
  { action: 'seekForward', code: 'ArrowRight', key: 'Right arrow', keys: '→', label: 'Seek forward 5 seconds', category: 'playback' },

  // ── Volume ──
  { action: 'volumeUp', code: 'ArrowUp', key: 'Up arrow', keys: '↑', label: 'Raise volume', category: 'volume' },
  { action: 'volumeDown', code: 'ArrowDown', key: 'Down arrow', keys: '↓', label: 'Lower volume', category: 'volume' },
  { action: 'toggleMute', code: 'KeyM', key: 'M', keys: 'M', label: 'Mute or restore volume', category: 'volume' },

  // ── Navigation ──
  { action: 'toggleSearchHome', code: 'KeyC', key: 'C', keys: 'C', label: 'Toggle Search and Home', category: 'navigation' },
  { action: 'goHome', code: 'KeyL', key: 'L', keys: 'L', label: 'Jump to Home', category: 'navigation' },
  { action: 'goBack', code: 'Escape', key: 'Esc', keys: 'Esc', label: 'Go back / close panels', category: 'navigation' },

  // ── General ──
  { action: 'toggleShortcutsHelp', code: 'Slash', key: '?', keys: '?', label: 'Show keyboard shortcuts', category: 'general' },
];

export function getShortcutsByCategory(): Record<string, KeyboardShortcutDefinition[]> {
  const map: Record<string, KeyboardShortcutDefinition[]> = {};
  for (const s of keyboardShortcuts) {
    const cat = s.category ?? 'general';
    if (!map[cat]) map[cat] = [];
    map[cat].push(s);
  }
  return map;
}
