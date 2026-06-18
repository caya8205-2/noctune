class Track {
  const Track({
    required this.id,
    required this.title,
    required this.artist,
    required this.duration,
    required this.thumbnail,
    required this.query,
    this.album,
    this.spotifyId,
    this.youtubeId,
  });

  final String id;
  final String title;
  final String artist;
  final String? album;
  final int duration;
  final String thumbnail;
  final String query;
  final String? spotifyId;
  final String? youtubeId;

  factory Track.fromJson(Map<String, dynamic> json) {
    return Track(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Unknown track',
      artist: json['artist']?.toString() ?? 'Unknown artist',
      album: json['album']?.toString(),
      duration: _readInt(json['duration']),
      thumbnail: json['thumbnail']?.toString() ?? '',
      query: json['query']?.toString() ?? json['title']?.toString() ?? '',
      spotifyId: json['spotifyId']?.toString(),
      youtubeId: json['youtubeId']?.toString(),
    );
  }
}

class CachedTrack extends Track {
  const CachedTrack({
    required super.id,
    required super.title,
    required super.artist,
    required super.duration,
    required super.thumbnail,
    required super.query,
    required this.streamUrl,
    super.album,
    super.spotifyId,
    super.youtubeId,
    this.source,
    this.audioQualityPreference,
  });

  final String streamUrl;
  final String? source;
  final String? audioQualityPreference;

  factory CachedTrack.fromJson(Map<String, dynamic> json) {
    return CachedTrack(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Unknown track',
      artist: json['artist']?.toString() ?? 'Unknown artist',
      album: json['album']?.toString(),
      duration: _readInt(json['duration']),
      thumbnail: json['thumbnail']?.toString() ?? '',
      query: json['query']?.toString() ?? json['title']?.toString() ?? '',
      spotifyId: json['spotifyId']?.toString(),
      youtubeId: json['youtubeId']?.toString(),
      streamUrl: json['audioUrl']?.toString() ?? '',
      source: json['source']?.toString(),
      audioQualityPreference: json['audioQualityPreference']?.toString(),
    );
  }
}

class Playlist {
  const Playlist({
    required this.id,
    required this.name,
    required this.tracks,
    this.coverDataUrl,
  });

  final String id;
  final String name;
  final List<Track> tracks;
  final String? coverDataUrl;

  factory Playlist.fromJson(Map<String, dynamic> json) {
    final rawTracks = json['tracks'];
    return Playlist(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Playlist',
      coverDataUrl: json['coverDataUrl']?.toString(),
      tracks: rawTracks is List
          ? rawTracks
              .whereType<Map<String, dynamic>>()
              .map(Track.fromJson)
              .toList(growable: false)
          : const [],
    );
  }
}

class HomePayload {
  const HomePayload({
    required this.playlists,
    required this.recentTracks,
    required this.newReleases,
  });

  final List<Playlist> playlists;
  final List<Track> recentTracks;
  final List<Track> newReleases;

  factory HomePayload.fromJson(Map<String, dynamic> json) {
    return HomePayload(
      playlists: _readList(json['playlists'], Playlist.fromJson),
      recentTracks: _readList(json['recentTracks'], Track.fromJson),
      newReleases: _readList(json['newReleases'], Track.fromJson),
    );
  }
}

class BackendStatus {
  const BackendStatus({required this.ok});

  final bool ok;

  factory BackendStatus.fromJson(Map<String, dynamic> json) {
    return BackendStatus(ok: json['ok'] == true);
  }
}

class LyricsResult {
  const LyricsResult({
    required this.synced,
    required this.lines,
  });

  final bool synced;
  final List<LyricLine> lines;

  factory LyricsResult.fromJson(Map<String, dynamic> json) {
    return LyricsResult(
      synced: json['synced'] == true,
      lines: _readList(json['lines'], LyricLine.fromJson),
    );
  }
}

class LyricLine {
  const LyricLine({
    required this.text,
    this.time,
    this.romanizedText,
  });

  final String text;
  final double? time;
  final String? romanizedText;

  factory LyricLine.fromJson(Map<String, dynamic> json) {
    final rawTime = json['time'];
    return LyricLine(
      text: json['text']?.toString() ?? '',
      time: rawTime is num ? rawTime.toDouble() : null,
      romanizedText: json['romanizedText']?.toString(),
    );
  }
}

List<T> _readList<T>(
  Object? value,
  T Function(Map<String, dynamic>) fromJson,
) {
  if (value is! List) return const [];
  return value
      .whereType<Map<String, dynamic>>()
      .map(fromJson)
      .toList(growable: false);
}

int _readInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}
