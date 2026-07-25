import type { FastifyInstance } from 'fastify';
import { getAllCachedTracks } from '../services/cache.js';
import { getSpotifyTrackMetadata } from '../services/spotify.js';
import type { CachedTrack } from '../types/index.js';

type Period = '7d' | '30d' | 'all';

function filterByPeriod(tracks: CachedTrack[], period: Period): CachedTrack[] {
  if (period === 'all') return tracks;
  
  const now = Date.now();
  const days = period === '7d' ? 7 : 30;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  
  return tracks.filter(t => t.lastPlayed && t.lastPlayed >= cutoff);
}

export async function statsRoutes(app: FastifyInstance) {
  // Overview stats
  app.get('/stats/overview', async (req, reply) => {
    const query = req.query as { period?: Period };
    const period = query.period || 'all';
    
    const allTracks = getAllCachedTracks(); // Get all cached tracks
    const filteredTracks = filterByPeriod(allTracks, period);
    
    const totalPlays = filteredTracks.reduce((sum, t) => sum + (t.playCount || 0), 0);
    const totalMinutes = filteredTracks.reduce((sum, t) => sum + (t.duration || 0) * (t.playCount || 0) / 60, 0);
    const uniqueArtists = new Set(filteredTracks.map(t => t.artist)).size;
    const uniqueTracks = filteredTracks.length;
    
    return reply.send({
      totalPlays,
      totalMinutes: Math.round(totalMinutes),
      uniqueArtists,
      uniqueTracks,
    });
  });

  // Top tracks
  app.get('/stats/top-tracks', async (req, reply) => {
    const query = req.query as { period?: Period; limit?: string };
    const period = query.period || 'all';
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    
    const allTracks = getAllCachedTracks();
    const filteredTracks = filterByPeriod(allTracks, period);
    
    // Sort by play count
    const sorted = filteredTracks
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, limit)
      .map(t => ({
        track: {
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration,
          thumbnail: t.thumbnail,
          query: t.query,
          spotifyId: t.spotifyId,
          artistId: t.artistId,
        },
        playCount: t.playCount || 0,
        lastPlayed: t.lastPlayed,
      }));
    
    return reply.send(sorted);
  });

  // Top artists
  app.get('/stats/top-artists', async (req, reply) => {
    const query = req.query as { period?: Period; limit?: string };
    const period = query.period || 'all';
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    
    const allTracks = getAllCachedTracks();
    const filteredTracks = filterByPeriod(allTracks, period);
    
    // Aggregate by artist
    const artistMap = new Map<string, { artist: string; playCount: number; tracks: Set<string> }>();
    
    for (const track of filteredTracks) {
      const artist = track.artist;
      if (!artistMap.has(artist)) {
        artistMap.set(artist, { artist, playCount: 0, tracks: new Set() });
      }
      const entry = artistMap.get(artist)!;
      entry.playCount += track.playCount || 0;
      entry.tracks.add(track.id);
    }
    
    const sortedEntries = Array.from(artistMap.values())
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);

    const sorted = await Promise.all(sortedEntries.map(async (entry) => {
      // Find the most-played track's artistId for this artist
      const topTrack = filteredTracks
        .filter(t => t.artist === entry.artist)
        .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))[0];
      let artistId = topTrack?.artistId || null;
      let image: string | null = null;

      if (topTrack?.spotifyId) {
        try {
          const metadata = await getSpotifyTrackMetadata(topTrack.spotifyId);
          const matchingArtist =
            metadata.artists.find(a => a.name.toLowerCase() === entry.artist.toLowerCase()) ??
            metadata.artists[0];
          artistId = artistId ?? matchingArtist?.id ?? null;
          image = matchingArtist?.image ?? null;
        } catch (err) {
          app.log.warn(
            { artist: entry.artist, message: (err as Error).message },
            '[stats] artist metadata unavailable'
          );
        }
      }

      return {
        artist: entry.artist,
        artistId,
        image,
        playCount: entry.playCount,
        tracksCount: entry.tracks.size,
      };
    }));
    
    return reply.send(sorted);
  });

  // Daily activity (calendar heatmap data)
  app.get('/stats/daily', async (req, reply) => {
    const query = req.query as { days?: string };
    const days = Math.min(365, Math.max(7, Number(query.days) || 30));
    
    const allTracks = getAllCachedTracks();
    
    // Aggregate by date
    const dayMap = new Map<string, { date: string; playCount: number; minutes: number }>();
    
    for (const track of allTracks) {
      if (!track.lastPlayed) continue;
      
      const date = new Date(track.lastPlayed).toISOString().split('T')[0];
      const plays = track.playCount || 0;
      const minutes = (track.duration || 0) * plays / 60;
      
      if (!dayMap.has(date)) {
        dayMap.set(date, { date, playCount: 0, minutes: 0 });
      }
      const entry = dayMap.get(date)!;
      entry.playCount += plays;
      entry.minutes += minutes;
    }
    
    // Generate last N days (fill missing days with 0)
    const result = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const entry = dayMap.get(dateStr);
      result.push({
        date: dateStr,
        playCount: entry?.playCount || 0,
        minutes: Math.round(entry?.minutes || 0),
      });
    }
    
    return reply.send(result);
  });

}
