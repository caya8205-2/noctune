import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:just_audio/just_audio.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';

class PlayerController extends ChangeNotifier {
  PlayerController({required this.api}) {
    _playbackSubscription = _audioPlayer.playerStateStream.listen((state) {
      _isPlaying = state.playing;
      _processingState = state.processingState;
      if (state.processingState == ProcessingState.completed) {
        unawaited(playNext());
      }
      notifyListeners();
    });
    _positionSubscription = _audioPlayer.positionStream.listen((position) {
      _position = position;
      notifyListeners();
    });
    _durationSubscription = _audioPlayer.durationStream.listen((duration) {
      _duration = duration;
      notifyListeners();
    });
  }

  final NoctuneApi api;
  final AudioPlayer _audioPlayer = AudioPlayer();
  StreamSubscription<PlayerState>? _playbackSubscription;
  StreamSubscription<Duration>? _positionSubscription;
  StreamSubscription<Duration?>? _durationSubscription;

  Track? _selectedTrack;
  CachedTrack? _resolvedTrack;
  LyricsResult? _lyrics;
  bool _isResolving = false;
  bool _isLoadingLyrics = false;
  bool _isPlaying = false;
  ProcessingState _processingState = ProcessingState.idle;
  Duration _position = Duration.zero;
  Duration? _duration;
  String? _errorMessage;
  String? _lyricsError;
  final List<Track> _queue = [];
  final List<Track> _history = [];

  Track? get selectedTrack => _resolvedTrack ?? _selectedTrack;
  CachedTrack? get resolvedTrack => _resolvedTrack;
  LyricsResult? get lyrics => _lyrics;
  bool get isResolving => _isResolving;
  bool get isLoadingLyrics => _isLoadingLyrics;
  bool get isPlaying => _isPlaying;
  bool get isBuffering =>
      _processingState == ProcessingState.loading ||
      _processingState == ProcessingState.buffering;
  String? get errorMessage => _errorMessage;
  String? get lyricsError => _lyricsError;
  Duration get position => _position;
  Duration get duration =>
      _duration ??
      Duration(seconds: selectedTrack == null ? 0 : selectedTrack!.duration);
  bool get canGoNext => _queue.isNotEmpty;
  bool get canGoPrevious => _history.isNotEmpty || _position.inSeconds > 3;
  List<Track> get queue => List.unmodifiable(_queue);
  String? get streamUrl =>
      _resolvedTrack == null ? null : api.streamUrl(_resolvedTrack!.id);
  double? get progress {
    final totalMs = duration.inMilliseconds;
    if (totalMs <= 0) return null;
    return (_position.inMilliseconds / totalMs).clamp(0, 1).toDouble();
  }

  LyricLine? get activeLyric {
    final index = activeLyricIndex;
    final result = _lyrics;
    if (index == null || result == null) return null;
    return result.lines[index];
  }

  int? get activeLyricIndex {
    final result = _lyrics;
    if (result == null || result.lines.isEmpty) return null;
    var activeIndex = 0;
    final seconds = _position.inMilliseconds / 1000;
    for (var index = 0; index < result.lines.length; index += 1) {
      final line = result.lines[index];
      final time = line.time;
      if (time == null) continue;
      if (time <= seconds + 0.15) {
        activeIndex = index;
      } else {
        break;
      }
    }
    return activeIndex;
  }

  Future<void> play(
    Track track, {
    List<Track> contextQueue = const [],
    bool recordHistory = true,
  }) async {
    final previous = selectedTrack;
    if (recordHistory && previous != null && previous.id != track.id) {
      _history.add(previous);
    }
    _selectedTrack = track;
    _resolvedTrack = null;
    _lyrics = null;
    _lyricsError = null;
    _errorMessage = null;
    _isResolving = true;
    _position = Duration.zero;
    _duration = track.duration > 0 ? Duration(seconds: track.duration) : null;
    _replaceQueueFromContext(track, contextQueue);
    notifyListeners();
    unawaited(_loadLyrics(track));

    try {
      _resolvedTrack = await api.resolve(track);
      await _audioPlayer.setUrl(api.streamUrl(_resolvedTrack!.id));
      unawaited(_startPlayback());
      if (_queue.isEmpty) {
        unawaited(_seedRecommendations(_resolvedTrack ?? track));
      }
    } on Object catch (error) {
      _errorMessage = error.toString();
    } finally {
      _isResolving = false;
      notifyListeners();
    }
  }

