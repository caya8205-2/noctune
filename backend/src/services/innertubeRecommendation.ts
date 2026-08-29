import type { Track } from '../types/index.js';
import { searchSpotify } from './spotify.js';
import { searchTracks } from './audioResolver.js';
import { getYoutubeTrack } from './audioResolver.js';

interface RecommendationCandidate {
  track: Track;
  source: 'lastfm' | 'search' | 'local';
  match?: number;
  targetTitle?: string;
  targetArtist?: string;
}

export async function getInnertubeWatchNextCandidates(
  seed: Track,
  limit: number,
  isSpotifyDominant = false
): Promise<RecommendationCandidate[]> {
  try {
    let videoId = seed.youtubeId || (!seed.id.startsWith('spotify:') && !seed.id.startsWith('local:') ? seed.id : '');

    // If Spotify seed doesn't have youtubeId yet, quickly search YouTube to find one
    if (!videoId && (seed.title || seed.query)) {
      const q = `${seed.title} ${seed.artist || ''}`.trim();
      const results = await searchTracks(q, 1);
      if (results && results.length > 0) {
        videoId = results[0].youtubeId || results[0].id;
      }
    }

    if (!videoId) return [];

    // Call youtubei/innertube watch_next via youtubei helper or search
    const results = await searchTracks(`${seed.title} ${seed.artist}`, limit);
    const candidates: RecommendationCandidate[] = [];

    for (const item of results) {
      if (item.id === videoId || item.id === seed.id) continue;

      if (isSpotifyDominant) {
        try {
          const spotifyResults = await searchSpotify(`${item.title} ${item.artist}`, 1);
          if (spotifyResults && spotifyResults.length > 0) {
            candidates.push({
              track: spotifyResults[0],
              source: 'search',
              match: 0.9,
              targetTitle: item.title,
              targetArtist: item.artist,
            });
            continue;
          }
        } catch {}
      }

      candidates.push({
        track: item,
        source: 'search',
        match: 0.85,
        targetTitle: item.title,
        targetArtist: item.artist,
      });
    }

    return candidates;
  } catch (err) {
    console.warn('[innertubeRecommendation] failed to get candidates:', err);
    return [];
  }
}
