import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
import 'package:noctune/src/shared/widgets/track_options_sheet.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class PlaylistDetailScreen extends StatefulWidget {
  const PlaylistDetailScreen({
    required this.api,
    required this.playlist,
    required this.onPlay,
    super.key,
  });

  final NoctuneApi api;
  final Playlist playlist;
  final void Function(Track track, List<Track> queue) onPlay;

  @override
  State<PlaylistDetailScreen> createState() => _PlaylistDetailScreenState();
}

enum PlaylistSortOrder { custom, title, artist, duration }

class _PlaylistDetailScreenState extends State<PlaylistDetailScreen> {
  late Future<Playlist> _future;
  late String _title;
  String _searchQuery = '';
  PlaylistSortOrder _sortOrder = PlaylistSortOrder.custom;
  bool _isCaching = false;

  @override
  void initState() {
    super.initState();
    _title = widget.playlist.name;
    if (widget.playlist.tracks.isNotEmpty ||
        widget.playlist.id.startsWith('personal-mix') ||
        widget.playlist.id.startsWith('nightly-mix') ||
        widget.playlist.id.startsWith('smart:')) {
      _future = Future.value(widget.playlist);
    } else {
      _future = widget.api.playlist(widget.playlist.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(_title),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
            tooltip: 'Reload playlist',
          ),
        ],
      ),
      body: SafeArea(
        child: FutureBuilder<Playlist>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.all(20),
                child: AsyncPanel(message: 'Loading playlist...'),
              );
            }
            if (snapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(20),
                child: AsyncPanel(
                  message: 'Could not open this playlist.',
                  actionLabel: 'Try again',
                  onAction: _reload,
                ),
              );
            }

            final playlist = snapshot.requireData;
            var displayedTracks = playlist.tracks.toList();

            // Filter search
            if (_searchQuery.trim().isNotEmpty) {
              final query = _searchQuery.trim().toLowerCase();
              displayedTracks = displayedTracks.where((t) {
                return t.title.toLowerCase().contains(query) ||
                    t.artist.toLowerCase().contains(query);
              }).toList();
            }

            // Sort
            switch (_sortOrder) {
              case PlaylistSortOrder.title:
                displayedTracks.sort((a, b) => a.title.compareTo(b.title));
                break;
              case PlaylistSortOrder.artist:
                displayedTracks.sort((a, b) => a.artist.compareTo(b.artist));
                break;
              case PlaylistSortOrder.duration:
                displayedTracks.sort((a, b) => b.duration.compareTo(a.duration));
                break;
              case PlaylistSortOrder.custom:
                break;
            }

            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 120),
              itemCount: displayedTracks.length + 3,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return _PlaylistHeader(
                    playlist: playlist,
                    onEdit: _canEdit(playlist) ? () => _editPlaylist(playlist) : null,
                    onPlayAll: playlist.tracks.isNotEmpty
                        ? () => widget.onPlay(playlist.tracks.first, playlist.tracks)
                        : null,
                    onCache: playlist.tracks.isNotEmpty && !_isCaching
                        ? () => _cachePlaylist(playlist)
                        : null,
                    isCaching: _isCaching,
                  );
                }
                if (index == 1) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 14, bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            onChanged: (val) => setState(() => _searchQuery = val),
                            decoration: InputDecoration(
                              hintText: 'Search tracks in playlist...',
                              prefixIcon: const Icon(Icons.search, size: 20),
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              filled: true,
                              fillColor: noctuneSurfaceRaised,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide.none,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        PopupMenuButton<PlaylistSortOrder>(
                          icon: const Icon(Icons.sort_rounded, color: noctuneGold),
                          tooltip: 'Sort order',
                          initialValue: _sortOrder,
                          onSelected: (val) => setState(() => _sortOrder = val),
                          itemBuilder: (_) => const [
                            PopupMenuItem(
                              value: PlaylistSortOrder.custom,
                              child: Text('Custom Order'),
                            ),
                            PopupMenuItem(
                              value: PlaylistSortOrder.title,
                              child: Text('Title'),
                            ),
                            PopupMenuItem(
                              value: PlaylistSortOrder.artist,
                              child: Text('Artist'),
                            ),
                            PopupMenuItem(
                              value: PlaylistSortOrder.duration,
                              child: Text('Duration'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }
                if (index == 2) {
                  if (displayedTracks.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.only(top: 14),
                      child: AsyncPanel(message: 'No tracks found.'),
                    );
                  }
                  return Padding(
                    padding: const EdgeInsets.only(top: 10, bottom: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('TRACKS (${displayedTracks.length})'),
                        if (_sortOrder != PlaylistSortOrder.custom)
                          Text(
                            _sortOrder.name.toUpperCase(),
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(color: noctuneGold),
                          ),
                      ],
                    ),
                  );
                }

                final track = displayedTracks[index - 3];
                return TrackTile(
                  index: index - 3,
                  track: track,
                  isPlaying: player.selectedTrack?.id == track.id,
                  onTap: () => widget.onPlay(track, playlist.tracks),
                  onLongPress: () => TrackOptionsSheet.show(
                    context,
                    widget.api,
                    track,
                    onPlay: widget.onPlay,
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _reload() {
    setState(() {
      if (widget.playlist.id.startsWith('smart:')) {
        _future = Future.value(widget.playlist);
      } else if (widget.playlist.id.startsWith('personal-mix') ||
          widget.playlist.id.startsWith('nightly-mix') ||
          widget.playlist.id.startsWith('mix-')) {
        _future = widget.api.nightlyMixes().then((mixes) {
          final found = mixes.firstWhere(
            (m) => m.id == widget.playlist.id,
            orElse: () => NightlyMix(id: widget.playlist.id, name: widget.playlist.name, tracks: widget.playlist.tracks),
          );
          return Playlist(id: found.id, name: found.name, tracks: found.tracks);
        }).catchError((_) => widget.playlist);
      } else {
        _future = widget.api.playlist(widget.playlist.id);
      }
    });
  }

  bool _canEdit(Playlist playlist) => playlist.id != 'system-liked-songs';

  Future<void> _cachePlaylist(Playlist playlist) async {
    setState(() => _isCaching = true);
    try {
      await widget.api.cacheAudioTracks(playlist.tracks);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Caching ${playlist.tracks.length} tracks for offline playback')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cache failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isCaching = false);
    }
  }

  Future<void> _editPlaylist(Playlist playlist) async {
    final updated = await showModalBottomSheet<Playlist>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _PlaylistEditSheet(api: widget.api, playlist: playlist),
    );
    if (updated == null || !mounted) return;
    setState(() {
      _title = updated.name;
      _future = Future.value(updated);
    });
  }
}

class _PlaylistHeader extends StatelessWidget {
  const _PlaylistHeader({
    required this.playlist,
    this.onEdit,
    this.onPlayAll,
    this.onCache,
    this.isCaching = false,
  });

  final Playlist playlist;
  final VoidCallback? onEdit;
  final VoidCallback? onPlayAll;
  final VoidCallback? onCache;
  final bool isCaching;

  @override
  Widget build(BuildContext context) {
    final cover = _playlistCover(playlist);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Column(
        children: [
          Row(
            children: [
              TrackArtwork(url: cover, size: 92),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(playlist.name, style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(
                      '${playlist.tracks.length} tracks',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: noctuneMuted),
                    ),
                    if (onEdit != null) ...[
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: onEdit,
                        style: OutlinedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                        ),
                        icon: const Icon(Icons.edit_rounded, size: 16),
                        label: const Text('Edit playlist'),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: onPlayAll,
                  style: FilledButton.styleFrom(
                    backgroundColor: noctuneGold,
                    foregroundColor: Colors.black,
                  ),
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: const Text('Play All'),
                ),
              ),
              const SizedBox(width: 10),
              OutlinedButton.icon(
                onPressed: onCache,
                icon: isCaching
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.download_rounded, size: 18),
                label: Text(isCaching ? 'Caching...' : 'Cache'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PlaylistEditSheet extends StatefulWidget {
  const _PlaylistEditSheet({required this.api, required this.playlist});

  final NoctuneApi api;
  final Playlist playlist;

  @override
  State<_PlaylistEditSheet> createState() => _PlaylistEditSheetState();
}

class _PlaylistEditSheetState extends State<_PlaylistEditSheet> {
  late final TextEditingController _nameController;
  late final TextEditingController _coverController;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.playlist.name);
    _coverController = TextEditingController(text: widget.playlist.coverDataUrl ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _coverController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          18,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Edit playlist', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _coverController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Cover data URL',
                hintText: 'data:image/png;base64,...',
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: const Icon(Icons.save_rounded),
              label: Text(_saving ? 'Saving...' : 'Save changes'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final playlist = await widget.api.updatePlaylist(
        widget.playlist.id,
        name: _nameController.text.trim(),
        coverDataUrl: _coverController.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(playlist);
    } on Object {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not save playlist.')),
      );
      setState(() => _saving = false);
    }
  }
}

String _playlistCover(Playlist playlist) {
  final cover = playlist.coverDataUrl;
  if (cover != null && cover.isNotEmpty) return cover;
  for (final track in playlist.tracks) {
    if (track.thumbnail.isNotEmpty) return track.thumbnail;
  }
  return '';
}
