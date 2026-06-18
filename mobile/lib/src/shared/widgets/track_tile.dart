import 'package:flutter/material.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';

class TrackTile extends StatelessWidget {
  const TrackTile({
    required this.track,
    required this.onTap,
    this.index,
    super.key,
  });

  final Track track;
  final int? index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              SizedBox(
                width: 28,
                child: Text(
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
                      style: textTheme.titleMedium,
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
