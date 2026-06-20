import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
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

class _PlaylistDetailScreenState extends State<PlaylistDetailScreen> {
  late Future<Playlist> _future;
  late String _title;

  @override
  void initState() {
    super.initState();
    _title = widget.playlist.name;
    _future = widget.api.playlist(widget.playlist.id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_title)),
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
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 120),
              itemCount: playlist.tracks.length + 2,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return _PlaylistHeader(
                    playlist: playlist,
                    onEdit: _canEdit(playlist) ? () => _editPlaylist(playlist) : null,
                  );
                }
                if (index == 1) {
                  if (playlist.tracks.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.only(top: 14),
                      child: AsyncPanel(message: 'This playlist has no tracks yet.'),
                    );
                  }
                  return const Padding(
                    padding: EdgeInsets.only(top: 18, bottom: 4),
                    child: Text('TRACKS'),
                  );
                }
                final track = playlist.tracks[index - 2];
                return TrackTile(
                  index: index - 2,
                  track: track,
                  onTap: () => widget.onPlay(track, playlist.tracks),
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
      _future = widget.api.playlist(widget.playlist.id);
    });
  }

  bool _canEdit(Playlist playlist) => playlist.id != 'system-liked-songs';

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
  const _PlaylistHeader({required this.playlist, required this.onEdit});

  final Playlist playlist;
  final VoidCallback? onEdit;

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
      child: Row(
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
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_rounded),
                  label: const Text('Edit playlist'),
                ),
              ],
            ),
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
