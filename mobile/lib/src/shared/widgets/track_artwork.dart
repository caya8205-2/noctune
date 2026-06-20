import 'dart:convert';
import 'dart:typed_data';

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
    final memoryImage = _readDataUrl(url);
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: size,
        height: size,
        color: noctuneSurfaceRaised,
        child: url.isEmpty
            ? Icon(Icons.music_note, color: noctuneGold, size: size * 0.42)
            : memoryImage != null
                ? Image.memory(memoryImage, fit: BoxFit.cover)
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

Uint8List? _readDataUrl(String value) {
  if (!value.startsWith('data:image/')) return null;
  final marker = value.indexOf('base64,');
  if (marker < 0) return null;
  try {
    return base64Decode(value.substring(marker + 'base64,'.length));
  } on FormatException {
    return null;
  }
}
