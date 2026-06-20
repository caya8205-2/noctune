import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/home/home_screen.dart';
import 'package:noctune/src/features/library/library_screen.dart';
import 'package:noctune/src/features/player/full_player_screen.dart';
import 'package:noctune/src/features/player/mini_player.dart';
import 'package:noctune/src/features/queue/queue_screen.dart';
import 'package:noctune/src/features/search/search_screen.dart';
import 'package:noctune/src/features/settings/settings_screen.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class NoctuneShell extends StatefulWidget {
  const NoctuneShell({
    required this.api,
    required this.onApiBaseChanged,
    super.key,
  });

  final NoctuneApi api;
  final ValueChanged<String> onApiBaseChanged;

  @override
  State<NoctuneShell> createState() => _NoctuneShellState();
}

class _NoctuneShellState extends State<NoctuneShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final player = PlayerScope.of(context);
    final screens = [
      HomeScreen(
        api: widget.api,
        onPlay: _play,
        onApiBaseChanged: widget.onApiBaseChanged,
      ),
      LibraryScreen(
        api: widget.api,
        onPlay: _play,
        onApiBaseChanged: widget.onApiBaseChanged,
      ),
      SearchScreen(api: widget.api, onPlay: _play),
      QueueScreen(onPlay: _play),
      SettingsScreen(
        api: widget.api,
        onApiBaseChanged: widget.onApiBaseChanged,
      ),
    ];

    return AnimatedBuilder(
      animation: player,
      builder: (context, _) {
        return Scaffold(
          body: IndexedStack(
            index: _index,
            children: screens,
          ),
          bottomNavigationBar: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (player.selectedTrack != null)
                MiniPlayer(
                  onOpen: () => _openFullPlayer(context),
                  onClear: player.clear,
                ),
              _NoctuneBottomNav(
                selectedIndex: _index,
                onSelected: (value) => setState(() => _index = value),
              ),
            ],
          ),
        );
      },
    );
  }

  void _play(Track track, List<Track> queue) {
    PlayerScope.of(context).play(track, contextQueue: queue);
  }

  void _openFullPlayer(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => FullPlayerScreen(api: widget.api, onPlay: _play),
      ),
    );
  }
}

class _NoctuneBottomNav extends StatelessWidget {
  const _NoctuneBottomNav({
    required this.selectedIndex,
    required this.onSelected,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        height: 76,
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 8),
        color: noctuneBackground.withValues(alpha: 0.98),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _NavItem(
              icon: Icons.home_outlined,
              selectedIcon: Icons.home,
              label: 'Home',
              selected: selectedIndex == 0,
              onTap: () => onSelected(0),
            ),
            _NavItem(
              icon: Icons.library_music_outlined,
              selectedIcon: Icons.library_music,
              label: 'Library',
              selected: selectedIndex == 1,
              onTap: () => onSelected(1),
            ),
            _SearchNavItem(
              selected: selectedIndex == 2,
              onTap: () => onSelected(2),
            ),
            _NavItem(
              icon: Icons.queue_music_outlined,
              selectedIcon: Icons.queue_music,
              label: 'Queue',
              selected: selectedIndex == 3,
              onTap: () => onSelected(3),
            ),
            _NavItem(
              icon: Icons.settings_outlined,
              selectedIcon: Icons.settings,
              label: 'Settings',
              selected: selectedIndex == 4,
              onTap: () => onSelected(4),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? Colors.white : noctuneMuted;
    return SizedBox(
      width: 56,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(selected ? selectedIcon : icon, color: color, size: 22),
              const SizedBox(height: 5),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: color,
                      letterSpacing: 0,
                      fontSize: 10,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SearchNavItem extends StatelessWidget {
  const _SearchNavItem({required this.selected, required this.onTap});

  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        width: 64,
        height: 54,
        decoration: BoxDecoration(
          color: selected ? noctuneGold : noctuneGold.withValues(alpha: 0.88),
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: noctuneGold.withValues(alpha: 0.24),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Icon(
          selected ? Icons.saved_search : Icons.search,
          color: Colors.black,
          size: 28,
        ),
      ),
    );
  }
}

class ScreenFrame extends StatelessWidget {
  const ScreenFrame({
    required this.eyebrow,
    required this.title,
    required this.child,
    this.trailing,
    this.bottomPadding = 24,
    this.onRefresh,
    super.key,
  });

  final String eyebrow;
  final String title;
  final Widget child;
  final Widget? trailing;
  final double bottomPadding;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scrollView = CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(eyebrow.toUpperCase(), style: textTheme.labelSmall),
                      const SizedBox(height: 10),
                      Text(title, style: textTheme.headlineMedium),
                    ],
                  ),
                ),
                ?trailing,
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(20, 14, 20, bottomPadding),
          sliver: SliverToBoxAdapter(child: child),
        ),
      ],
    );

    return SafeArea(
      child: onRefresh == null
          ? scrollView
          : RefreshIndicator(
              onRefresh: onRefresh!,
              color: noctuneGold,
              child: scrollView,
            ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 8),
      child: Text(
        label.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: noctuneGold),
      ),
    );
  }
}