  Future<void> togglePlayback() async {
    if (_isResolving) return;
    if (_resolvedTrack == null && _selectedTrack != null) {
      await play(_selectedTrack!, contextQueue: _queue);
      return;
    }
    if (_isPlaying) {
      await _audioPlayer.pause();
      return;
    }
    unawaited(_startPlayback());
  }

  Future<void> playNext() async {
    if (_queue.isEmpty) return;
    final next = _queue.removeAt(0);
    await play(next, contextQueue: _queue);
  }

  Future<void> playPrevious() async {
    if (_position.inSeconds > 3) {
      await _audioPlayer.seek(Duration.zero);
      return;
    }
    if (_history.isEmpty) return;
    final previous = _history.removeLast();
    final current = selectedTrack;
    if (current != null) {
      _queue.insert(0, current);
    }
    await play(previous, contextQueue: [previous, ..._queue], recordHistory: false);
  }

  void clear() {
    _audioPlayer.stop();
    _selectedTrack = null;
    _resolvedTrack = null;
    _lyrics = null;
    _errorMessage = null;
    _lyricsError = null;
    _isResolving = false;
    _isLoadingLyrics = false;
    _isPlaying = false;
    _processingState = ProcessingState.idle;
    _position = Duration.zero;
    _duration = null;
    _queue.clear();
    _history.clear();
    notifyListeners();
  }

  void _replaceQueueFromContext(Track track, List<Track> contextQueue) {
    _queue.clear();
    final selectedIndex =
        contextQueue.indexWhere((item) => item.id == track.id);
    if (selectedIndex >= 0) {
      _queue.addAll(contextQueue.skip(selectedIndex + 1));
      return;
    }
    _queue.addAll(contextQueue.where((item) => item.id != track.id));
  }

  Future<void> _seedRecommendations(Track seed) async {
    try {
      final excludeIds = {
        seed.id,
        ..._queue.map((track) => track.id),
        ..._history.map((track) => track.id),
      }.toList(growable: false);
      final recommendations = await api.recommend(seed, excludeIds: excludeIds);
      if (selectedTrack?.id != seed.id) return;
      _queue.addAll(recommendations.where((track) => track.id != seed.id));
      notifyListeners();
    } on Object {
      // Recommendations are nice-to-have on mobile; playback should not fail if they do.
    }
  }

  Future<void> _startPlayback() async {
    try {
      await _audioPlayer.play();
    } on Object catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
    }
  }

  Future<void> _loadLyrics(Track track) async {
    _isLoadingLyrics = true;
    notifyListeners();
    try {
      final result = await api.lyrics(track);
      if (selectedTrack?.id != track.id) return;
      _lyrics = result;
    } on Object catch (error) {
      if (selectedTrack?.id != track.id) return;
      _lyricsError = error.toString();
    } finally {
      if (selectedTrack?.id == track.id) {
        _isLoadingLyrics = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _playbackSubscription?.cancel();
    _positionSubscription?.cancel();
    _durationSubscription?.cancel();
    _audioPlayer.dispose();
    super.dispose();
  }
}

class PlayerScope extends InheritedNotifier<PlayerController> {
  const PlayerScope({
    required PlayerController controller,
    required super.child,
    super.key,
  }) : super(notifier: controller);

  static PlayerController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<PlayerScope>();
    assert(scope != null, 'PlayerScope is missing above this context');
    return scope!.notifier!;
  }
}
