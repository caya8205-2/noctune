import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/library/playlist_detail_screen.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
import 'package:noctune/src/shared/widgets/track_options_sheet.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.api,
    required this.onPlay,
    required this.onApiBaseChanged,
    super.key,
  });

  final NoctuneApi api;
  final void Function(Track track, List<Track> queue) onPlay;
  final ValueChanged<String> onApiBaseChanged;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenData {
  const _HomeScreenData({
    required this.homePayload,
    required this.nightlyMixes,
  });

  final HomePayload homePayload;
  final List<NightlyMix> nightlyMixes;
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeScreenData> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadData();
  }

  @override
  void didUpdateWidget(covariant HomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) {
      _future = _loadData();
    }
  }

  Future<_HomeScreenData> _loadData() async {
    final results = await Future.wait([
      widget.api.home(),
      widget.api.nightlyMixes().catchError((_) => <NightlyMix>[]),
    ]);
    return _HomeScreenData(
      homePayload: results[0] as HomePayload,
      nightlyMixes: results[1] as List<NightlyMix>,
    );
  }

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);

    return ScreenFrame(
      eyebrow: 'Noctune mobile',
      title: 'Your night, scored.',
      onRefresh: _refresh,
      child: FutureBuilder<_HomeScreenData>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AsyncPanel(message: 'Loading your Noctune library...');
          }
          if (snapshot.hasError) {
            return _BackendConnectPanel(
              baseUrl: widget.api.baseUrl,
              onRetry: _reload,
              onConnect: widget.onApiBaseChanged,
            );
          }

          final data = snapshot.requireData;
          final homePayload = data.homePayload;
          final nightlyMixes = data.nightlyMixes;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 1. NIGHTLY MIXES (MAIN HIGHLIGHT)
              if (nightlyMixes.isNotEmpty) ...[
                const SectionHeader('Nightly Mixes'),
                SizedBox(
                  height: 190,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: nightlyMixes.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 14),
                    itemBuilder: (context, index) {
                      final mix = nightlyMixes[index];
                      final mixPlaylist = Playlist(
                        id: mix.id,
                        name: mix.name,
                        tracks: mix.tracks,
                      );
                      return _NightlyMixCard(
                        mix: mix,
                        onTap: () => _openPlaylist(mixPlaylist),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 20),
              ],

              // 2. QUICK PLAYLISTS ACCESS
              if (homePayload.playlists.isNotEmpty) ...[
                const SectionHeader('Your Playlists'),
                SizedBox(
                  height: 100,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: homePayload.playlists.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      final pl = homePayload.playlists[index];
                      return _QuickPlaylistCard(
                        playlist: pl,
                        onTap: () => _openPlaylist(pl),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 20),
              ],

              // 3. RECENTLY PLAYED
              if (homePayload.recentTracks.isNotEmpty) ...[
                const SectionHeader('Recently played'),
                ...homePayload.recentTracks.take(6).map(
                      (track) => TrackTile(
                        track: track,
                        isPlaying: player.selectedTrack?.id == track.id,
                        onTap: () => widget.onPlay(track, homePayload.recentTracks),
                        onLongPress: () => TrackOptionsSheet.show(
                          context,
                          widget.api,
                          track,
                          onPlay: widget.onPlay,
                        ),
                      ),
                    ),
                const SizedBox(height: 20),
              ],

              // 4. NEW RELEASES
              if (homePayload.newReleases.isNotEmpty) ...[
                const SectionHeader('New releases'),
                SizedBox(
                  height: 178,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: homePayload.newReleases.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 14),
                    itemBuilder: (context, index) {
                      final track = homePayload.newReleases[index];
                      return _ReleaseCard(
                        track: track,
                        onTap: () => widget.onPlay(track, homePayload.newReleases),
                        onLongPress: () => TrackOptionsSheet.show(
                          context,
                          widget.api,
                          track,
                          onPlay: widget.onPlay,
                        ),
                      );
                    },
                  ),
                ),
              ],

              if (homePayload.recentTracks.isEmpty &&
                  homePayload.newReleases.isEmpty &&
                  nightlyMixes.isEmpty)
                const AsyncPanel(
                  message:
                      'Backend is connected. Play something on desktop or search here to start filling this view.',
                ),
            ],
          );
        },
      ),
    );
  }

  void _reload() {
    setState(() {
      _future = _loadData();
    });
  }

  Future<void> _refresh() async {
    final next = _loadData();
    setState(() {
      _future = next;
    });
    await next;
  }

  void _openPlaylist(Playlist playlist) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PlaylistDetailScreen(
          api: widget.api,
          playlist: playlist,
          onPlay: widget.onPlay,
        ),
      ),
    );
  }
}

class _BackendConnectPanel extends StatefulWidget {
  const _BackendConnectPanel({
    required this.baseUrl,
    required this.onRetry,
    required this.onConnect,
  });

  final String baseUrl;
  final VoidCallback onRetry;
  final ValueChanged<String> onConnect;

  @override
  State<_BackendConnectPanel> createState() => _BackendConnectPanelState();
}

class _BackendConnectPanelState extends State<_BackendConnectPanel> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.baseUrl);
  }

  @override
  void didUpdateWidget(covariant _BackendConnectPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.baseUrl != widget.baseUrl) {
      _controller.text = widget.baseUrl;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Could not reach the desktop backend.',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'For a physical phone, use your PC LAN IPv4. Example: http://192.168.1.7:3131',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.url,
            decoration: InputDecoration(
              labelText: 'Backend URL',
              hintText: 'http://192.168.x.x:3131',
              filled: true,
              fillColor: noctuneSurface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton(
                onPressed: () => widget.onConnect(_controller.text.trim()),
                child: const Text('Connect'),
              ),
              OutlinedButton(
                onPressed: widget.onRetry,
                child: const Text('Try again'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReleaseCard extends StatelessWidget {
  const _ReleaseCard({
    required this.track,
    required this.onTap,
    this.onLongPress,
  });

  final Track track;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 128,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TrackArtwork(url: track.thumbnail, size: 128),
            const SizedBox(height: 10),
            Text(
              track.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 3),
            Text(
              track.artist,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _NightlyMixCard extends StatelessWidget {
  const _NightlyMixCard({required this.mix, required this.onTap});

  final NightlyMix mix;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final firstThumbnail = mix.tracks.isNotEmpty ? mix.tracks.first.thumbnail : '';
    return SizedBox(
      width: 140,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: noctuneSurfaceRaised,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: noctuneGold.withValues(alpha: 0.3)),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                noctuneSurfaceRaised,
                noctuneGold.withValues(alpha: 0.12),
              ],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TrackArtwork(url: firstThumbnail, size: 116),
              const SizedBox(height: 10),
              Text(
                mix.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                '${mix.tracks.length} tracks',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickPlaylistCard extends StatelessWidget {
  const _QuickPlaylistCard({required this.playlist, required this.onTap});

  final Playlist playlist;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final thumbnail = playlist.tracks.isNotEmpty ? playlist.tracks.first.thumbnail : '';
    return SizedBox(
      width: 200,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: noctuneSurfaceRaised,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Theme.of(context).colorScheme.outline),
          ),
          child: Row(
            children: [
              TrackArtwork(url: playlist.coverDataUrl ?? thumbnail, size: 52),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      playlist.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${playlist.tracks.length} tracks',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
