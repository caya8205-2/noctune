import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';
import 'package:noctune/src/shared/widgets/async_panel.dart';
import 'package:noctune/src/shared/widgets/track_artwork.dart';
import 'package:noctune/src/shared/widgets/track_tile.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.api,
    required this.onPlay,
    required this.onApiBaseChanged,
    super.key,
  });

  final NoctuneApi api;
  final void Function(Track track, List<Track> queue) onPlay;
  final ValueChanged<String> onApiBaseChanged;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<HomePayload> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.home();
  }

  @override
  void didUpdateWidget(covariant HomeScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) {
      _future = widget.api.home();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ScreenFrame(
      eyebrow: 'Noctune mobile',
      title: 'Your night, scored.',
      onRefresh: _refresh,
      child: FutureBuilder<HomePayload>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const AsyncPanel(message: 'Loading your Noctune library...');
          }
          if (snapshot.hasError) {
            return _BackendConnectPanel(
              baseUrl: widget.api.baseUrl,
              onRetry: _reload,
              onConnect: widget.onApiBaseChanged,
            );
          }

          final data = snapshot.requireData;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ConnectionCard(baseUrl: widget.api.baseUrl),
              const SizedBox(height: 22),
              if (data.recentTracks.isNotEmpty) ...[
                const SectionHeader('Recently played'),
                ...data.recentTracks.take(6).map(
                      (track) => TrackTile(
                        track: track,
                        onTap: () => widget.onPlay(track, const []),
                      ),
                    ),
              ],
              if (data.newReleases.isNotEmpty) ...[
                const SizedBox(height: 18),
                const SectionHeader('New releases'),
                SizedBox(
                  height: 178,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: data.newReleases.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 14),
                    itemBuilder: (context, index) {
                      final track = data.newReleases[index];
                      return _ReleaseCard(
                        track: track,
                        onTap: () => widget.onPlay(track, data.newReleases),
                      );
                    },
                  ),
                ),
              ],
              if (data.recentTracks.isEmpty && data.newReleases.isEmpty)
                const AsyncPanel(
                  message: 'Backend is connected. Play something on desktop or search here to start filling this view.',
                ),
            ],
          );
        },
      ),
    );
  }

  void _reload() {
    setState(() {
      _future = widget.api.home();
    });
  }

  Future<void> _refresh() async {
    final next = widget.api.home();
    setState(() {
      _future = next;
    });
    await next;
  }
}

class _BackendConnectPanel extends StatefulWidget {
  const _BackendConnectPanel({
    required this.baseUrl,
    required this.onRetry,
    required this.onConnect,
  });

  final String baseUrl;
  final VoidCallback onRetry;
  final ValueChanged<String> onConnect;

  @override
  State<_BackendConnectPanel> createState() => _BackendConnectPanelState();
}

class _BackendConnectPanelState extends State<_BackendConnectPanel> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.baseUrl);
  }

  @override
  void didUpdateWidget(covariant _BackendConnectPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.baseUrl != widget.baseUrl) {
      _controller.text = widget.baseUrl;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: noctuneSurfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Could not reach the desktop backend.',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'For a physical phone, use your PC LAN IPv4. Example: http://192.168.1.7:3131',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _controller,
            keyboardType: TextInputType.url,
            decoration: InputDecoration(
              labelText: 'Backend URL',
              hintText: 'http://192.168.x.x:3131',
              filled: true,
              fillColor: noctuneSurface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FilledButton(
                onPressed: () => widget.onConnect(_controller.text.trim()),
                child: const Text('Connect'),
              ),
              OutlinedButton(
                onPressed: widget.onRetry,
                child: const Text('Try again'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ConnectionCard extends StatelessWidget {
  const _ConnectionCard({required this.baseUrl});

  final String baseUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: noctuneGold.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: noctuneGold.withValues(alpha: 0.28)),
      ),
      child: Row(
        children: [
          const Icon(Icons.lan, color: noctuneGold),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Desktop backend', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  baseUrl,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReleaseCard extends StatelessWidget {
  const _ReleaseCard({required this.track, required this.onTap});

  final Track track;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 128,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TrackArtwork(url: track.thumbnail, size: 128),
            const SizedBox(height: 10),
            Text(
              track.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 3),
            Text(
              track.artist,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
            ),
          ],
        ),
      ),
    );
  }
}
