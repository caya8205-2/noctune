import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:noctune/src/core/models/noctune_models.dart';

class NoctuneApi {
  NoctuneApi({
    String baseUrl = const String.fromEnvironment(
      'NOCTUNE_API_BASE',
      defaultValue: 'http://10.0.2.2:3131',
    ),
    HttpClient? client,
  })  : _baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), ''),
        _client = client ?? HttpClient();

  final String _baseUrl;
  final HttpClient _client;

  String get baseUrl => _baseUrl;

  void close() {
    _client.close(force: true);
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final uri = Uri.parse('$_baseUrl$path');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: query);
  }

  Future<dynamic> _request(String path, {Map<String, String>? query}) async {
    final request = await _client
        .getUrl(_uri(path, query))
        .timeout(const Duration(seconds: 8));
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
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
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
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
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
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
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
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
    final data = await _request('/home') as Map<String, dynamic>;
    return HomePayload.fromJson(data);
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
  }) async {
    final body = <String, Object?>{};
    if (audioQualityPreference != null) {
      body['audioQualityPreference'] = audioQualityPreference;
    }
    if (searchEngine != null) body['searchEngine'] = searchEngine;
    final data = await _patch('/settings', body: body) as Map<String, dynamic>;
    return SettingsPayload.fromJson(data);
  }

  Future<ArtistBrowse> artist(String id) async {
    final data = await _request('/browse/artist/${Uri.encodeComponent(id)}')
        as Map<String, dynamic>;
    return ArtistBrowse.fromJson(data);
  }

  Future<AlbumBrowse> album(String id) async {
    final data = await _request('/browse/album/${Uri.encodeComponent(id)}')
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
    return '$_baseUrl/player/stream/${Uri.encodeComponent(videoId)}';
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
