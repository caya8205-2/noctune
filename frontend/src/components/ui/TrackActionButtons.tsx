import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Check, FolderPlus, HardDrive, ListPlus, Loader2, Plus } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { api, type Track } from '../../utils/api';
import { usePlayerStore } from '../../store/player';
import { useClearTrackCache } from '../../hooks/useClearTrackCache';
import { LikeButton } from '../player/LikeButton';

const LIKED_PLAYLIST_ID = 'system-liked-songs';
const TOP_CHROME_HEIGHT = 56;
const PLAYER_BAR_HEIGHT = 80;
const DROPDOWN_WIDTH = 224;
const MAX_DROPDOWN_HEIGHT = 288;
const MIN_USABLE_DROPDOWN_HEIGHT = 176;
const VIEWPORT_EDGE_GAP = 12;
const BUTTON_GAP = 8;

interface TrackActionButtonsProps {
  track: Track;
  className?: string;
  buttonClassName?: string;
  iconSize?: number;
  queueSource?: Track['queueSource'];
  showQueue?: boolean;
  showLike?: boolean;
  showPlaylist?: boolean;
  showClearCache?: boolean;
  queueLabel?: string;
  playlistLabel?: string;
  trailingActions?: ReactNode;
}

export function TrackActionButtons({
  track,
  className,
  buttonClassName = 'p-1.5',
  iconSize = 14,
  queueSource,
  showQueue = true,
  showLike = true,
  showPlaylist = true,
  showClearCache = true,
  queueLabel,
  playlistLabel,
  trailingActions,
}: TrackActionButtonsProps) {
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const { requestClearTrackCache, clearTrackCacheModal } = useClearTrackCache();

  return (
    <>
      {clearTrackCacheModal}
      <div className={clsx('flex items-center gap-0', className)}>
        {showQueue && (
          <button
            type="button"
            className={clsx('btn-ghost', buttonClassName)}
            onClick={(event) => {
              event.stopPropagation();
              addToQueue(track, queueSource);
            }}
            title="Add to queue"
          >
            <ListPlus size={iconSize} />
            {queueLabel && <span>{queueLabel}</span>}
          </button>
        )}

        {showLike && <LikeButton track={track} className={buttonClassName} />}

        {showPlaylist && (
          <AddToPlaylistAction
            track={track}
            className={buttonClassName}
            iconSize={iconSize}
            label={playlistLabel}
          />
        )}

        {showClearCache && (
          <button
            type="button"
            className={clsx('btn-ghost', buttonClassName)}
            onClick={(event) => {
              event.stopPropagation();
              requestClearTrackCache(track);
            }}
            title="Clear track cache"
          >
            <HardDrive size={iconSize} />
          </button>
        )}

        {trailingActions}
      </div>
    </>
  );
}

