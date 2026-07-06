import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRecommendations } from '../services/recommendations.js';
import type { Track } from '../types/index.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const TrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  duration: z.number().default(0),
  thumbnail: z.string().default(''),
  query: z.string().default(''),
  spotifyId: z.string().optional(),
  spotifyUrl: z.string().optional(),
  youtubeId: z.string().optional(),
  youtubeTitle: z.string().optional(),
  youtubeArtist: z.string().optional(),
});

const StartRadioBody = z.object({
  seed: TrackSchema,
});

const NextRadioQuery = z.object({
  sessionId: z.string().min(1),
});

const RadioFeedbackBody = z.object({
  sessionId: z.string().min(1),
  trackId: z.string().min(1),
  action: z.enum(['like', 'dislike']),
});

// ── In-memory session store ───────────────────────────────────────────────────

interface RadioSession {
  id: string;
  seed: z.infer<typeof TrackSchema>;
  createdAt: number;
  returnedIds: Set<string>;
  feedback: Map<string, 'like' | 'dislike'>;
  lastTrackIds: string[];
}

const sessions = new Map<string, RadioSession>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const BATCH_SIZE = 10;

// Periodic cleanup of stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 30 * 60 * 1000);

function generateSessionId(): string {
  return `radio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function radioRoutes(app: FastifyInstance) {
  /**
   * POST /radio/start
   * Start a radio session from a seed track.
   * Returns first batch of recommendations (more diverse than normal queue).
   */
  app.post('/radio/start', async (req, reply) => {
    const parsed = StartRadioBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const { seed } = parsed.data;
    const sessionId = generateSessionId();

    const session: RadioSession = {
      id: sessionId,
      seed,
      createdAt: Date.now(),
      returnedIds: new Set<string>(),
      feedback: new Map(),
      lastTrackIds: [],
    };

    // Get initial batch with diversity
    const excludeIds = [seed.id, seed.spotifyId ?? '', seed.youtubeId ?? ''].filter(Boolean);
    const tracks = await getRecommendations(seed as Track, { excludeIds, limit: BATCH_SIZE * 2 });
    const diversified = diversifyRadioTracks(tracks, seed, BATCH_SIZE);

    // Track which IDs we've returned
    diversified.forEach((t) => {
      const key = t.spotifyId ?? t.youtubeId ?? t.id;
      session.returnedIds.add(key);
    });

    session.lastTrackIds = diversified.map((t) => t.id);
    sessions.set(sessionId, session);

    app.log.info(
      { sessionId, seed: `${seed.title} - ${seed.artist}`, count: diversified.length },
      '[radio] session started'
    );

    return reply.send({ sessionId, tracks: diversified, seed });
  });

  /**
   * GET /radio/next
   * Returns the next batch of recommendations for an active session.
   */
  app.get('/radio/next', async (req, reply) => {
    const parsed = NextRadioQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', issues: parsed.error.issues });
    }

    const { sessionId } = parsed.data;
    const session = sessions.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found or expired' });
    }

    // Collect all excluded IDs
    const excludeIds = [
      session.seed.id,
      session.seed.spotifyId ?? '',
      session.seed.youtubeId ?? '',
      ...session.lastTrackIds,
      ...Array.from(session.returnedIds),
    ].filter(Boolean);

    const tracks = await getRecommendations(session.seed as Track, {
      excludeIds,
      limit: BATCH_SIZE * 2,
    });

    // Diversify the radio output
    const diversified = diversifyRadioTracks(tracks, session.seed, BATCH_SIZE);

    // Mark as returned
    diversified.forEach((t) => {
      const key = t.spotifyId ?? t.youtubeId ?? t.id;
      session.returnedIds.add(key);
    });

    session.lastTrackIds = diversified.map((t) => t.id);

    app.log.info(
      { sessionId, count: diversified.length, totalReturned: session.returnedIds.size },
      '[radio] next batch'
    );

    return reply.send({ tracks: diversified });
  });

  /**
   * POST /radio/feedback
   * Record like/dislike feedback for a track in a radio session.
   */
  app.post('/radio/feedback', async (req, reply) => {
    const parsed = RadioFeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', issues: parsed.error.issues });
    }

    const { sessionId, trackId, action } = parsed.data;
    const session = sessions.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found or expired' });
    }

    session.feedback.set(trackId, action);

    // If disliked, add it to the returned IDs so it won't come back
    if (action === 'dislike') {
      session.returnedIds.add(trackId);
    }

    app.log.info(
      { sessionId, trackId, action, totalFeedback: session.feedback.size },
      '[radio] feedback recorded'
    );

    return reply.send({ ok: true });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function diversifyRadioTracks(
  tracks: Track[],
  seed: { artist: string },
  limit: number
): Track[] {
  if (tracks.length === 0) return [];

  const seedArtist = seed.artist.toLowerCase().split(',')[0].trim();
  const seedGroup: Track[] = [];
  const otherTracks: Track[] = [];

  for (const track of tracks) {
    const artist = track.artist.toLowerCase().split(',')[0].trim();
    if (artist === seedArtist) {
      seedGroup.push(track);
    } else {
      otherTracks.push(track);
    }
  }

  const result: Track[] = [];

  // Keep at most 2 from seed artist
  result.push(...seedGroup.slice(0, 2));

  // Interleave from others
  for (const track of otherTracks) {
    if (result.length >= limit) break;
    result.push(track);
  }

  // If we still have room, add remaining seed artist tracks
  if (result.length < limit) {
    result.push(...seedGroup.slice(2, limit - result.length + 2));
  }

  return result.slice(0, limit);
}
