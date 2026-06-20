import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/features/browse/album_view.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class ArtistView extends StatefulWidget {
  const ArtistView({
    required this.api,
    required this.artistId,
    required this.onPlay,
    super.key,
  });

  final NoctuneApi api;
  final String artistId;
  final void Function(Track track, List<Track> queue) onPlay;

  @override
  State<ArtistView> createState() => _ArtistViewState();
}

class _ArtistViewState extends State<ArtistView> {
  late Future<ArtistBrowse> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.artist(widget.artistId);
  }

  @override
  Widget build(BuildContext context) {
    return ScreenFrame(
      eyebrow: 'Artist',
      title: 'Catalog and top tracks.',
      onRefresh: _refresh,
      child: FutureBuilder<ArtistBrowse>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AsyncPanel(message: 'Loading artist...');
          }
          if (snapshot.hasError) {
            return AsyncPanel(
              message: 'Could not open this artist.',
              actionLabel: 'Try again',
              onAction: _reload,
            );
          }

          final artist = snapshot.requireData;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ArtistHero(artist: artist),
              if (artist.topTracks.isNotEmpty) ...[
                const SizedBox(height: 20),
                const SectionHeader('Top tracks'),
                ...artist.topTracks.indexed.map(
                  (entry) => TrackTile(
                    index: entry.$1,
                    track: entry.$2,
                    onTap: () => widget.onPlay(entry.$2, artist.topTracks),
                  ),
                ),
              ],
              if (artist.albums.isNotEmpty) ...[
                const SizedBox(height: 18),
                const SectionHeader('Albums and singles'),
                ...artist.albums.map(
                  (album) => _AlbumRow(
                    album: album,
                    onTap: () => _openAlbum(album.id),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  void _reload() {
    setState(() {
      _future = widget.api.artist(widget.artistId);
    });
  }

  Future<void> _refresh() async {
    final next = widget.api.artist(widget.artistId);
    setState(() => _future = next);
    await next;
  }

  void _openAlbum(String albumId) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AlbumView(
          api: widget.api,
          albumId: albumId,
          onPlay: widget.onPlay,
        ),
      ),
    );
  }
}

class _ArtistHero extends StatelessWidget {
  const _ArtistHero({required this.artist});

  final ArtistBrowse artist;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Row(
        children: [
          TrackArtwork(url: artist.image ?? '', size: 86),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(artist.name, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (artist.followers != null)
                      _MetricChip('${_compactNumber(artist.followers!)} followers'),
                    if (artist.popularity != null)
                      _MetricChip('${artist.popularity} popularity'),
                    ...artist.genres.take(2).map(_MetricChip.new),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AlbumRow extends StatelessWidget {
  const _AlbumRow({required this.album, required this.onTap});

  final AlbumSummary album;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                TrackArtwork(url: album.image ?? '', size: 58),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(album.name, style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text(
                        '${album.type} - ${album.totalTracks} tracks',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: noctuneMuted),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: noctuneMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: noctuneGold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

String _compactNumber(int value) {
  if (value >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}M';
  if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}K';
  return '$value';
}
