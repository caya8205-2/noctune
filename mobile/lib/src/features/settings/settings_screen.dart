import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    required this.api,
    required this.onApiBaseChanged,
    super.key,
  });

  final NoctuneApi api;
  final ValueChanged<String> onApiBaseChanged;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _controller;
  late Future<bool> _statusFuture;
  String _quality = 'high';

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.api.baseUrl);
    _statusFuture = _checkStatus();
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) {
      _controller.text = widget.api.baseUrl;
      _statusFuture = _checkStatus();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    return ScreenFrame(
      eyebrow: 'Settings',
      title: 'Tune the bridge.',
      onRefresh: _refreshStatus,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionHeader('Connection'),
          FutureBuilder<bool>(
            future: _statusFuture,
            builder: (context, snapshot) {
              final connected = snapshot.data == true;
              return _SettingsCard(
                child: Row(
                  children: [
                    Icon(
                      connected ? Icons.check_circle_rounded : Icons.sync_problem_rounded,
                      color: connected ? noctuneGold : noctuneMuted,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            connected ? 'Desktop backend connected' : 'Checking backend',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.api.baseUrl,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: noctuneMuted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 18),
          const SectionHeader('Desktop backend'),
          _SettingsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Use the backend running on your PC.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  'For a real phone, use your PC Wi-Fi IPv4 address. Example: http://192.168.1.7:3131',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _controller,
                  keyboardType: TextInputType.url,
                  decoration: InputDecoration(
                    labelText: 'Backend URL',
                    filled: true,
                    fillColor: noctuneSurface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _reconnect,
                  icon: const Icon(Icons.lan),
                  label: const Text('Reconnect'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const SectionHeader('Playback'),
          _SettingsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Audio quality', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 10),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'high',
                      label: Text('High'),
                      icon: Icon(Icons.high_quality_rounded),
                    ),
                    ButtonSegment(
                      value: 'auto',
                      label: Text('Auto'),
                      icon: Icon(Icons.tune_rounded),
                    ),
                  ],
                  selected: {_quality},
                  onSelectionChanged: (value) {
                    setState(() => _quality = value.first);
                  },
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: player.selectedTrack == null ? null : player.clear,
                  icon: const Icon(Icons.stop_circle_outlined),
                  label: const Text('Clear now playing'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const SectionHeader('About'),
          _SettingsCard(
            child: Text(
              'Noctune Mobile uses your desktop backend for search, playlists, cache, lyrics, and playback matching while the standalone mobile resolver is still on the roadmap.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: noctuneMuted),
            ),
          ),
        ],
      ),
    );
  }

  Future<bool> _checkStatus() async {
    try {
      final status = await widget.api.status();
      return status.ok;
    } on Object {
      return false;
    }
  }

  Future<void> _refreshStatus() async {
    final next = _checkStatus();
    setState(() => _statusFuture = next);
    await next;
  }

  void _reconnect() {
    widget.onApiBaseChanged(_controller.text.trim());
    setState(() {
      _statusFuture = _checkStatus();
    });
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.child});

  final Widget child;

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
      child: child,
    );
  }
}
