import 'package:flutter/material.dart';

const noctuneGold = Color(0xFFF7B733);
const noctuneBackground = Color(0xFF050608);
const noctuneSurface = Color(0xFF11141A);
const noctuneSurfaceRaised = Color(0xFF171B23);
const noctuneMuted = Color(0xFF8C93A3);

ThemeData buildNoctuneTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: noctuneGold,
    brightness: Brightness.dark,
    surface: noctuneSurface,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: noctuneBackground,
    colorScheme: scheme.copyWith(
      primary: noctuneGold,
      secondary: const Color(0xFF7DD3FC),
      surface: noctuneSurface,
      surfaceContainerHighest: noctuneSurfaceRaised,
      outline: const Color(0xFF282D38),
    ),
    textTheme: const TextTheme(
      headlineLarge: TextStyle(fontWeight: FontWeight.w800, height: 0.98),
      headlineMedium: TextStyle(fontWeight: FontWeight.w800, height: 1.05),
      titleLarge: TextStyle(fontWeight: FontWeight.w800),
      titleMedium: TextStyle(fontWeight: FontWeight.w700),
      bodyMedium: TextStyle(color: Color(0xFFD4D8E2), height: 1.35),
      labelSmall: TextStyle(
        color: noctuneMuted,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.8,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: noctuneBackground.withValues(alpha: 0.96),
      indicatorColor: noctuneGold.withValues(alpha: 0.16),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected) ? Colors.white : noctuneMuted,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    ),
  );
}
