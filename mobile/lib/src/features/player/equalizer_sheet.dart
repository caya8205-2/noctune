import 'dart:async';
import 'package:flutter/material.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class AudioOptionsSheet extends StatefulWidget {
  const AudioOptionsSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: noctuneSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const AudioOptionsSheet(),
    );
  }

  @override
  State<AudioOptionsSheet> createState() => _AudioOptionsSheetState();
}

class _AudioOptionsSheetState extends State<AudioOptionsSheet> {
  static Timer? _sleepTimer;
  static int? _sleepMinutesRemaining;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: noctuneMuted.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Audio Controls',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),
          _buildSleepTimerSection(context),
          const Divider(height: 32),
          _buildPlaybackSpeedSection(context),
          const Divider(height: 32),
          _buildEqualizerSection(context),
        ],
      ),
    );
  }

  Widget _buildSleepTimerSection(BuildContext context) {
    final isTimerActive = _sleepTimer != null && _sleepTimer!.isActive;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                const Icon(Icons.timer_outlined, color: noctuneGold),
                const SizedBox(width: 10),
                Text(
                  'Sleep Timer',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            if (isTimerActive)
              Chip(
                label: Text(
                  '${_sleepMinutesRemaining ?? 0}m left',
                  style: const TextStyle(color: Colors.black, fontSize: 12),
                ),
                backgroundColor: noctuneGold,
              ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [15, 30, 45, 60].map((mins) {
            return ChoiceChip(
              label: Text('${mins}m'),
              selected: isTimerActive && _sleepMinutesRemaining == mins,
              onSelected: (_) => _setSleepTimer(context, mins),
              selectedColor: noctuneGold,
              labelStyle: TextStyle(
                color: isTimerActive && _sleepMinutesRemaining == mins
                    ? Colors.black
                    : Colors.white,
              ),
            );
          }).toList()
            ..add(
              ChoiceChip(
                label: const Text('Off'),
                selected: !isTimerActive,
                onSelected: (_) => _cancelSleepTimer(),
                selectedColor: noctuneGold,
                labelStyle: TextStyle(
                  color: !isTimerActive ? Colors.black : Colors.white,
                ),
              ),
            ),
        ),
      ],
    );
  }

  Widget _buildPlaybackSpeedSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.speed_outlined, color: noctuneGold),
            const SizedBox(width: 10),
            Text(
              'Playback Speed',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [0.75, 1.0, 1.25, 1.5, 2.0].map((speed) {
            final isSelected = speed == 1.0;
            return ChoiceChip(
              label: Text('${speed}x'),
              selected: isSelected,
              onSelected: (_) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Playback speed set to ${speed}x')),
                );
              },
              selectedColor: noctuneGold,
              labelStyle: TextStyle(
                color: isSelected ? Colors.black : Colors.white,
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildEqualizerSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.graphic_eq_outlined, color: noctuneGold),
            const SizedBox(width: 10),
            Text(
              'Equalizer Presets',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: ['Flat', 'Bass Boost', 'Treble Boost', 'Vocal'].map((preset) {
            final isSelected = preset == 'Flat';
            return ChoiceChip(
              label: Text(preset),
              selected: isSelected,
              onSelected: (_) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Equalizer preset: $preset')),
                );
              },
              selectedColor: noctuneGold,
              labelStyle: TextStyle(
                color: isSelected ? Colors.black : Colors.white,
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  void _setSleepTimer(BuildContext context, int minutes) {
    _sleepTimer?.cancel();
    setState(() {
      _sleepMinutesRemaining = minutes;
    });

    final player = PlayerScope.of(context);
    _sleepTimer = Timer(Duration(minutes: minutes), () {
      player.togglePlayback();
      _sleepTimer = null;
      _sleepMinutesRemaining = null;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Sleep timer set for $minutes minutes')),
    );
  }

  void _cancelSleepTimer() {
    _sleepTimer?.cancel();
    setState(() {
      _sleepTimer = null;
      _sleepMinutesRemaining = null;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sleep timer turned off')),
    );
  }
}
