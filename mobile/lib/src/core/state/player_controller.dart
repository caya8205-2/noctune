import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:just_audio/just_audio.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';

enum NoctuneRepeatMode { off, all, one }

class PlayerController extends ChangeNotifier {
  PlayerController({required this.api}) {
    _playbackSubscription = _audioPlayer.playerStateStream.listen((state) {
      _isPlaying = state.playing;
      _processingState = state.processingState;
      if (state.processingState == ProcessingState.completed) {
        _handleTrackCompletion();
      }
      notifyListeners();
    });
    _positionSubscription = _audioPlayer.positionStream.listen((pos) {
      _position = pos;
      positionNotifier.value = pos;
      // Do NOT call notifyListeners() here to avoid flickering entire UI tree
    });
    _durationSubscription = _audioPlayer.durationStream.listen((dur) {
      _duration = dur;
      durationNotifier.value = dur;
      notifyListeners();
    });

    // Initial sync of liked tracks
    unawaited(syncLikedTracks());
  }

  final NoctuneApi api;
  final AudioPlayer _audioPlayer = AudioPlayer();
  StreamSubscription<PlayerState>? _playbackSubscription;
  StreamSubscription<Duration>? _positionSubscription;
  StreamSubscription<Duration?>? _durationSubscription;

  final ValueNotifier<Duration> positionNotifier = ValueNotifier(Duration.zero);
  final ValueNotifier<Duration?> durationNotifier = ValueNotifier(null);

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
  bool _isShuffleEnabled = false;
  NoctuneRepeatMode _repeatMode = NoctuneRepeatMode.off;
  final List<Track> _queue = [];
  final List<Track> _history = [];
  final List<Track> _contextQueue = [];
  final Set<String> _likedTrackIds = {};

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
  bool get isShuffleEnabled => _isShuffleEnabled;
  NoctuneRepeatMode get repeatMode => _repeatMode;
  Duration get position => _position;
  Duration get duration =>
      _duration ??
      Duration(seconds: selectedTrack == null ? 0 : selectedTrack!.duration);
  bool get canGoNext => _queue.isNotEmpty || _selectedTrack != null;
  bool get canGoPrevious => _history.isNotEmpty || _position.inSeconds > 3;
  List<Track> get queue => List.unmodifiable(_queue);
  Set<String> get likedTrackIds => Set.unmodifiable(_likedTrackIds);

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

  bool isLiked(Track track) {
    if (_likedTrackIds.contains(track.id)) return true;
    if (track.spotifyId != null && _likedTrackIds.contains(track.spotifyId)) return true;
    if (track.youtubeId != null && _likedTrackIds.contains(track.youtubeId)) return true;
    return false;
  }

