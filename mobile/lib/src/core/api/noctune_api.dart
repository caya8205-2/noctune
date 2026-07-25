import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:noctune/src/core/models/noctune_models.dart';

class NoctuneApi {
  NoctuneApi({
    String baseUrl = const String.fromEnvironment(
      'NOCTUNE_API_BASE',
      defaultValue: 'https://noctune.my.id',
    ),
    String apiKey = const String.fromEnvironment(
      'NOCTUNE_API_KEY',
      defaultValue: '',
    ),
    HttpClient? client,
  })  : _baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), ''),
        _apiKey = apiKey.trim(),
        _client = client ?? HttpClient();

  final String _baseUrl;
  final String _apiKey;
  final HttpClient _client;

  String get baseUrl => _baseUrl;
  String get apiKey => _apiKey;

  void close() {
    _client.close(force: true);
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final uri = Uri.parse('$_baseUrl$path');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: query);
  }

  void _applyHeaders(HttpClientRequest request) {
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (_apiKey.isNotEmpty) {
      request.headers.set('X-Noctune-Api-Key', _apiKey);
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_apiKey');
    }
  }

  Future<dynamic> _request(String path, {Map<String, String>? query}) async {
    final request = await _client
        .getUrl(_uri(path, query))
        .timeout(const Duration(seconds: 8));
    _applyHeaders(request);
    final response = await request.close().timeout(const Duration(seconds: 12));
    final body = await response.transform(utf8.decoder).join();

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw NoctuneApiException(
        'Backend returned HTTP ${response.statusCode}',
        statusCode: response.statusCode,
      );
    }

    if (body.isEmpty) return null;
    return jsonDecode(body);
  }

  Future<dynamic> _post(
    String path, {
    Map<String, String>? query,
    Object? body,
  }) async {
    final request = await _client
        .postUrl(_uri(path, query))
        .timeout(const Duration(seconds: 8));
    _applyHeaders(request);
    request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
    if (body != null) {
      request.write(jsonEncode(body));
    }
    final response = await request.close().timeout(const Duration(seconds: 16));
    final responseBody = await response.transform(utf8.decoder).join();

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw NoctuneApiException(
        'Backend returned HTTP ${response.statusCode}',
        statusCode: response.statusCode,
      );
    }

    if (responseBody.isEmpty) return null;
    return jsonDecode(responseBody);
  }

  Future<dynamic> _patch(String path, {Object? body}) async {
    final request = await _client
        .patchUrl(_uri(path))
        .timeout(const Duration(seconds: 8));
    _applyHeaders(request);
    request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
    if (body != null) {
      request.write(jsonEncode(body));
    }
    final response = await request.close().timeout(const Duration(seconds: 16));
    final responseBody = await response.transform(utf8.decoder).join();

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw NoctuneApiException(
        'Backend returned HTTP ${response.statusCode}',
        statusCode: response.statusCode,
      );
    }

    if (responseBody.isEmpty) return null;
    return jsonDecode(responseBody);
  }

  Future<dynamic> _delete(String path) async {
    final request = await _client
        .deleteUrl(_uri(path))
        .timeout(const Duration(seconds: 8));
    _applyHeaders(request);
    final response = await request.close().timeout(const Duration(seconds: 16));
    final responseBody = await response.transform(utf8.decoder).join();

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw NoctuneApiException(
        'Backend returned HTTP ${response.statusCode}',
        statusCode: response.statusCode,
      );
    }

    if (responseBody.isEmpty) return null;
    return jsonDecode(responseBody);
  }

  Future<BackendStatus> status() async {
    final data = await _request('/status') as Map<String, dynamic>;
    return BackendStatus.fromJson(data);
  }

  Future<HomePayload> home() async {
    final results = await Future.wait([
      _request('/home'),
      _request('/home/new-releases').catchError((_) => <String, dynamic>{}),
    ]);
    final homeData = results[0] as Map<String, dynamic>;
    final releasesData = results[1] as Map<String, dynamic>;

    final playlistsJson = homeData['playlists'];
    final recentTracksJson = homeData['recentTracks'];
    final newReleasesJson = releasesData['newReleases'];

    return HomePayload(
      playlists: playlistsJson is List
          ? playlistsJson.whereType<Map<String, dynamic>>().map(Playlist.fromJson).toList()
          : const [],
      recentTracks: recentTracksJson is List
          ? recentTracksJson.whereType<Map<String, dynamic>>().map(Track.fromJson).toList()
          : const [],
      newReleases: newReleasesJson is List
          ? newReleasesJson.whereType<Map<String, dynamic>>().map(Track.fromJson).toList()
          : const [],
    );
  }

  Future<List<Track>> search(
    String query, {
    int limit = 25,
    String? source,
  }) async {
    final queryParams = {
      'q': query,
      'limit': '$limit',
    };
    if (source != null) {
      queryParams['source'] = source;
    }
    final data = await _request('/search', query: queryParams)
        as Map<String, dynamic>;
    final tracks = data['tracks'];
    if (tracks is! List) return const [];
    return tracks
        .whereType<Map<String, dynamic>>()
        .map(Track.fromJson)
        .toList(growable: false);
  }

  Future<List<Playlist>> playlists() async {
    final data = await _request('/playlists') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(Playlist.fromJson)
        .toList(growable: false);
  }

  Future<Playlist> liked() async {
    final data = await _request('/library/liked') as Map<String, dynamic>;
    return Playlist.fromJson(data);
  }

  Future<Playlist> playlist(String id) async {
    final data = await _request('/playlists/${Uri.encodeComponent(id)}')
        as Map<String, dynamic>;
    return Playlist.fromJson(data);
  }

  Future<Playlist> updatePlaylist(
    String id, {
    String? name,
    String? coverDataUrl,
  }) async {
    final body = <String, Object?>{};
    if (name != null) body['name'] = name;
    if (coverDataUrl != null) {
      body['coverDataUrl'] = coverDataUrl.isEmpty ? null : coverDataUrl;
    }
    final data = await _patch('/playlists/${Uri.encodeComponent(id)}', body: body)
        as Map<String, dynamic>;
    final playlist = data['playlist'];
    if (playlist is Map<String, dynamic>) return Playlist.fromJson(playlist);
    return Playlist.fromJson(data);
  }

  Future<Playlist> createPlaylist(String name) async {
    final data = await _post('/playlists', body: {'name': name})
        as Map<String, dynamic>;
    final playlist = data['playlist'];
    if (playlist is Map<String, dynamic>) return Playlist.fromJson(playlist);
    return Playlist.fromJson(data);
  }

  Future<void> deletePlaylist(String id) async {
    await _delete('/playlists/${Uri.encodeComponent(id)}');
  }

  Future<Playlist> addTrackToPlaylist(String playlistId, Track track) async {
    final data = await _post(
      '/playlists/${Uri.encodeComponent(playlistId)}/tracks',
      body: _trackToJson(track),
    ) as Map<String, dynamic>;
    final playlist = data['playlist'];
    if (playlist is Map<String, dynamic>) return Playlist.fromJson(playlist);
    return Playlist.fromJson(data);
  }

  Future<Playlist> toggleLike(Track track) async {
    final data = await _post('/library/liked/toggle', body: _trackToJson(track))
        as Map<String, dynamic>;
    final playlist = data['playlist'];
    if (playlist is Map<String, dynamic>) return Playlist.fromJson(playlist);
    return Playlist.fromJson(data);
  }

  Future<void> recordPlayed(Track track) async {
    try {
      await _post('/player/played', body: {'track': _trackToJson(track)});
    } catch (_) {
      // Ignore errors for telemetries
    }
  }

  Future<Playlist> reorderPlaylistTracks(
    String playlistId,
    int fromIndex,
    int toIndex,
  ) async {
    final data = await _patch(
      '/playlists/${Uri.encodeComponent(playlistId)}/tracks/reorder',
      body: {'fromIndex': fromIndex, 'toIndex': toIndex},
    ) as Map<String, dynamic>;
    final playlist = data['playlist'];
    if (playlist is Map<String, dynamic>) return Playlist.fromJson(playlist);
    return Playlist.fromJson(data);
  }

  Future<List<NightlyMix>> nightlyMixes({
    int limit = 4,
    int tracks = 8,
  }) async {
    final data = await _request('/home/nightly-mix', query: {
      'limit': '$limit',
      'tracks': '$tracks',
    }) as Map<String, dynamic>;
    final mixes = data['mixes'];
    if (mixes is! List) return const [];
    return mixes
        .whereType<Map<String, dynamic>>()
        .map(NightlyMix.fromJson)
        .toList(growable: false);
  }

  Future<List<HistoryEntry>> history() async {
    final data = await _request('/history') as Map<String, dynamic>;
    final tracks = data['tracks'];
    if (tracks is! List) return const [];
    return tracks.whereType<Map<String, dynamic>>().map((json) {
      final val = json['lastPlayed'] ?? json['playedAt'];
      final timestamp = val is int ? val : (val is num ? val.toInt() : 0);
      return HistoryEntry(
        track: Track.fromJson(json),
        playedAt: timestamp,
      );
    }).toList(growable: false);
  }

  Future<void> prefetchTracks(List<Track> tracks) async {
    if (tracks.isEmpty) return;
    try {
      await _post('/player/prefetch', body: {
        'tracks': tracks.map(_trackToJson).toList(),
      });
    } catch (_) {
      // Ignore prefetch failures
    }
  }

  Future<void> cacheAudioTracks(List<Track> tracks) async {
    if (tracks.isEmpty) return;
    try {
      await _post('/player/cache-audio', body: {
        'tracks': tracks.map(_trackToJson).toList(),
      });
    } catch (_) {
      // Ignore cache errors
    }
  }

  Future<void> removePlaylistTrack(String playlistId, String trackId) async {
    await _delete(
      '/playlists/${Uri.encodeComponent(playlistId)}/tracks/${Uri.encodeComponent(trackId)}',
    );
  }

  Future<SettingsPayload> settings() async {
    final data = await _request('/settings') as Map<String, dynamic>;
    return SettingsPayload.fromJson(data);
  }

  Future<SettingsPayload> updateSettings({
    String? audioQualityPreference,
    String? searchEngine,
    String? recommendationEngine,
    bool? discordRpcEnabled,
  }) async {
    final body = <String, Object?>{};
    if (audioQualityPreference != null) {
      body['audioQualityPreference'] = audioQualityPreference;
    }
    if (searchEngine != null) body['searchEngine'] = searchEngine;
    if (recommendationEngine != null) body['recommendationEngine'] = recommendationEngine;
    if (discordRpcEnabled != null) body['discordRpcEnabled'] = discordRpcEnabled;

    final data = await _patch('/settings', body: body) as Map<String, dynamic>;
    return SettingsPayload.fromJson(data);
  }

  Future<void> clearTrackCache() async {
    await _delete('/settings/cache/tracks');
  }

  Future<void> clearLyricsCache() async {
    await _delete('/settings/cache/lyrics');
  }

  Future<void> clearAudioFilesCache() async {
    await _delete('/settings/cache/audio');
  }

  Future<void> resetResolverBlacklist() async {
    await _delete('/settings/resolver-blacklist');
  }

  Future<List<Track>> topTracks({int limit = 20}) async {
    try {
      final data = await _request('/stats/top-tracks', query: {'limit': '$limit'})
          as List<dynamic>;
      return data
          .whereType<Map<String, dynamic>>()
          .map((item) {
            final t = item['track'];
            if (t is Map<String, dynamic>) return Track.fromJson(t);
            return null;
          })
          .whereType<Track>()
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }

  Future<ArtistBrowse> artist(String id) async {
    var cleanId = id.trim();
    if (cleanId.startsWith('spotify:artist:')) {
      cleanId = cleanId.substring('spotify:artist:'.length);
    } else if (cleanId.startsWith('spotify:album:')) {
      cleanId = cleanId.substring('spotify:album:'.length);
    } else if (cleanId.startsWith('spotify:')) {
      cleanId = cleanId.substring('spotify:'.length);
    }
    final data = await _request('/browse/artist/${Uri.encodeComponent(cleanId)}')
        as Map<String, dynamic>;
    return ArtistBrowse.fromJson(data);
  }

  Future<AlbumBrowse> album(String id) async {
    var cleanId = id.trim();
    if (cleanId.startsWith('spotify:album:')) {
      cleanId = cleanId.substring('spotify:album:'.length);
    } else if (cleanId.startsWith('spotify:artist:')) {
      cleanId = cleanId.substring('spotify:artist:'.length);
    } else if (cleanId.startsWith('spotify:')) {
      cleanId = cleanId.substring('spotify:'.length);
    }
    final data = await _request('/browse/album/${Uri.encodeComponent(cleanId)}')
        as Map<String, dynamic>;
    return AlbumBrowse.fromJson(data);
  }

  Future<CachedTrack> resolve(Track track) async {
    final params = <String, String>{};
    if (track.query.isNotEmpty) params['query'] = track.query;
    if ((track.youtubeId ?? '').isNotEmpty) params['youtubeId'] = track.youtubeId!;
    final data = await _request('/player/resolve/${Uri.encodeComponent(track.id)}', query: params)
        as Map<String, dynamic>;
    return CachedTrack.fromJson(data);
  }

  Future<List<Track>> recommend(
    Track seed, {
    List<String> excludeIds = const [],
    int limit = 12,
  }) async {
    final data = await _post('/queue/recommend', body: {
      'seed': _trackToJson(seed),
      'excludeIds': excludeIds,
      'limit': limit,
    }) as Map<String, dynamic>;
    final tracks = data['tracks'];
    if (tracks is! List) return const [];
    return tracks
        .whereType<Map<String, dynamic>>()
        .map(Track.fromJson)
        .toList(growable: false);
  }

  Future<LyricsResult?> lyrics(Track track) async {
    final data = await _request('/lyrics', query: {
      'title': track.title,
      'artist': track.artist,
      'duration': '${track.duration}',
    });
    if (data is! Map<String, dynamic>) return null;
    return LyricsResult.fromJson(data);
  }

  String streamUrl(String videoId) {
    final encodedId = Uri.encodeComponent(videoId);
    if (_apiKey.isNotEmpty) {
      return '$_baseUrl/player/stream/$encodedId?apiKey=${Uri.encodeComponent(_apiKey)}';
    }
    return '$_baseUrl/player/stream/$encodedId';
  }
}

Map<String, Object?> _trackToJson(Track track) {
  return {
    'id': track.id,
    'title': track.title,
    'artist': track.artist,
    'duration': track.duration,
    'thumbnail': track.thumbnail,
    'query': track.query,
    if (track.spotifyId != null) 'spotifyId': track.spotifyId,
    if (track.youtubeId != null) 'youtubeId': track.youtubeId,
    if (track.spotifyUrl != null) 'spotifyUrl': track.spotifyUrl,
  };
}

class NoctuneApiException implements Exception {
  const NoctuneApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}
