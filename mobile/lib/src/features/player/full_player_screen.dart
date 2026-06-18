import 'dart:async';

import 'package:flutter/material.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';

class FullPlayerScreen extends StatelessWidget {
  const FullPlayerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    return AnimatedBuilder(
      animation: player,
      builder: (context, _) {
        final track = player.selectedTrack;
        return Scaffold(
          backgroundColor: noctuneBackground,
          appBar: AppBar(title: const Text('Now playing')),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 28),
              child: track == null
                  ? const Center(child: Text('Nothing playing.'))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        TrackArtwork(url: track.thumbnail, size: 250),
                        const SizedBox(height: 28),
                        Text(
                          track.title,
                          textAlign: TextAlign.center,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          track.artist,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(color: noctuneMuted),
                        ),
                        const SizedBox(height: 18),
                        _TrackActions(player: player),
                        const SizedBox(height: 22),
                        _ProgressStrip(player: player),
                        const SizedBox(height: 18),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            IconButton(
                              onPressed: () {},
                              icon: const Icon(Icons.shuffle_rounded),
                              color: noctuneMuted,
                              iconSize: 24,
                            ),
                            const SizedBox(width: 2),
                            IconButton(
                              onPressed:
                                  player.canGoPrevious ? player.playPrevious : null,
                              icon: const Icon(Icons.skip_previous_rounded),
                              iconSize: 34,
                            ),
                            const SizedBox(width: 18),
                            IconButton.filled(
                              onPressed: player.isResolving ? null : player.togglePlayback,
                              style: IconButton.styleFrom(
                                backgroundColor: noctuneGold,
                                fixedSize: const Size.square(68),
                              ),
                              icon: Icon(
                                player.isPlaying
                                    ? Icons.pause_rounded
                                    : Icons.play_arrow_rounded,
                                color: Colors.black,
                                size: 38,
                              ),
                            ),
                            const SizedBox(width: 18),
                            IconButton(
                              onPressed: player.canGoNext ? player.playNext : null,
                              icon: const Icon(Icons.skip_next_rounded),
                              iconSize: 34,
                            ),
                            const SizedBox(width: 2),
                            IconButton(
                              onPressed: () {},
                              icon: const Icon(Icons.repeat_rounded),
                              color: noctuneMuted,
                              iconSize: 24,
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        _LyricsPanel(player: player),
                        const SizedBox(height: 16),
                        _TrackDetailsPanel(track: track, player: player),
                      ],
                    ),
            ),
          ),
        );
      },
    );
  }
}

class _TrackActions extends StatelessWidget {
  const _TrackActions({required this.player});

  final PlayerController player;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 8,
      runSpacing: 8,
      children: [
        _ActionChip(
          icon: Icons.queue_music_rounded,
          label: '${player.queue.length} queued',
        ),
        _ActionChip(
          icon: Icons.offline_bolt_rounded,
          label: player.resolvedTrack == null ? 'Resolving' : 'Ready',
        ),
        const _ActionChip(
          icon: Icons.playlist_add_rounded,
          label: 'Add to playlist',
        ),
        const _ActionChip(
          icon: Icons.favorite_border_rounded,
          label: 'Like',
        ),
      ],
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: noctuneGold),
          const SizedBox(width: 6),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    );
  }
}

class _ProgressStrip extends StatelessWidget {
  const _ProgressStrip({required this.player});

  final PlayerController player;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            minHeight: 5,
            value: player.isResolving ? null : player.progress ?? 0,
            backgroundColor: noctuneSurfaceRaised,
            color: noctuneGold,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(_formatDuration(player.position)),
            Text(_formatDuration(player.duration)),
          ].map((text) {
            return DefaultTextStyle.merge(
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: noctuneMuted),
              child: text,
            );
          }).toList(growable: false),
        ),
      ],
    );
  }
}

class _LyricsPanel extends StatefulWidget {
  const _LyricsPanel({required this.player});

  final PlayerController player;

  @override
  State<_LyricsPanel> createState() => _LyricsPanelState();
}

class _LyricsPanelState extends State<_LyricsPanel> {
  final ScrollController _controller = ScrollController();
  Timer? _resumeAutoFollowTimer;
  bool _userIsReading = false;
  int? _lastAutoScrolledIndex;

