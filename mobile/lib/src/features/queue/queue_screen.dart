import 'package:flutter/material.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class QueueScreen extends StatelessWidget {
  const QueueScreen({required this.onPlay, super.key});

  final void Function(Track track, List<Track> queue) onPlay;

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    return ListenableBuilder(
      listenable: player,
      builder: (context, _) {
        final currentTrack = player.selectedTrack;
        final queue = player.queue;

        return ScreenFrame(
          eyebrow: 'Queue',
          title: 'Up next.',
          trailing: queue.isNotEmpty
              ? TextButton.icon(
                  onPressed: player.clearUpcomingQueue,
                  icon: const Icon(Icons.clear_all_rounded, color: Colors.redAccent, size: 20),
                  label: const Text('Clear Queue', style: TextStyle(color: Colors.redAccent)),
                )
              : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (currentTrack != null) ...[
                const SectionHeader('Now Playing'),
                TrackTile(
                  track: currentTrack,
                  isPlaying: true,
                  onTap: () {},
                ),
                const SizedBox(height: 16),
              ],
              if (queue.isEmpty)
                const AsyncPanel(
                  message:
                      'No upcoming tracks in queue. Play a song from Home or Search to seed autoqueue.',
                )
              else ...[
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    SectionHeader('Next Up (${queue.length})'),
                    Text(
                      'Drag handle to reorder',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: noctuneMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ReorderableListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: queue.length,
                  onReorderItem: (oldIndex, newIndex) {
                    player.reorderQueue(oldIndex, oldIndex < newIndex ? newIndex + 1 : newIndex);
                  },
                  itemBuilder: (context, index) {
                    final track = queue[index];
                    return Dismissible(
                      key: ValueKey('queue_${track.id}_$index'),
                      direction: DismissDirection.endToStart,
                      confirmDismiss: (direction) async {
                        return await showDialog<bool>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                backgroundColor: noctuneSurfaceRaised,
                                title: const Text('Remove from Queue?'),
                                content: Text('Do you want to remove "${track.title}" from your upcoming queue?'),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.of(ctx).pop(false),
                                    child: const Text('Cancel'),
                                  ),
                                  FilledButton(
                                    onPressed: () => Navigator.of(ctx).pop(true),
                                    style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
                                    child: const Text('Remove'),
                                  ),
                                ],
                              ),
                            ) ??
                            false;
                      },
                      onDismissed: (_) => player.removeFromQueue(index),
                      background: Container(
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.only(right: 20),
                        color: Colors.redAccent.withValues(alpha: 0.2),
                        child: const Icon(Icons.delete_outline, color: Colors.redAccent),
                      ),
                      child: TrackTile(
                        key: ValueKey('tile_${track.id}_$index'),
                        index: index,
                        track: track,
                        onTap: () => onPlay(track, queue),
                        trailing: const Icon(Icons.drag_handle_rounded, color: noctuneMuted),
                      ),
                    );
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
