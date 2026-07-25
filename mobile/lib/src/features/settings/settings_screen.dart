import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/history/history_screen.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    required this.api,
    required this.onApiConfigChanged,
    super.key,
  });

  final NoctuneApi api;
  final void Function(String baseUrl, [String apiKey]) onApiConfigChanged;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _controller;
  late final TextEditingController _apiKeyController;
  late Future<bool> _statusFuture;
  late Future<SettingsPayload> _settingsFuture;
  bool _hideApiKey = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.api.baseUrl);
    _apiKeyController = TextEditingController(text: widget.api.apiKey);
    _statusFuture = _checkStatus();
    _settingsFuture = widget.api.settings();
  }

  @override
  void didUpdateWidget(covariant SettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api) {
      _controller.text = widget.api.baseUrl;
      _apiKeyController.text = widget.api.apiKey;
      _statusFuture = _checkStatus();
      _settingsFuture = widget.api.settings();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _apiKeyController.dispose();
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
          // 1. CONNECTION STATUS
          const SectionHeader('Backend Gateway Connection'),
          FutureBuilder<bool>(
            future: _statusFuture,
            builder: (context, snapshot) {
              final isWaiting = snapshot.connectionState != ConnectionState.done;
              final connected = snapshot.data == true;

              return _SettingsCard(
                child: Row(
                  children: [
                    Icon(
                      isWaiting
                          ? Icons.hourglass_top_rounded
                          : (connected ? Icons.check_circle_rounded : Icons.cancel_rounded),
                      color: isWaiting
                          ? noctuneMuted
                          : (connected ? noctuneGold : Colors.redAccent),
                      size: 28,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isWaiting
                                ? 'Checking backend connection...'
                                : (connected
                                    ? 'Desktop Backend Connected (Online)'
                                    : 'Disconnected / Unreachable'),
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: connected ? noctuneGold : Colors.white,
                                ),
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
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded),
                      onPressed: _refreshStatus,
                      tooltip: 'Test Connection',
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 18),

          // 2. CONFIGURATION & PRESETS
          const SectionHeader('Desktop Backend Server'),
          _SettingsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Server URL & Security Key',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  'Connect to your local PC backend or Cloudflare Tunnel.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ActionChip(
                      avatar: const Icon(Icons.cloud_done_rounded, size: 14, color: noctuneGold),
                      label: const Text('noctune.my.id', style: TextStyle(fontSize: 11)),
                      onPressed: () => setState(() => _controller.text = 'https://noctune.my.id'),
                    ),
                    ActionChip(
                      avatar: const Icon(Icons.phonelink_setup_rounded, size: 14),
                      label: const Text('10.0.2.2:3131 (Emulator)', style: TextStyle(fontSize: 11)),
                      onPressed: () => setState(() => _controller.text = 'http://10.0.2.2:3131'),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
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
                const SizedBox(height: 12),
                TextField(
                  controller: _apiKeyController,
                  obscureText: _hideApiKey,
                  decoration: InputDecoration(
                    labelText: 'API Security Key (Optional)',
                    hintText: 'noc_your_api_key',
                    filled: true,
                    fillColor: noctuneSurface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                    suffixIcon: IconButton(
                      icon: Icon(_hideApiKey ? Icons.visibility : Icons.visibility_off),
                      onPressed: () => setState(() => _hideApiKey = !_hideApiKey),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: _reconnect,
                  icon: const Icon(Icons.lan),
                  label: const Text('Save & Connect'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),

          // 3. DESKTOP SETTINGS PORT (Recommendation Engine, Audio Quality, Discord RPC)
          const SectionHeader('Playback & Engine Settings'),
          FutureBuilder<SettingsPayload>(
            future: _settingsFuture,
            builder: (context, snapshot) {
              final settings = snapshot.data;

              return _SettingsCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // A. RECOMMENDATION ENGINE
                    Text('Recommendation Engine', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      'Controls how Autoqueue and Nightly Mixes generate recommendations.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
                    ),
                    const SizedBox(height: 10),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(
                          value: 'hybrid-ml',
                          label: Text('Hybrid ML'),
                          icon: Icon(Icons.psychology_rounded),
                        ),
                        ButtonSegment(
                          value: 'lastfm',
                          label: Text('Last.fm'),
                          icon: Icon(Icons.radio_rounded),
                        ),
                        ButtonSegment(
                          value: 'legacy',
                          label: Text('Legacy'),
                          icon: Icon(Icons.history_toggle_off_rounded),
                        ),
                      ],
                      selected: {settings?.recommendationEngine ?? 'hybrid-ml'},
                      onSelectionChanged: _busy
                          ? null
                          : (value) => _updateSetting(recommendationEngine: value.first),
                    ),
                    const SizedBox(height: 20),

                    // B. AUDIO QUALITY PREFERENCE
                    Text('Audio Quality Preference', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      'Auto selects fast, stable streams. High asks the backend for best available bitrate.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted),
                    ),
                    const SizedBox(height: 10),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(
                          value: 'auto',
                          label: Text('Auto'),
                          icon: Icon(Icons.tune_rounded),
                        ),
                        ButtonSegment(
                          value: 'high',
                          label: Text('High Quality'),
                          icon: Icon(Icons.high_quality_rounded),
                        ),
                      ],
                      selected: {settings?.audioQualityPreference ?? 'auto'},
                      onSelectionChanged: _busy
                          ? null
                          : (value) => _updateSetting(audioQualityPreference: value.first),
                    ),
                    const SizedBox(height: 20),

                    // C. DISCORD RPC TOGGLE
                    Material(
                      color: Colors.transparent,
                      child: SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Discord Rich Presence (RPC)'),
                        subtitle: const Text(
                          'Updates your Discord Activity status via PC backend while playing music.',
                        ),
                        secondary: const Icon(Icons.discord_rounded, color: Color(0xFF5865F2)),
                        value: settings?.discordRpcEnabled ?? true,
                        onChanged: _busy
                            ? null
                            : (val) => _updateSetting(discordRpcEnabled: val),
                      ),
                    ),

                    if (_busy) ...[
                      const SizedBox(height: 12),
                      const LinearProgressIndicator(minHeight: 2),
                    ],
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 18),

          // 4. ACTIVITY & HISTORY
          const SectionHeader('Activity & History'),
          _SettingsCard(
            child: Material(
              color: Colors.transparent,
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.history_rounded, color: noctuneGold),
                title: const Text('Listening History'),
                subtitle: const Text('View recently played tracks on Noctune'),
                trailing: const Icon(Icons.chevron_right_rounded, color: noctuneMuted),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => HistoryScreen(
                        api: widget.api,
                        onPlay: (t, q) => player.play(t, contextQueue: q),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 18),

          // 5. CACHE & MAINTENANCE TOOLS
          const SectionHeader('Cache & Maintenance Tools'),
          _SettingsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Manage backend cache & resolver data.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _clearCache('track metadata', widget.api.clearTrackCache),
                      icon: const Icon(Icons.library_books_rounded, size: 16),
                      label: const Text('Clear Track Cache'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _clearCache('lyrics cache', widget.api.clearLyricsCache),
                      icon: const Icon(Icons.lyrics_rounded, size: 16),
                      label: const Text('Clear Lyrics Cache'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _clearCache('audio files', widget.api.clearAudioFilesCache),
                      icon: const Icon(Icons.folder_delete_rounded, size: 16),
                      label: const Text('Clear Audio Files'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _clearCache('blacklist', widget.api.resetResolverBlacklist),
                      icon: const Icon(Icons.cleaning_services_rounded, size: 16),
                      label: const Text('Reset Blacklist'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),

          // 6. OPEN SOURCE ATTRIBUTION
          const SectionHeader('Open Source Attribution'),
          _SettingsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Noctune is built with modern open-source software.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  'Frontend: React, Vite, Tailwind, Zustand, TanStack Query, Flutter, just_audio, Provider\n'
                  'Backend: Fastify, SQLite, better-sqlite3, youtubei.js, yt-dlp, Kuroshiro\n'
                  'Desktop Shell: Tauri, Rust',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: noctuneMuted, height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),

          // 8. ABOUT & FOOTER (VERSION INFO)
          const SectionHeader('About Noctune Mobile'),
          _SettingsCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Noctune Mobile operates as a seamless remote client connected to your high-performance PC backend. Enjoy your full music library, mixes, and audio engine anywhere.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: noctuneMuted),
                ),
                const SizedBox(height: 16),
                const Divider(height: 1),
                const SizedBox(height: 14),
                Center(
                  child: Column(
                    children: [
                      Text(
                        'Noctune Desktop v3.1.0',
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(color: noctuneGold, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Mobile Client v2.0.0',
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

  Future<void> _updateSetting({
    String? audioQualityPreference,
    String? searchEngine,
    String? recommendationEngine,
    bool? discordRpcEnabled,
  }) async {
    setState(() => _busy = true);
    try {
      final updated = await widget.api.updateSettings(
        audioQualityPreference: audioQualityPreference,
        searchEngine: searchEngine,
        recommendationEngine: recommendationEngine,
        discordRpcEnabled: discordRpcEnabled,
      );
      if (!mounted) return;
      setState(() {
        _settingsFuture = Future.value(updated);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Setting updated successfully.')),
      );
    } on Object catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update setting: $e')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _clearCache(String name, Future<void> Function() action) async {
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cleared $name successfully.')),
      );
    } on Object catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to clear $name: $e')),
      );
    }
  }

  void _reconnect() {
    widget.onApiConfigChanged(
      _controller.text.trim(),
      _apiKeyController.text.trim(),
    );
    setState(() {
      _statusFuture = _checkStatus();
      _settingsFuture = widget.api.settings();
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
