import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
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

  @override
  void initState() {
    super.initState();
    _future = widget.api.playlist(widget.playlist.id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.playlist.name)),
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
            if (playlist.tracks.isEmpty) {
              return const Padding(
                padding: EdgeInsets.all(20),
                child: AsyncPanel(message: 'This playlist has no tracks yet.'),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 120),
              itemCount: playlist.tracks.length,
              itemBuilder: (context, index) {
                final track = playlist.tracks[index];
                return TrackTile(
                  index: index,
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
}