  @override
  void didUpdateWidget(covariant _LyricsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    _followActiveLine();
  }

  @override
  void dispose() {
    _resumeAutoFollowTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final player = widget.player;
    final lyrics = player.lyrics;
    final activeIndex = player.activeLyricIndex;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.mic_external_on_rounded, color: noctuneGold),
              const SizedBox(width: 8),
              Text('Lyrics', style: Theme.of(context).textTheme.titleMedium),
            ],
          ),
          const SizedBox(height: 14),
          if (player.isLoadingLyrics)
            const LinearProgressIndicator(minHeight: 2)
          else if (lyrics == null)
            Text(
              player.lyricsError == null
                  ? 'Lyrics are not available for this track yet.'
                  : 'Lyrics could not be loaded.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: noctuneMuted),
            )
          else if (lyrics.lines.isNotEmpty)
            SizedBox(
              height: 238,
              child: NotificationListener<UserScrollNotification>(
                onNotification: (_) {
                  _pauseAutoFollow();
                  return false;
                },
                child: ListView.builder(
                  controller: _controller,
                  itemCount: lyrics.lines.length,
                  itemBuilder: (context, index) {
                    final line = lyrics.lines[index];
                    final isActive = index == activeIndex;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: AnimatedDefaultTextStyle(
                        duration: const Duration(milliseconds: 180),
                        style: Theme.of(context).textTheme.bodyMedium!.copyWith(
                              color: isActive ? Colors.white : noctuneMuted,
                              fontSize: isActive ? 18 : 14,
                              fontWeight:
                                  isActive ? FontWeight.w800 : FontWeight.w500,
                              height: 1.28,
                            ),
                        child: Text(
                          _lineText(line),
                          maxLines: isActive ? 3 : 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _pauseAutoFollow() {
    _userIsReading = true;
    _resumeAutoFollowTimer?.cancel();
    _resumeAutoFollowTimer = Timer(const Duration(seconds: 4), () {
      _userIsReading = false;
      _followActiveLine(force: true);
    });
  }

  void _followActiveLine({bool force = false}) {
    if (_userIsReading && !force) return;
    final index = widget.player.activeLyricIndex;
    if (index == null || index == _lastAutoScrolledIndex) return;
    _lastAutoScrolledIndex = index;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_controller.hasClients) return;
      const estimatedLineHeight = 42.0;
      final target = (index * estimatedLineHeight) - 90;
      final clamped = target.clamp(0.0, _controller.position.maxScrollExtent);
      unawaited(
        _controller.animateTo(
          clamped,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
        ),
      );
    });
  }
}

class _TrackDetailsPanel extends StatelessWidget {
  const _TrackDetailsPanel({required this.track, required this.player});

  final Track track;
  final PlayerController player;

  @override
  Widget build(BuildContext context) {
    final resolved = player.resolvedTrack;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.info_outline_rounded, color: noctuneGold),
              const SizedBox(width: 8),
              Text('Track details', style: Theme.of(context).textTheme.titleMedium),
            ],
          ),
          const SizedBox(height: 14),
          _DetailRow(label: 'Artist', value: track.artist),
          _DetailRow(label: 'Album', value: track.album ?? 'Unknown album'),
          _DetailRow(label: 'Duration', value: _formatDuration(player.duration)),
          _DetailRow(
            label: 'Cache',
            value: resolved == null ? 'Resolving' : 'Ready',
          ),
          _DetailRow(
            label: 'Source',
            value: resolved?.source ?? (track.spotifyId == null ? 'YouTube' : 'Spotify'),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 76,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
            ),
          ),
          Expanded(
            child: Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }
}

String _lineText(LyricLine line) {
  final romanized = line.romanizedText;
  if (romanized != null && romanized.isNotEmpty) return romanized;
  return line.text;
}

String _formatDuration(Duration duration) {
  if (duration.inMilliseconds <= 0) return '--:--';
  final minutes = duration.inMinutes;
  final seconds = duration.inSeconds % 60;
  return '$minutes:${seconds.toString().padLeft(2, '0')}';
}
