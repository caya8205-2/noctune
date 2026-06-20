import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/features/browse/artist_view.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class AlbumView extends StatefulWidget {
  const AlbumView({
    required this.api,
    required this.albumId,
    required this.onPlay,
    super.key,
  });

  final NoctuneApi api;
  final String albumId;
  final void Function(Track track, List<Track> queue) onPlay;

  @override
  State<AlbumView> createState() => _AlbumViewState();
}

class _AlbumViewState extends State<AlbumView> {
  late Future<AlbumBrowse> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.album(widget.albumId);
  }

  @override
  Widget build(BuildContext context) {
    return ScreenFrame(
      eyebrow: 'Album',
      title: 'Tracklist and credits.',
      onRefresh: _refresh,
      child: FutureBuilder<AlbumBrowse>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AsyncPanel(message: 'Loading album...');
          }
          if (snapshot.hasError) {
            return AsyncPanel(
              message: 'Could not open this album.',
              actionLabel: 'Try again',
              onAction: _reload,
            );
          }

          final album = snapshot.requireData;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _AlbumHero(album: album, onArtistTap: _openArtist),
              const SizedBox(height: 20),
              const SectionHeader('Tracks'),
              ...album.tracks.indexed.map(
                (entry) => TrackTile(
                  index: entry.$1,
                  track: entry.$2,
                  onTap: () => widget.onPlay(entry.$2, album.tracks),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _reload() {
    setState(() {
      _future = widget.api.album(widget.albumId);
    });
  }

  Future<void> _refresh() async {
    final next = widget.api.album(widget.albumId);
    setState(() => _future = next);
    await next;
  }

  void _openArtist(String artistId) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ArtistView(
          api: widget.api,
          artistId: artistId,
          onPlay: widget.onPlay,
        ),
      ),
    );
  }
}

class _AlbumHero extends StatelessWidget {
  const _AlbumHero({required this.album, required this.onArtistTap});

  final AlbumBrowse album;
  final ValueChanged<String> onArtistTap;

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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              TrackArtwork(url: album.image ?? '', size: 104),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(album.name, style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(
                      [
                        album.type,
                        if (album.releaseDate != null) album.releaseDate!,
                        '${album.totalTracks} tracks',
                      ].join(' - '),
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
          if (album.artists.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: album.artists.map((artist) {
                return ActionChip(
                  label: Text(artist.name),
                  avatar: const Icon(Icons.person_rounded, size: 16),
                  onPressed: artist.id == null ? null : () => onArtistTap(artist.id!),
                );
              }).toList(growable: false),
            ),
          ],
          if (album.label != null || album.popularity != null) ...[
            const SizedBox(height: 12),
            Text(
              [
                if (album.label != null) album.label!,
                if (album.popularity != null) '${album.popularity} popularity',
              ].join(' - '),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
            ),
          ],
        ],
      ),
    );
  }
}
