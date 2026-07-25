import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_options_sheet.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({
    required this.api,
    required this.onPlay,
    super.key,
  });

  final NoctuneApi api;
  final void Function(Track track, List<Track> queue) onPlay;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<HistoryEntry>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.history();
  }

  void _reload() {
    setState(() {
      _future = widget.api.history();
    });
  }

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Listening History'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _reload,
            tooltip: 'Reload history',
          ),
        ],
      ),
      body: SafeArea(
        child: ListenableBuilder(
          listenable: player,
          builder: (context, _) {
            return FutureBuilder<List<HistoryEntry>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Padding(
                    padding: EdgeInsets.all(20),
                    child: AsyncPanel(message: 'Loading playback history...'),
                  );
                }
                if (snapshot.hasError) {
                  return Padding(
                    padding: const EdgeInsets.all(20),
                    child: AsyncPanel(
                      message: 'Could not load listening history.',
                      actionLabel: 'Try again',
                      onAction: _reload,
                    ),
                  );
                }

                final entries = snapshot.requireData;

                if (entries.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(20),
                    child: AsyncPanel(
                      message: 'No listening history recorded yet.',
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 120),
                  itemCount: entries.length,
                  itemBuilder: (context, index) {
                    final entry = entries[index];
                    final track = entry.track;
                    final dateStr = _formatTimestamp(entry.playedAt);

                    return TrackTile(
                      index: index,
                      track: track,
                      isPlaying: player.selectedTrack?.id == track.id,
                      onTap: () => widget.onPlay(track, [track]),
                      onLongPress: () => TrackOptionsSheet.show(
                        context,
                        widget.api,
                        track,
                        onPlay: widget.onPlay,
                      ),
                      trailing: Text(
                        dateStr,
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: noctuneMuted),
                      ),
                    );
                  },
                );
              },
            );
          },
        ),
      ),
    );
  }

  String _formatTimestamp(int timestamp) {
    if (timestamp <= 0) return '';
    final dt = DateTime.fromMillisecondsSinceEpoch(timestamp);
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return '${dt.day}/${dt.month} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