  Future<void> syncLikedTracks() async {
    try {
      final likedPlaylist = await api.liked();
      _likedTrackIds.clear();
      for (final t in likedPlaylist.tracks) {
        _likedTrackIds.add(t.id);
        if (t.spotifyId != null) _likedTrackIds.add(t.spotifyId!);
        if (t.youtubeId != null) _likedTrackIds.add(t.youtubeId!);
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toggleLike(Track track) async {
    try {
      final updatedPlaylist = await api.toggleLike(track);
      _likedTrackIds.clear();
      for (final t in updatedPlaylist.tracks) {
        _likedTrackIds.add(t.id);
        if (t.spotifyId != null) _likedTrackIds.add(t.spotifyId!);
        if (t.youtubeId != null) _likedTrackIds.add(t.youtubeId!);
      }
      notifyListeners();
    } catch (e) {
      _errorMessage = 'Failed to update liked status: $e';
      notifyListeners();
    }
  }

  void toggleShuffle() {
    _isShuffleEnabled = !_isShuffleEnabled;
    if (_isShuffleEnabled && _queue.length > 1) {
      _queue.shuffle();
    }
    notifyListeners();
  }

  void cycleRepeat() {
    switch (_repeatMode) {
      case NoctuneRepeatMode.off:
        _repeatMode = NoctuneRepeatMode.all;
        break;
      case NoctuneRepeatMode.all:
        _repeatMode = NoctuneRepeatMode.one;
        break;
      case NoctuneRepeatMode.one:
        _repeatMode = NoctuneRepeatMode.off;
        break;
    }
    notifyListeners();
  }

  Future<void> seek(Duration targetPosition) async {
    _position = targetPosition;
    positionNotifier.value = targetPosition;
    await _audioPlayer.seek(targetPosition);
  }

  Future<void> play(
    Track track, {
    List<Track> contextQueue = const [],
    bool recordHistory = true,
    bool preserveUpcomingQueue = false,
  }) async {
    final previous = selectedTrack;
    if (previous != null && previous.id != track.id) {
      if (recordHistory) {
        _history.add(previous);
      }
      // Record telemetry to backend
      unawaited(api.recordPlayed(previous));
    }
    _selectedTrack = track;
    _resolvedTrack = null;
    _lyrics = null;
    _lyricsError = null;
    _errorMessage = null;
    _isResolving = true;
    _position = Duration.zero;
    positionNotifier.value = Duration.zero;
    _duration = track.duration > 0 ? Duration(seconds: track.duration) : null;
    durationNotifier.value = _duration;

    if (!preserveUpcomingQueue) {
      if (contextQueue.isNotEmpty) {
        _contextQueue.clear();
        _contextQueue.addAll(contextQueue);
      }
      _replaceQueueFromContext(track, contextQueue.isEmpty ? _contextQueue : contextQueue);
    }

    if (_isShuffleEnabled && _queue.length > 1) {
      _queue.shuffle();
    }

    notifyListeners();
    unawaited(_loadLyrics(track));

    try {
      _resolvedTrack = await api.resolve(track);
      await _audioPlayer.setUrl(api.streamUrl(_resolvedTrack!.id));
      unawaited(_startPlayback());
      unawaited(api.recordPlayed(_resolvedTrack ?? track));
      
      // Autoqueue top up or prefetch
      if (_queue.length < 3) {
        unawaited(_topUpQueue(_resolvedTrack ?? track));
      } else {
        unawaited(api.prefetchTracks(_queue.take(2).toList()));
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
      await play(_selectedTrack!, preserveUpcomingQueue: true);
      return;
    }
    if (_isPlaying) {
      await _audioPlayer.pause();
      return;
    }
    unawaited(_startPlayback());
  }

  Future<void> playNext() async {
    if (_queue.isEmpty) {
      if (selectedTrack != null) {
        await _topUpQueue(selectedTrack!);
      }
    }
    if (_queue.isNotEmpty) {
      final next = _queue.removeAt(0);
      await play(next, preserveUpcomingQueue: true);
    }
  }

  Future<void> playPrevious() async {
    if (_position.inSeconds > 3) {
      await seek(Duration.zero);
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

  void addToQueue(Track track) {
    _queue.add(track);
    notifyListeners();
    unawaited(api.prefetchTracks([track]));
  }

  void playNextInQueue(Track track) {
    _queue.insert(0, track);
    notifyListeners();
    unawaited(api.prefetchTracks([track]));
  }

  void removeFromQueue(int index) {
    if (index >= 0 && index < _queue.length) {
      _queue.removeAt(index);
      notifyListeners();
    }
  }

  void clearUpcomingQueue() {
    _queue.clear();
    notifyListeners();
  }

  void reorderQueue(int oldIndex, int newIndex) {
    if (oldIndex < 0 || oldIndex >= _queue.length) return;
    var targetIndex = newIndex;
    if (targetIndex > oldIndex) targetIndex -= 1;
    final item = _queue.removeAt(oldIndex);
    _queue.insert(targetIndex, item);
    notifyListeners();
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
    positionNotifier.value = Duration.zero;
    _duration = null;
    durationNotifier.value = null;
    _queue.clear();
    _history.clear();
    _contextQueue.clear();
    notifyListeners();
  }

  void _replaceQueueFromContext(Track track, List<Track> contextQueue) {
    _queue.clear();
    if (contextQueue.isEmpty) return;
    final selectedIndex =
        contextQueue.indexWhere((item) => item.id == track.id);
    if (selectedIndex >= 0) {
      _history.clear();
      _history.addAll(contextQueue.take(selectedIndex));
      _queue.addAll(contextQueue.skip(selectedIndex + 1));
      return;
    }
    _queue.addAll(contextQueue.where((item) => item.id != track.id));
  }

  Future<void> _handleTrackCompletion() async {
    if (selectedTrack != null) {
      unawaited(api.recordPlayed(selectedTrack!));
    }
    if (_repeatMode == NoctuneRepeatMode.one) {
      await seek(Duration.zero);
      await _startPlayback();
      return;
    }
    if (_queue.isEmpty && _repeatMode == NoctuneRepeatMode.all && _contextQueue.isNotEmpty) {
      _queue.addAll(_contextQueue);
    }
    if (_queue.isEmpty && selectedTrack != null) {
      await _topUpQueue(selectedTrack!);
    }
    if (_queue.isNotEmpty) {
      await playNext();
    }
  }

  Future<void> _topUpQueue(Track seed) async {
    try {
      final excludeIds = {
        seed.id,
        if (seed.spotifyId != null) seed.spotifyId!,
        if (seed.youtubeId != null) seed.youtubeId!,
        ..._queue.map((t) => t.id),
        ..._history.map((t) => t.id),
      }.toList(growable: false);

      final recommendations = await api.recommend(seed, excludeIds: excludeIds, limit: 10);
      final newTracks = recommendations.where((t) => t.id != seed.id).toList();
      if (newTracks.isNotEmpty) {
        _queue.addAll(newTracks);
        notifyListeners();
        unawaited(api.prefetchTracks(newTracks.take(3).toList()));
      }
    } on Object {
      // Recommendation failure fallback
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
    positionNotifier.dispose();
    durationNotifier.dispose();
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
