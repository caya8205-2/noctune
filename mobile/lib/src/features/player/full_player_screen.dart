import 'dart:async';

import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/album/album_view.dart';
import 'package:noctune/src/features/artist/artist_view.dart';
import 'package:noctune/src/features/player/equalizer_sheet.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/add_to_playlist_sheet.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';

class FullPlayerScreen extends StatelessWidget {
  const FullPlayerScreen({
    required this.api,
    required this.onPlay,
    super.key,
  });

  final NoctuneApi api;
  final void Function(Track track, List<Track> queue) onPlay;

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    return AnimatedBuilder(
      animation: player,
      builder: (context, _) {
        final track = player.selectedTrack;
        return Scaffold(
          backgroundColor: noctuneBackground,
          appBar: AppBar(
            title: const Text('Now playing'),
            actions: [
              IconButton(
                icon: const Icon(Icons.tune_rounded),
                tooltip: 'Audio controls',
                onPressed: () => AudioOptionsSheet.show(context),
              ),
            ],
          ),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 28),
              child: track == null
                  ? const Center(child: Text('Nothing playing.'))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        TrackArtwork(url: track.thumbnail, size: 250),
                        const SizedBox(height: 24),
                        Text(
                          track.title,
                          textAlign: TextAlign.center,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          track.artist,
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(color: noctuneMuted),
                        ),
                        const SizedBox(height: 6),
                        _buildResolverStatusBadge(context, player),
                        const SizedBox(height: 14),
                        _TrackActions(api: api, player: player, track: track),
                        const SizedBox(height: 20),
                        _ProgressStrip(player: player),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            IconButton(
                              onPressed: player.toggleShuffle,
                              icon: const Icon(Icons.shuffle_rounded),
                              color: player.isShuffleEnabled ? noctuneGold : noctuneMuted,
                              iconSize: 26,
                            ),
                            const SizedBox(width: 6),
                            IconButton(
                              onPressed:
                                  player.canGoPrevious ? player.playPrevious : null,
                              icon: const Icon(Icons.skip_previous_rounded),
                              iconSize: 36,
                            ),
                            const SizedBox(width: 16),
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
                            const SizedBox(width: 16),
                            IconButton(
                              onPressed: player.canGoNext ? player.playNext : null,
                              icon: const Icon(Icons.skip_next_rounded),
                              iconSize: 36,
                            ),
                            const SizedBox(width: 6),
                            IconButton(
                              onPressed: player.cycleRepeat,
                              icon: Icon(
                                player.repeatMode == NoctuneRepeatMode.one
                                    ? Icons.repeat_one_rounded
                                    : Icons.repeat_rounded,
                              ),
                              color: player.repeatMode != NoctuneRepeatMode.off
                                  ? noctuneGold
                                  : noctuneMuted,
                              iconSize: 26,
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        _LyricsPanel(player: player),
                        const SizedBox(height: 16),
                        _TrackDetailsPanel(
                          api: api,
                          track: track,
                          player: player,
                          onPlay: onPlay,
                        ),
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
  const _TrackActions({
    required this.api,
    required this.player,
    required this.track,
  });

  final NoctuneApi api;
  final PlayerController player;
  final Track track;

  @override
  Widget build(BuildContext context) {
    final isLiked = player.isLiked(track);

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
        _ActionChip(
          icon: Icons.playlist_add_rounded,
          label: 'Add to playlist',
          onTap: () => AddToPlaylistSheet.show(context, api, track),
        ),
        _ActionChip(
          icon: isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          label: isLiked ? 'Liked' : 'Like',
          iconColor: isLiked ? Colors.redAccent : noctuneGold,
          onTap: () => player.toggleLike(track),
        ),
      ],
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({
    required this.icon,
    required this.label,
    this.onTap,
    this.iconColor,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: noctuneSurfaceRaised,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Theme.of(context).colorScheme.outline),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: iconColor ?? noctuneGold),
            const SizedBox(width: 6),
            Text(label, style: Theme.of(context).textTheme.labelSmall),
          ],
        ),
      ),
    );
  }
}

class _ProgressStrip extends StatefulWidget {
  const _ProgressStrip({required this.player});

  final PlayerController player;

  @override
  State<_ProgressStrip> createState() => _ProgressStripState();
}

class _ProgressStripState extends State<_ProgressStrip> {
  double? _dragValueMs;

