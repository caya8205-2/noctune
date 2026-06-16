import type { FastifyInstance } from 'fastify';
import { getLatestReleaseUpdate } from '../services/updateChecker.js';

export async function updateRoutes(app: FastifyInstance) {
  app.get('/updates/latest', async (req, reply) => {
    const force = (req.query as { force?: string }).force === 'true';
    return reply.send(await getLatestReleaseUpdate(force));
  });
}
