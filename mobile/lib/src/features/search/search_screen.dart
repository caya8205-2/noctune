import 'dart:async';

import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_options_sheet.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({
    required this.api,
    required this.onPlay,
    super.key,
  });

  final NoctuneApi api;
  final void Function(Track track, List<Track> queue) onPlay;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  Timer? _debounce;
  List<Track> _tracks = const [];
  bool _loading = false;
  String? _error;
  String _source = 'spotify';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);

    return ScreenFrame(
      eyebrow: 'Search',
      title: 'Find a seed track.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _controller,
            onChanged: _scheduleSearch,
            textInputAction: TextInputAction.search,
            onSubmitted: _searchNow,
            decoration: InputDecoration(
              hintText: 'Song, artist, Spotify URL, YouTube URL',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor: noctuneSurfaceRaised,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: BorderSide(color: Theme.of(context).colorScheme.outline),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: noctuneSurfaceRaised,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Theme.of(context).colorScheme.outline),
            ),
            child: SegmentedButton<String>(
              style: SegmentedButton.styleFrom(
                backgroundColor: Colors.transparent,
                selectedBackgroundColor: noctuneGold,
                foregroundColor: noctuneMuted,
                selectedForegroundColor: Colors.black,
                side: BorderSide.none,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
              segments: const [
                ButtonSegment(
                  value: 'youtube',
                  label: Text('YouTube'),
                  icon: Icon(Icons.smart_display_rounded),
                ),
                ButtonSegment(
                  value: 'spotify',
                  label: Text('Spotify'),
                  icon: Icon(Icons.album_rounded),
                ),
              ],
              selected: {_source},
              showSelectedIcon: false,
              onSelectionChanged: (value) {
                setState(() => _source = value.first);
                unawaited(_searchNow(_controller.text));
              },
            ),
          ),
          const SizedBox(height: 18),
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          if (_error != null) ...[
            AsyncPanel(message: _error!),
          ] else if (_tracks.isEmpty) ...[
            const AsyncPanel(message: 'Choose Spotify for metadata-rich results or YouTube for direct video search.'),
          ] else ...[
            SectionHeader('${_tracks.length} results'),
            ..._tracks.indexed.map(
              (entry) => TrackTile(
                index: entry.$1,
                track: entry.$2,
                isPlaying: player.selectedTrack?.id == entry.$2.id,
                onTap: () => widget.onPlay(entry.$2, _tracks),
                onLongPress: () => TrackOptionsSheet.show(
                  context,
                  widget.api,
                  entry.$2,
                  onPlay: widget.onPlay,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _scheduleSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 360), () => _searchNow(value));
  }

  Future<void> _searchNow(String value) async {
    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        _tracks = const [];
        _error = null;
        _loading = false;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final tracks = await widget.api.search(query, source: _source);
      if (!mounted) return;
      setState(() {
        _tracks = tracks;
        _loading = false;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }
}
