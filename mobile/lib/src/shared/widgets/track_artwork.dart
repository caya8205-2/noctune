import 'package:flutter/material.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class TrackArtwork extends StatelessWidget {
  const TrackArtwork({
    required this.url,
    this.size = 56,
    super.key,
  });

  final String url;
  final double size;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: size,
        height: size,
        color: noctuneSurfaceRaised,
        child: url.isEmpty
            ? Icon(Icons.music_note, color: noctuneGold, size: size * 0.42)
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    Icon(Icons.music_note, color: noctuneGold, size: size * 0.42),
              ),
      ),
    );
  }
}
