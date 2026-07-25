import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/artist/artist_view.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
import 'package:noctune/src/shared/widgets/track_options_sheet.dart';
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
    _future = _loadAlbum();
  }

  Future<AlbumBrowse> _loadAlbum() {
    // Port behavior desktop: fetch murni via endpoint /browse/album/:id
    return widget.api.album(widget.albumId);
  }

  void _reload() {
    setState(() {
      _future = _loadAlbum();
    });
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

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Album'),
      ),
      body: SafeArea(
        child: FutureBuilder<AlbumBrowse>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.all(20),
                child: AsyncPanel(message: 'Loading album details...'),
              );
            }
            if (snapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(20),
                child: AsyncPanel(
                  message: 'Could not load album.',
                  actionLabel: 'Try again',
                  onAction: _reload,
                ),
              );
            }

            final album = snapshot.requireData;

            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 140),
              children: [
                // Header
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TrackArtwork(url: album.image ?? '', size: 100),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            album.name,
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                          const SizedBox(height: 6),
                          // Artists clickable
                          if (album.artists.isNotEmpty)
                            Wrap(
                              spacing: 6,
                              children: album.artists.map((artist) {
                                final hasId = artist.id != null && artist.id!.isNotEmpty;
                                return InkWell(
                                  onTap: hasId ? () => _openArtist(artist.id!) : null,
                                  borderRadius: BorderRadius.circular(4),
                                  child: Text(
                                    artist.name,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium
                                        ?.copyWith(
                                          color: hasId ? noctuneGold : Colors.white70,
                                          decoration: hasId ? TextDecoration.underline : null,
                                        ),
                                  ),
                                );
                              }).toList(),
                            )
                          else
                            Text(
                              'Various Artists',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(color: noctuneMuted),
                            ),
                          const SizedBox(height: 6),
                          Text(
                            '${album.type.toUpperCase()} • ${album.totalTracks} tracks${album.releaseDate != null ? ' • ${album.releaseDate}' : ''}',
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: noctuneMuted),
                          ),
                          if (album.label != null && album.label!.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              album.label!,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: noctuneMuted.withValues(alpha: 0.7)),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Play All Button
                FilledButton.icon(
                  onPressed: album.tracks.isEmpty
                      ? null
                      : () => widget.onPlay(album.tracks.first, album.tracks),
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: const Text('Play Album'),
                ),
                const SizedBox(height: 20),

                // Track List
                ...album.tracks.indexed.map(
                  (entry) => TrackTile(
                    index: entry.$1,
                    track: entry.$2,
                    isPlaying: player.selectedTrack?.id == entry.$2.id,
                    onTap: () => widget.onPlay(entry.$2, album.tracks),
                    onLongPress: () => TrackOptionsSheet.show(
                      context,
                      widget.api,
                      entry.$2,
                      onPlay: widget.onPlay,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

