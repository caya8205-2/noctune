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
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outline),
        ),
      ),
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
                  TrackArtwork(url: track.thumbnail, size: 46),
                  const SizedBox(width: 12),
                ],
              ),
            ),
            Expanded(
              child: InkWell(
                onTap: onOpen,
                borderRadius: BorderRadius.circular(12),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
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
                      const SizedBox(height: 3),
                      Text(
                        player.isResolving ? 'Loading...' : track.artist,
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
            if (player.isResolving || player.isBuffering)
              const SizedBox.square(
                dimension: 28,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              IconButton.filled(
                onPressed: player.togglePlayback,
                style: IconButton.styleFrom(backgroundColor: noctuneGold),
                icon: Icon(
                  player.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                  color: Colors.black,
                ),
              ),
            IconButton(
              onPressed: onClear,
              icon: const Icon(Icons.close),
            ),
          ],
        ),
      ),
    );
  }
}
