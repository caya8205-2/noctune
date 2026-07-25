import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class AddToPlaylistSheet extends StatefulWidget {
  const AddToPlaylistSheet({
    required this.api,
    required this.track,
    super.key,
  });

  final NoctuneApi api;
  final Track track;

  static Future<void> show(BuildContext context, NoctuneApi api, Track track) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: noctuneSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => AddToPlaylistSheet(api: api, track: track),
    );
  }

  @override
  State<AddToPlaylistSheet> createState() => _AddToPlaylistSheetState();
}

class _AddToPlaylistSheetState extends State<AddToPlaylistSheet> {
  late Future<List<Playlist>> _playlistsFuture;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _loadPlaylists();
  }

  void _loadPlaylists() {
    _playlistsFuture = widget.api.playlists();
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

    setState(() => _isSubmitting = true);
    try {
      final newPlaylist = await widget.api.createPlaylist(name);
      await widget.api.addTrackToPlaylist(newPlaylist.id, widget.track);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Added "${widget.track.title}" to "$name"')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create playlist: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _addToPlaylist(Playlist playlist) async {
    setState(() => _isSubmitting = true);
    try {
      await widget.api.addTrackToPlaylist(playlist.id, widget.track);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Added "${widget.track.title}" to "${playlist.name}"'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to add track: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        top: 16,
        left: 20,
        right: 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: noctuneMuted.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Add to Playlist',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            widget.track.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: noctuneMuted),
          ),
          const SizedBox(height: 16),
          ListTile(
            onTap: _isSubmitting ? null : _createNewPlaylist,
            leading: const CircleAvatar(
              backgroundColor: noctuneGold,
              child: Icon(Icons.add, color: Colors.black),
            ),
            title: const Text('New Playlist'),
            subtitle: const Text('Create a new playlist and add this track'),
          ),
          const Divider(),
          Flexible(
            child: FutureBuilder<List<Playlist>>(
              future: _playlistsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: CircularProgressIndicator(),
                    ),
                  );
                }
                final playlists = snapshot.data ?? [];
                if (playlists.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(
                      child: Text('No custom playlists yet'),
                    ),
                  );
                }
                return ListView.builder(
                  shrinkWrap: true,
                  itemCount: playlists.length,
                  itemBuilder: (context, index) {
                    final pl = playlists[index];
                    return ListTile(
                      onTap: _isSubmitting ? null : () => _addToPlaylist(pl),
                      leading: const Icon(Icons.playlist_play, color: noctuneGold),
                      title: Text(pl.name),
                      subtitle: Text('${pl.tracks.length} tracks'),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