function AddToPlaylistAction({
  track,
  className,
  iconSize = 14,
  label,
}: {
  track: Track;
  className?: string;
  iconSize?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({
    maxHeight: MAX_DROPDOWN_HEIGHT,
  });
  const [addedTo, setAddedTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const addedToResetTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const qc = useQueryClient();

  const { data: playlists } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.getPlaylists,
    staleTime: 10_000,
    enabled: open,
  });

  const userPlaylists = (playlists ?? []).filter((p) => p.id !== LIKED_PLAYLIST_ID);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setNewName('');
      setCreateError(null);
      addedToResetTimerRef.current = setTimeout(() => setAddedTo(null), 300);
      return () => {
        if (addedToResetTimerRef.current) clearTimeout(addedToResetTimerRef.current);
      };
    }
  }, [open]);

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      if (addedToResetTimerRef.current) clearTimeout(addedToResetTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow =
        window.innerHeight -
        PLAYER_BAR_HEIGHT -
        rect.bottom -
        BUTTON_GAP -
        VIEWPORT_EDGE_GAP;
      const spaceAbove =
        rect.top - TOP_CHROME_HEIGHT - BUTTON_GAP - VIEWPORT_EDGE_GAP;
      const shouldOpenUp =
        spaceBelow < MIN_USABLE_DROPDOWN_HEIGHT && spaceAbove > spaceBelow;
      const availableHeight = shouldOpenUp ? spaceAbove : spaceBelow;
      const maxLeft = Math.max(
        VIEWPORT_EDGE_GAP,
        window.innerWidth - DROPDOWN_WIDTH - VIEWPORT_EDGE_GAP
      );
      const left = Math.min(
        Math.max(VIEWPORT_EDGE_GAP, rect.right - DROPDOWN_WIDTH),
        maxLeft
      );

      setDropdownStyle({
        left,
        maxHeight: Math.max(120, Math.min(MAX_DROPDOWN_HEIGHT, availableHeight)),
        ...(shouldOpenUp
          ? { bottom: window.innerHeight - rect.top + BUTTON_GAP }
          : { top: rect.bottom + BUTTON_GAP }),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
  };

  const handleMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => setOpen(false), 300);
  };

  const handleAdd = useCallback(
    async (playlistId: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await api.addTrackToPlaylist(playlistId, track);
        setAddedTo(playlistId);
        qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
        qc.invalidateQueries({ queryKey: ['playlists'] });
        qc.invalidateQueries({ queryKey: ['home'] });
        setTimeout(() => setOpen(false), 600);
      } catch (err) {
        console.error('Add to playlist failed:', err);
      } finally {
        setBusy(false);
      }
    },
    [busy, track, qc]
  );

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = newName.trim();
      if (!name || busy) return;
      setBusy(true);
      setCreateError(null);
      try {
        const playlist = await api.createPlaylist(name);
        await api.addTrackToPlaylist(playlist.id, track);
        setAddedTo(playlist.id);
        qc.invalidateQueries({ queryKey: ['playlists'] });
        qc.invalidateQueries({ queryKey: ['home'] });
        setTimeout(() => setOpen(false), 600);
      } catch (err) {
        setCreateError((err as Error).message);
        setBusy(false);
      }
    },
    [busy, newName, track, qc]
  );

  return (
    <div
      ref={containerRef}
      className={clsx('relative', open && 'z-50')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={clsx('btn-ghost transition-colors', className)}
        title="Add to playlist"
      >
        <FolderPlus size={iconSize} />
        {label && <span>{label}</span>}
      </button>

      {open && (
        <div
          className="fixed z-50 flex w-56 flex-col overflow-hidden rounded-xl border border-base-600 bg-base-900 shadow-2xl shadow-black/50 animate-fade-in"
          style={{ ...dropdownStyle, animationDuration: '120ms' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-base-600/60 px-3 py-2.5">
            <span className="text-xs font-semibold text-white">Add to playlist</span>
            {busy && <Loader2 size={12} className="animate-spin text-accent" />}
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {userPlaylists.length === 0 && !creating && (
              <p className="px-3 py-2 text-xs text-muted">No playlists yet.</p>
            )}
            {userPlaylists.map((playlist) => {
              const isAdded = addedTo === playlist.id;
              return (
                <button
                  key={playlist.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleAdd(playlist.id)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors',
                    isAdded
                      ? 'bg-accent/10 text-accent'
                      : 'text-soft hover:bg-base-800 hover:text-white',
                    'disabled:opacity-50'
                  )}
                >
                  {isAdded ? (
                    <Check size={13} className="flex-shrink-0" />
                  ) : (
                    <FolderPlus size={13} className="flex-shrink-0 text-muted" />
                  )}
                  <span className="truncate">{playlist.name}</span>
                  <span className="ml-auto flex-shrink-0 text-[10px] text-muted">
                    {playlist.trackIds.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-base-600/60">
            {creating ? (
              <form onSubmit={handleCreate} className="flex items-center gap-1.5 px-2.5 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Playlist name"
                  maxLength={100}
                  className="min-w-0 flex-1 rounded-md border border-base-600 bg-base-950 px-2 py-1.5 text-xs text-white placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || busy}
                  className="btn-accent rounded-md px-2 py-1.5 text-xs disabled:opacity-40"
                >
                  <Plus size={12} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-muted transition-colors hover:bg-base-800 hover:text-white"
              >
                <Plus size={13} />
                New playlist
              </button>
            )}
            {createError && (
              <p className="px-3 pb-2 text-[11px] text-red-400">{createError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