  @override
  Widget build(BuildContext context) {
    final player = widget.player;
    return ValueListenableBuilder<Duration>(
      valueListenable: player.positionNotifier,
      builder: (context, pos, _) {
        final totalMs = player.duration.inMilliseconds.toDouble();
        final currentMs = _dragValueMs ?? pos.inMilliseconds.toDouble().clamp(0.0, totalMs > 0 ? totalMs : 1.0);
        final maxMs = totalMs > 0 ? totalMs : 1.0;

        return Column(
          children: [
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 4,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
                activeTrackColor: noctuneGold,
                inactiveTrackColor: noctuneSurfaceRaised,
                thumbColor: noctuneGold,
              ),
              child: Slider(
                value: currentMs.clamp(0.0, maxMs),
                max: maxMs,
                onChanged: player.isResolving
                    ? null
                    : (val) {
                        setState(() {
                          _dragValueMs = val;
                        });
                      },
                onChangeEnd: player.isResolving
                    ? null
                    : (val) async {
                        await player.seek(Duration(milliseconds: val.toInt()));
                        setState(() {
                          _dragValueMs = null;
                        });
                      },
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _formatDuration(
                      _dragValueMs != null
                          ? Duration(milliseconds: _dragValueMs!.toInt())
                          : pos,
                    ),
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: noctuneMuted),
                  ),
                  Text(
                    _formatDuration(player.duration),
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: noctuneMuted),
                  ),
                ],
              ),
            ),
          ],
        );
      },
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
  void dispose() {
    _resumeAutoFollowTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _LyricsPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.player.selectedTrack?.id != widget.player.selectedTrack?.id ||
        oldWidget.player.lyrics != widget.player.lyrics) {
      _lastAutoScrolledIndex = null;
      _userIsReading = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final player = widget.player;
    final lyrics = player.lyrics;

    return ValueListenableBuilder<Duration>(
      valueListenable: player.positionNotifier,
      builder: (context, position, _) {
        final activeIndex = _calculateActiveIndex(lyrics, position);
        if (activeIndex != null && activeIndex != _lastAutoScrolledIndex) {
          _followActiveLine(activeIndex);
        }

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
                  if (lyrics != null && lyrics.synced) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: noctuneGold.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'SYNCED',
                        style: Theme.of(context)
                            .textTheme
                            .labelSmall
                            ?.copyWith(color: noctuneGold, fontSize: 9, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
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
      },
    );
  }

  int? _calculateActiveIndex(LyricsResult? lyrics, Duration position) {
    if (lyrics == null || lyrics.lines.isEmpty) return null;
    final seconds = position.inMilliseconds / 1000.0;
    if (lyrics.synced) {
      int activeIndex = 0;
      for (var i = 0; i < lyrics.lines.length; i++) {
        final line = lyrics.lines[i];
        if (line.time == null) continue;
        if (line.time! <= seconds + 0.15) {
          activeIndex = i;
        } else {
          break;
        }
      }
      return activeIndex;
    } else {
      final progress = widget.player.progress ?? 0.0;
      if (progress <= 0.0) return 0;
      final idx = (progress * (lyrics.lines.length - 1)).floor();
      return idx.clamp(0, lyrics.lines.length - 1);
    }
  }

  void _pauseAutoFollow() {
    _userIsReading = true;
    _resumeAutoFollowTimer?.cancel();
    _resumeAutoFollowTimer = Timer(const Duration(seconds: 4), () {
      _userIsReading = false;
    });
  }

  void _followActiveLine(int index) {
    _lastAutoScrolledIndex = index;
    if (_userIsReading) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_controller.hasClients) return;
      const estimatedLineHeight = 42.0;
      final target = (index * estimatedLineHeight) - 80;
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

Widget _buildResolverStatusBadge(BuildContext context, PlayerController player) {
  final resolved = player.resolvedTrack;
  String label;
  if (player.isResolving) {
    label = 'Resolving stream...';
  } else if (resolved != null) {
    final src = (resolved.source ?? '').toLowerCase();
    if (src.contains('refreshed')) {
      label = 'Refreshed';
    } else if (src.contains('prefetch')) {
      label = 'Prefetch';
    } else if (src.contains('cache')) {
      label = 'Cache';
    } else {
      label = 'Resolved';
    }
  } else {
    label = 'Resolved';
  }

  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: noctuneSurfaceRaised,
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: noctuneGold.withValues(alpha: 0.4)),
    ),
    child: Text(
      label,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: noctuneGold,
      ),
    ),
  );
}

class _TrackDetailsPanel extends StatelessWidget {
  const _TrackDetailsPanel({
    required this.api,
    required this.track,
    required this.player,
    required this.onPlay,
  });

  final NoctuneApi api;
  final Track track;
  final PlayerController player;
  final void Function(Track track, List<Track> queue) onPlay;

  @override
  Widget build(BuildContext context) {
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TrackArtwork(url: track.thumbnail, size: 76),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.info_outline_rounded, color: noctuneGold, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          'Track details',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      track.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      track.album ?? 'Single / Unknown Album',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(color: noctuneMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: (track.albumId == null && (track.album == null || track.album!.isEmpty))
                      ? null
                      : () {
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => AlbumView(
                                api: api,
                                albumId: track.albumId ?? track.album!,
                                onPlay: onPlay,
                              ),
                            ),
                          );
                        },
                  icon: const Icon(Icons.album_rounded),
                  label: const Text('Album'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: (track.artistId == null && track.artist.isEmpty)
                      ? null
                      : () {
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => ArtistView(
                                api: api,
                                artistId: track.artistId ?? track.artist,
                                onPlay: onPlay,
                              ),
                            ),
                          );
                        },
                  icon: const Icon(Icons.person_rounded),
                  label: const Text('Artist'),
                ),
              ),
            ],
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
