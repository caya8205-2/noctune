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
    final player = PlayerScope.of(context);

    return ScreenFrame(
      eyebrow: 'Library',
      title: 'Saved for later.',
      trailing: IconButton.filled(
        onPressed: _createNewPlaylist,
        style: IconButton.styleFrom(backgroundColor: noctuneGold),
        icon: const Icon(Icons.add_rounded, color: Colors.black),
        tooltip: 'New Playlist',
      ),
      onRefresh: _refresh,
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
                        isPlaying: player.selectedTrack?.id == entry.$2.id,
                        onTap: () => widget.onPlay(entry.$2, data.liked.tracks),
                        onLongPress: () => TrackOptionsSheet.show(
                          context,
                          widget.api,
                          entry.$2,
                          onPlay: widget.onPlay,
                        ),
                      ),
                    ),
              const SizedBox(height: 20),

              // SMART PLAYLISTS SECTION (matching Noctune desktop)
              const SectionHeader('Smart Playlists'),
              if (data.smartPlaylists.isEmpty)
                const AsyncPanel(message: 'Smart playlists will generate as you play music.')
              else
                SizedBox(
                  height: 120,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: data.smartPlaylists.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      final pl = data.smartPlaylists[index];
                      final firstThumb = pl.tracks.isNotEmpty ? pl.tracks.first.thumbnail : '';

                      return GestureDetector(
                        onTap: () => _openPlaylist(pl),
                        child: Container(
                          width: 150,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: noctuneSurfaceRaised,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: noctuneGold.withValues(alpha: 0.3)),
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                noctuneSurfaceRaised,
                                noctuneGold.withValues(alpha: 0.08),
                              ],
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(Icons.auto_awesome_rounded, color: noctuneGold, size: 16),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      pl.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                            fontWeight: FontWeight.bold,
                                          ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  TrackArtwork(url: firstThumb, size: 44),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      '${pl.tracks.length} tracks',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(color: noctuneMuted),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),

              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const SectionHeader('Playlists'),
                  TextButton.icon(
                    onPressed: _createNewPlaylist,
                    icon: const Icon(Icons.add, size: 18, color: noctuneGold),
                    label: const Text('New', style: TextStyle(color: noctuneGold)),
                  ),
                ],
              ),
              if (data.playlists.isEmpty)
                const AsyncPanel(message: 'No custom playlists yet. Tap "New" above to create one.')
              else
                ...data.playlists.map(
                  (playlist) => _PlaylistRow(
                    playlist: playlist,
                    onTap: () => _openPlaylist(playlist),
                    onDelete: () => _deletePlaylist(playlist),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _createNewPlaylist() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: noctuneSurfaceRaised,
        title: const Text('Create New Playlist'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Playlist name',
          ),
          textCapitalization: TextCapitalization.sentences,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isNotEmpty) Navigator.of(ctx).pop(text);
            },
            style: FilledButton.styleFrom(backgroundColor: noctuneGold),
            child: const Text('Create', style: TextStyle(color: Colors.black)),
          ),
        ],
      ),
    );

    if (name == null || name.isEmpty) return;

    try {
      await widget.api.createPlaylist(name);
      _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Playlist "$name" created')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create playlist: $e')),
        );
      }
    }
  }

  Future<void> _deletePlaylist(Playlist playlist) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: noctuneSurfaceRaised,
        title: Text('Delete "${playlist.name}"?'),
        content: const Text('This playlist will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await widget.api.deletePlaylist(playlist.id);
      _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Playlist "${playlist.name}" deleted')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete playlist: $e')),
        );
      }
    }
  }

  Future<_LibraryPayload> _load() async {
    final liked = await widget.api.liked();
    final playlists = await widget.api.playlists();

    final smartPlaylists = <Playlist>[];
    try {
      final historyEntries = await widget.api.history();
      final historyTracks = historyEntries.map((e) => e.track).toList();

      // 1. Most Played
      var mostPlayedTracks = await widget.api.topTracks(limit: 20);
      if (mostPlayedTracks.isEmpty && historyTracks.isNotEmpty) {
        final counts = <String, int>{};
        final trackMap = <String, Track>{};
        for (final entry in historyEntries) {
          counts[entry.track.id] = (counts[entry.track.id] ?? 0) + 1;
          trackMap[entry.track.id] = entry.track;
        }
        final sortedKeys = counts.keys.toList()
          ..sort((a, b) => counts[b]!.compareTo(counts[a]!));
        mostPlayedTracks = sortedKeys.take(20).map((k) => trackMap[k]!).toList();
      }
      if (mostPlayedTracks.isNotEmpty) {
        smartPlaylists.add(
          Playlist(
            id: 'smart:most-played',
            name: 'Most Played',
            tracks: mostPlayedTracks,
          ),
        );
      }

      // 2. Recently Added
      if (historyTracks.isNotEmpty) {
        smartPlaylists.add(
          Playlist(
            id: 'smart:recently-added',
            name: 'Recently Added',
            tracks: historyTracks.take(20).toList(),
          ),
        );
      }

      // 3. Short Tracks (under 180s)
      final shortTracks =
          historyTracks.where((t) => t.duration > 0 && t.duration < 180).toList();
      if (shortTracks.isNotEmpty) {
        smartPlaylists.add(
          Playlist(
            id: 'smart:short-tracks',
            name: 'Short Tracks',
            tracks: shortTracks.take(20).toList(),
          ),
        );
      }

      // 4. Discover Weekly
      try {
        List<Track> recs = const [];
        if (historyTracks.isNotEmpty) {
          final seed = historyTracks.first;
          final exclude = historyTracks.take(5).map((t) => t.id).toList();
          recs = await widget.api.recommend(seed, excludeIds: exclude, limit: 20);
        } else if (liked.tracks.isNotEmpty) {
          final seed = liked.tracks.first;
          recs = await widget.api.recommend(seed, limit: 20);
        }

        if (recs.isEmpty) {
          final homeData = await widget.api.home();
          recs = homeData.newReleases.isNotEmpty
              ? homeData.newReleases
              : (homeData.playlists.isNotEmpty
                  ? homeData.playlists.first.tracks
                  : const []);
        }

        if (recs.isNotEmpty) {
          smartPlaylists.add(
            Playlist(
              id: 'smart:discover-weekly',
              name: 'Discover Weekly',
              tracks: recs,
            ),
          );
        }
      } catch (_) {}
    } catch (_) {}

    return _LibraryPayload(
      liked: liked,
      playlists: playlists,
      smartPlaylists: smartPlaylists,
    );
  }

  void _reload() {
    setState(() {
      _future = _load();
    });
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
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

class _PlaylistRow extends StatelessWidget {
  const _PlaylistRow({
    required this.playlist,
    required this.onTap,
    this.onDelete,
  });

  final Playlist playlist;
  final VoidCallback onTap;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          onLongPress: onDelete,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Theme.of(context).colorScheme.outline),
            ),
            child: Row(
              children: [
                _PlaylistCover(playlist: playlist),
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
                IconButton(
                  icon: const Icon(Icons.more_vert_rounded, color: noctuneMuted),
                  onPressed: onDelete,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlaylistCover extends StatelessWidget {
  const _PlaylistCover({required this.playlist});

  final Playlist playlist;

  @override
  Widget build(BuildContext context) {
    final cover = playlist.coverDataUrl;
    if (cover != null && cover.isNotEmpty) {
      return TrackArtwork(url: cover);
    }
    String? firstTrackCover;
    for (final track in playlist.tracks) {
      if (track.thumbnail.isNotEmpty) {
        firstTrackCover = track.thumbnail;
        break;
      }
    }
    if (firstTrackCover != null) {
      return TrackArtwork(url: firstTrackCover);
    }
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: noctuneGold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Icon(Icons.queue_music_rounded, color: noctuneGold),
    );
  }
}

class _LibraryPayload {
  const _LibraryPayload({
    required this.liked,
    required this.playlists,
    required this.smartPlaylists,
  });

  final Playlist liked;
  final List<Playlist> playlists;
  final List<Playlist> smartPlaylists;
}
