import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/album/album_view.dart';
import 'package:noctune/src/features/artist/artist_view.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/add_to_playlist_sheet.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';

class TrackOptionsSheet extends StatelessWidget {
  const TrackOptionsSheet({
    required this.api,
    required this.track,
    this.onPlay,
    super.key,
  });

  final NoctuneApi api;
  final Track track;
  final void Function(Track track, List<Track> queue)? onPlay;

  static Future<void> show(
    BuildContext context,
    NoctuneApi api,
    Track track, {
    void Function(Track track, List<Track> queue)? onPlay,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: noctuneSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => TrackOptionsSheet(api: api, track: track, onPlay: onPlay),
    );
  }

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    final isLiked = player.isLiked(track);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        top: 16,
        left: 20,
        right: 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: noctuneMuted.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              TrackArtwork(url: track.thumbnail, size: 52),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      track.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      track.artist,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: noctuneMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.playlist_play, color: noctuneGold),
            title: const Text('Play Next'),
            onTap: () {
              player.playNextInQueue(track);
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Will play next: ${track.title}')),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.queue_music, color: noctuneGold),
            title: const Text('Add to Queue'),
            onTap: () {
              player.addToQueue(track);
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Added to queue: ${track.title}')),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.playlist_add, color: noctuneGold),
            title: const Text('Add to Playlist'),
            onTap: () {
              Navigator.of(context).pop();
              AddToPlaylistSheet.show(context, api, track);
            },
          ),
          ListTile(
            leading: Icon(
              isLiked ? Icons.favorite : Icons.favorite_border,
              color: isLiked ? Colors.redAccent : noctuneGold,
            ),
            title: Text(isLiked ? 'Remove from Liked Songs' : 'Like Song'),
            onTap: () {
              player.toggleLike(track);
              Navigator.of(context).pop();
            },
          ),
          if (track.artistId != null || track.artist.isNotEmpty)
            ListTile(
              leading: const Icon(Icons.person, color: noctuneGold),
              title: const Text('Go to Artist'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => ArtistView(
                      api: api,
                      artistId: track.artistId ?? track.artist,
                      onPlay: onPlay ?? (_, _) {},
                    ),
                  ),
                );
              },
            ),
          if (track.albumId != null || (track.album != null && track.album!.isNotEmpty))
            ListTile(
              leading: const Icon(Icons.album, color: noctuneGold),
              title: const Text('Go to Album'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => AlbumView(
                      api: api,
                      albumId: track.albumId ?? track.album!,
                      onPlay: onPlay ?? (_, _) {},
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}
