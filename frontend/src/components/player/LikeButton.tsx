import { Heart } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { api, type Track } from '../../utils/api';

function possibleTrackIds(track: Track): string[] {
  return [
    track.id,
    track.spotifyId ? `spotify:${track.spotifyId}` : '',
    track.spotifyId ?? '',
    track.youtubeId ?? '',
  ].filter(Boolean);
}

export function LikeButton({
  track,
  className,
}: {
  track: Track;
  className?: string;
}) {
  const qc = useQueryClient();
  const { data: liked } = useQuery({
    queryKey: ['liked'],
    queryFn: api.getLiked,
    staleTime: 10_000,
  });

  const likedIds = liked?.trackIds ?? [];
  const isLiked = possibleTrackIds(track).some((id) => likedIds.includes(id));

  const mut = useMutation({
    mutationFn: () => api.toggleLike(track),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liked'] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      qc.invalidateQueries({ queryKey: ['playlist', 'system-liked-songs'] });
    },
  });

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        mut.mutate();
      }}
      disabled={mut.isPending}
      className={clsx(
        'btn-ghost p-1.5 transition-colors',
        isLiked ? 'text-red-400 hover:text-red-300' : 'text-muted hover:text-white',
        className
      )}
      title={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
    >
      <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
    </button>
  );
}
