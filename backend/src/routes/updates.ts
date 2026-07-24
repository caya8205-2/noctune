import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getLatestReleaseUpdate } from '../services/updateChecker.js';

export async function updateRoutes(app: FastifyInstance) {
  app.get('/updates/latest', async (req, reply) => {
    const force = (req.query as { force?: string }).force === 'true';
    return reply.send(await getLatestReleaseUpdate(force));
  });

  app.get('/changelog', async (_req, reply) => {
    const possiblePaths = [
      path.resolve(process.cwd(), 'CHANGELOG.md'),
      path.resolve(process.cwd(), '..', 'CHANGELOG.md'),
      path.resolve(process.cwd(), 'backend', '..', 'CHANGELOG.md'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return reply.send({ content: fs.readFileSync(p, 'utf-8') });
      }
    }
    return reply.send({ content: '# Changelog\n\nNo changelog file found.' });
  });
}
