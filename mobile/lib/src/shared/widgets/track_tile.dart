import 'package:flutter/material.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';

class TrackTile extends StatelessWidget {
  const TrackTile({
    required this.track,
    required this.onTap,
    this.index,
    this.onLongPress,
    this.isPlaying = false,
    this.trailing,
    super.key,
  });

  final Track track;
  final int? index;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final bool isPlaying;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final titleColor = isPlaying ? noctuneGold : Colors.white;

    return Material(
      color: isPlaying ? noctuneSurfaceRaised.withValues(alpha: 0.5) : Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
          child: Row(
            children: [
              SizedBox(
                width: 28,
                child: isPlaying
                    ? const Icon(Icons.volume_up_rounded, color: noctuneGold, size: 18)
                    : Text(
                        index == null ? '' : '${index! + 1}',
                        style: textTheme.bodySmall?.copyWith(color: noctuneMuted),
                      ),
              ),
              TrackArtwork(url: track.thumbnail),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      track.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.titleMedium?.copyWith(
                        color: titleColor,
                        fontWeight: isPlaying ? FontWeight.bold : FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      track.artist,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.bodySmall?.copyWith(color: noctuneMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              if (trailing != null)
                trailing!
              else
                Text(
                  _formatDuration(track.duration),
                  style: textTheme.bodySmall?.copyWith(color: noctuneMuted),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

String _formatDuration(int seconds) {
  if (seconds <= 0) return '--:--';
  final minutes = seconds ~/ 60;
  final remaining = seconds % 60;
  return '$minutes:${remaining.toString().padLeft(2, '0')}';
}
