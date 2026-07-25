import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/album/album_view.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
import 'package:noctune/src/shared/widgets/track_options_sheet.dart';
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
    _future = _loadArtist();
  }

  Future<ArtistBrowse> _loadArtist() {
    // Port behavior desktop: fetch murni via endpoint /browse/artist/:id
    return widget.api.artist(widget.artistId);
  }

  void _reload() {
    setState(() {
      _future = _loadArtist();
    });
  }

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Artist'),
      ),
      body: SafeArea(
        child: FutureBuilder<ArtistBrowse>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.all(20),
                child: AsyncPanel(message: 'Loading artist details...'),
              );
            }
            if (snapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(20),
                child: AsyncPanel(
                  message: 'Could not load artist.',
                  actionLabel: 'Try again',
                  onAction: _reload,
                ),
              );
            }

            final artist = snapshot.requireData;

            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 140),
              children: [
                // Header
                Row(
                  children: [
                    TrackArtwork(url: artist.image ?? '', size: 90),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            artist.name,
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                          ),
                          if (artist.genres.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              artist.genres.take(3).join(' • '),
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: noctuneMuted),
                            ),
                          ],
                          if (artist.followers != null) ...[
                            const SizedBox(height: 4),
                            Text(
                              '${artist.followers} followers',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: noctuneGold),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Top Tracks
                if (artist.topTracks.isNotEmpty) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'TOP TRACKS',
                        style: TextStyle(
                          color: noctuneGold,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.1,
                          fontSize: 12,
                        ),
                      ),
                      TextButton.icon(
                        onPressed: () => widget.onPlay(
                          artist.topTracks.first,
                          artist.topTracks,
                        ),
                        icon: const Icon(Icons.play_arrow_rounded, color: noctuneGold),
                        label: const Text('Play All', style: TextStyle(color: noctuneGold)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ...artist.topTracks.indexed.map(
                    (entry) => TrackTile(
                      index: entry.$1,
                      track: entry.$2,
                      isPlaying: player.selectedTrack?.id == entry.$2.id,
                      onTap: () => widget.onPlay(entry.$2, artist.topTracks),
                      onLongPress: () => TrackOptionsSheet.show(
                        context,
                        widget.api,
                        entry.$2,
                        onPlay: widget.onPlay,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],

                // Albums
                if (artist.albums.isNotEmpty) ...[
                  const Text(
                    'ALBUMS & SINGLES',
                    style: TextStyle(
                      color: noctuneGold,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.1,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 170,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: artist.albums.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 14),
                      itemBuilder: (context, index) {
                        final album = artist.albums[index];
                        return GestureDetector(
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => AlbumView(
                                  api: widget.api,
                                  albumId: album.id,
                                  onPlay: widget.onPlay,
                                ),
                              ),
                            );
                          },
                          child: SizedBox(
                            width: 120,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                TrackArtwork(url: album.image ?? '', size: 120),
                                const SizedBox(height: 8),
                                Text(
                                  album.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                                Text(
                                  album.releaseDate?.split('-').first ?? album.type,
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(color: noctuneMuted),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
