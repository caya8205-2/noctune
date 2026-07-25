import 'package:flutter/material.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';

class MiniPlayer extends StatelessWidget {
  const MiniPlayer({
    required this.onOpen,
    required this.onClear,
    super.key,
  });

  final VoidCallback onOpen;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    final track = player.selectedTrack;
    if (track == null) return const SizedBox.shrink();

    return Container(
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outline),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Thin progress bar at top of mini player
          ValueListenableBuilder<Duration>(
            valueListenable: player.positionNotifier,
            builder: (context, pos, _) {
              final dur = player.duration;
              final totalMs = dur.inMilliseconds;
              final progress = (totalMs > 0)
                  ? (pos.inMilliseconds / totalMs).clamp(0.0, 1.0)
                  : 0.0;
              return LinearProgressIndicator(
                value: progress,
                minHeight: 2.5,
                backgroundColor: Colors.transparent,
                color: noctuneGold,
              );
            },
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
            child: SafeArea(
              top: false,
              bottom: false,
              child: Row(
                children: [
                  InkWell(
                    onTap: onOpen,
                    borderRadius: BorderRadius.circular(14),
                    child: Row(
                      children: [
                        TrackArtwork(url: track.thumbnail, size: 44),
                        const SizedBox(width: 12),
                      ],
                    ),
                  ),
                  Expanded(
                    child: InkWell(
                      onTap: onOpen,
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              track.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              player.isResolving ? 'Resolving stream...' : track.artist,
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
                    ),
                  ),
                  IconButton(
                    onPressed: () => player.toggleLike(track),
                    icon: Icon(
                      player.isLiked(track)
                          ? Icons.favorite_rounded
                          : Icons.favorite_border_rounded,
                      color: player.isLiked(track) ? Colors.redAccent : noctuneMuted,
                      size: 22,
                    ),
                    visualDensity: VisualDensity.compact,
                  ),
                  if (player.isResolving || player.isBuffering)
                    const SizedBox.square(
                      dimension: 28,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  else
                    IconButton.filled(
                      onPressed: player.togglePlayback,
                      style: IconButton.styleFrom(
                        backgroundColor: noctuneGold,
                        padding: EdgeInsets.zero,
                        fixedSize: const Size.square(38),
                      ),
                      icon: Icon(
                        player.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                        color: Colors.black,
                        size: 22,
                      ),
                    ),
                  IconButton(
                    onPressed: onClear,
                    icon: const Icon(Icons.close, size: 20),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
