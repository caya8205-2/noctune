class Track {
  const Track({
    required this.id,
    required this.title,
    required this.artist,
    required this.duration,
    required this.thumbnail,
    required this.query,
    this.album,
    this.artistId,
    this.albumId,
    this.spotifyId,
    this.youtubeId,
    this.spotifyUrl,
    this.trackNumber,
    this.popularity,
  });

  final String id;
  final String title;
  final String artist;
  final String? album;
  final String? artistId;
  final String? albumId;
  final int duration;
  final String thumbnail;
  final String query;
  final String? spotifyId;
  final String? youtubeId;
  final String? spotifyUrl;
  final int? trackNumber;
  final int? popularity;

  factory Track.fromJson(Map<String, dynamic> json) {
    return Track(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Unknown track',
      artist: json['artist']?.toString() ?? 'Unknown artist',
      album: json['album']?.toString(),
      artistId: json['artistId']?.toString(),
      albumId: json['albumId']?.toString(),
      duration: _readInt(json['duration']),
      thumbnail: json['thumbnail']?.toString() ?? '',
      query: json['query']?.toString() ?? json['title']?.toString() ?? '',
      spotifyId: json['spotifyId']?.toString(),
      youtubeId: json['youtubeId']?.toString(),
      spotifyUrl: json['spotifyUrl']?.toString(),
      trackNumber: _readNullableInt(json['trackNumber']),
      popularity: _readNullableInt(json['popularity']),
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
    super.artistId,
    super.albumId,
    super.spotifyId,
    super.youtubeId,
    super.spotifyUrl,
    super.trackNumber,
    super.popularity,
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
      artistId: json['artistId']?.toString(),
      albumId: json['albumId']?.toString(),
      duration: _readInt(json['duration']),
      thumbnail: json['thumbnail']?.toString() ?? '',
      query: json['query']?.toString() ?? json['title']?.toString() ?? '',
      spotifyId: json['spotifyId']?.toString(),
      youtubeId: json['youtubeId']?.toString(),
      spotifyUrl: json['spotifyUrl']?.toString(),
      trackNumber: _readNullableInt(json['trackNumber']),
      popularity: _readNullableInt(json['popularity']),
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

class NightlyMix {
  const NightlyMix({
    required this.id,
    required this.name,
    required this.tracks,
    this.seed,
    this.updatedAt,
  });

  final String id;
  final String name;
  final List<Track> tracks;
  final Track? seed;
  final int? updatedAt;

  factory NightlyMix.fromJson(Map<String, dynamic> json) {
    final rawSeed = json['seed'];
    return NightlyMix(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Nightly Mix',
      tracks: _readList(json['tracks'], Track.fromJson),
      seed: rawSeed is Map<String, dynamic> ? Track.fromJson(rawSeed) : null,
      updatedAt: _readNullableInt(json['updatedAt']),
    );
  }
}

class HistoryEntry {
  const HistoryEntry({
    required this.track,
    required this.playedAt,
  });

  final Track track;
  final int playedAt;

  factory HistoryEntry.fromJson(Map<String, dynamic> json) {
    return HistoryEntry(
      track: Track.fromJson(json),
      playedAt: _readInt(json['playedAt'] ?? json['lastPlayed']),
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

class SettingsPayload {
  const SettingsPayload({
    required this.searchEngine,
    required this.audioQualityPreference,
    required this.recommendationEngine,
    required this.discordRpcEnabled,
    required this.spotifyConfigured,
  });

  final String searchEngine;
  final String audioQualityPreference;
  final String recommendationEngine;
  final bool discordRpcEnabled;
  final bool spotifyConfigured;

  factory SettingsPayload.fromJson(Map<String, dynamic> json) {
    final spotify = json['spotify'];
    final isSpotifyConfigured = spotify is Map<String, dynamic> && spotify['configured'] == true;
    return SettingsPayload(
      searchEngine: json['searchEngine']?.toString() ?? 'spotify',
      audioQualityPreference: json['audioQualityPreference']?.toString() ?? 'auto',
      recommendationEngine: json['recommendationEngine']?.toString() ?? 'hybrid-ml',
      discordRpcEnabled: json['discordRpcEnabled'] ?? true,
      spotifyConfigured: isSpotifyConfigured,
    );
  }
}

class ArtistBrowse {
  const ArtistBrowse({
    required this.id,
    required this.name,
    required this.genres,
    required this.topTracks,
    required this.albums,
    this.popularity,
    this.followers,
    this.image,
    this.spotifyUrl,
  });

  final String id;
  final String name;
  final List<String> genres;
  final int? popularity;
  final int? followers;
  final String? image;
  final String? spotifyUrl;
  final List<Track> topTracks;
  final List<AlbumSummary> albums;

  factory ArtistBrowse.fromJson(Map<String, dynamic> json) {
    final rawGenres = json['genres'];
    return ArtistBrowse(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Artist',
      genres: rawGenres is List
          ? rawGenres.map((item) => item.toString()).toList(growable: false)
          : const [],
      popularity: _readNullableInt(json['popularity']),
      followers: _readNullableInt(json['followers']),
      image: json['image']?.toString(),
      spotifyUrl: json['spotifyUrl']?.toString(),
      topTracks: _readList(json['topTracks'], Track.fromJson),
      albums: _readList(json['albums'], AlbumSummary.fromJson),
    );
  }
}

class AlbumSummary {
  const AlbumSummary({
    required this.id,
    required this.name,
    required this.type,
    required this.totalTracks,
    this.releaseDate,
    this.image,
    this.spotifyUrl,
  });

  final String id;
  final String name;
  final String type;
  final String? releaseDate;
  final int totalTracks;
  final String? image;
  final String? spotifyUrl;

  factory AlbumSummary.fromJson(Map<String, dynamic> json) {
    return AlbumSummary(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Album',
      type: json['type']?.toString() ?? 'album',
      releaseDate: json['releaseDate']?.toString(),
      totalTracks: _readInt(json['totalTracks']),
      image: json['image']?.toString(),
      spotifyUrl: json['spotifyUrl']?.toString(),
    );
  }
}

class AlbumBrowse {
  const AlbumBrowse({
    required this.id,
    required this.name,
    required this.type,
    required this.totalTracks,
    required this.artists,
    required this.tracks,
    this.releaseDate,
    this.label,
    this.popularity,
    this.image,
    this.spotifyUrl,
  });

  final String id;
  final String name;
  final String type;
  final String? releaseDate;
  final int totalTracks;
  final String? label;
  final int? popularity;
  final String? image;
  final String? spotifyUrl;
  final List<ArtistSummary> artists;
  final List<Track> tracks;

  factory AlbumBrowse.fromJson(Map<String, dynamic> json) {
    return AlbumBrowse(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Album',
      type: json['type']?.toString() ?? 'album',
      releaseDate: json['releaseDate']?.toString(),
      totalTracks: _readInt(json['totalTracks']),
      label: json['label']?.toString(),
      popularity: _readNullableInt(json['popularity']),
      image: json['image']?.toString(),
      spotifyUrl: json['spotifyUrl']?.toString(),
      artists: _readList(json['artists'], ArtistSummary.fromJson),
      tracks: _readList(json['tracks'], Track.fromJson),
    );
  }
}

class ArtistSummary {
  const ArtistSummary({required this.name, this.id});

  final String? id;
  final String name;

  factory ArtistSummary.fromJson(Map<String, dynamic> json) {
    return ArtistSummary(
      id: json['id']?.toString(),
      name: json['name']?.toString() ?? 'Artist',
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

int? _readNullableInt(Object? value) {
  if (value == null) return null;
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value.toString());
}
