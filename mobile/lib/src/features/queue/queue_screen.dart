import 'package:flutter/material.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class QueueScreen extends StatelessWidget {
  const QueueScreen({required this.onPlay, super.key});

  final void Function(Track track, List<Track> queue) onPlay;

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    return AnimatedBuilder(
      animation: player,
      builder: (context, _) {
        final queue = player.queue;
        return ScreenFrame(
          eyebrow: 'Queue',
          title: 'Up next.',
          child: queue.isEmpty
              ? const AsyncPanel(message: 'Play from Home, Search, or Library to seed the mobile queue.')
              : Column(
                  children: queue.indexed
                      .map(
                        (entry) => TrackTile(
                          index: entry.$1,
                          track: entry.$2,
                          onTap: () => onPlay(entry.$2, queue),
                        ),
                      )
                      .toList(growable: false),
                ),
        );
      },
    );
  }
}
