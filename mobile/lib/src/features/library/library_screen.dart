import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/features/library/playlist_detail_screen.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({
    required this.api,
    required this.onPlay,
    required this.onApiBaseChanged,
    super.key,
  });

  final NoctuneApi api;
  final void Function(Track track, List<Track> queue) onPlay;
  final ValueChanged<String> onApiBaseChanged;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  late Future<_LibraryPayload> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  @override
  void didUpdateWidget(covariant LibraryScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) {
      _future = _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ScreenFrame(
      eyebrow: 'Library',
      title: 'Saved for later.',
      trailing: IconButton.filledTonal(
        onPressed: _reload,
        icon: const Icon(Icons.refresh),
      ),
      child: FutureBuilder<_LibraryPayload>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AsyncPanel(message: 'Loading playlists and liked songs...');
          }
          if (snapshot.hasError) {
            return AsyncPanel(
              message: 'Library failed to load from ${widget.api.baseUrl}.',
              actionLabel: 'Try again',
              onAction: _reload,
            );
          }

          final data = snapshot.requireData;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionHeader('Liked songs'),
              if (data.liked.tracks.isEmpty)
                const AsyncPanel(message: 'No liked songs yet.')
              else
                ...data.liked.tracks.take(8).indexed.map(
                      (entry) => TrackTile(
                        index: entry.$1,
                        track: entry.$2,
                        onTap: () => widget.onPlay(entry.$2, data.liked.tracks),
                      ),
                    ),
              const SizedBox(height: 20),
              const SectionHeader('Playlists'),
              if (data.playlists.isEmpty)
                const AsyncPanel(message: 'Playlists created on desktop will appear here.')
              else
                ...data.playlists.map(
                  (playlist) => _PlaylistRow(
                    playlist: playlist,
                    onTap: () => _openPlaylist(playlist),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Future<_LibraryPayload> _load() async {
    final liked = await widget.api.liked();
    final playlists = await widget.api.playlists();
    return _LibraryPayload(liked: liked, playlists: playlists);
  }

  void _reload() {
    setState(() {
      _future = _load();
    });
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

class _PlaylistRow extends StatelessWidget {
  const _PlaylistRow({required this.playlist, required this.onTap});

  final Playlist playlist;
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
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Theme.of(context).colorScheme.outline),
            ),
            child: Row(
              children: [
                const Icon(Icons.queue_music, color: noctuneGold),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(playlist.name, style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 3),
                      Text(
                        '${playlist.tracks.length} tracks',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: noctuneMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LibraryPayload {
  const _LibraryPayload({required this.liked, required this.playlists});

  final Playlist liked;
  final List<Playlist> playlists;
}
