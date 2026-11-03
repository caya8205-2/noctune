import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getMobileCompanionStatus,
  installCloudflaredBinary,
  startMobileCompanion,
  stopMobileCompanion,
} from '../services/mobileCompanion.js';

const StartMobileBody = z
  .object({
    separateDb: z.boolean().optional(),
    apiKey: z.string().max(256).optional(),
    tunnelMode: z.enum(['quick', 'token']).optional(),
    tunnelToken: z.string().max(2048).optional(),
    customDomain: z.string().max(256).optional(),
  })
  .optional();

export async function mobileRoutes(app: FastifyInstance) {
  // Never expose host process management endpoints inside the spawned :3130 mobile worker itself
  if (process.env.NOCTUNE_MOBILE_INSTANCE === '1') {
    return;
  }

  app.get('/mobile-host/status', async (_req, reply) => {
    return reply.send(getMobileCompanionStatus());
  });

  app.post('/mobile-host/start', async (req, reply) => {
    const parsed = StartMobileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', issues: parsed.error.issues });
    }
    const status = await startMobileCompanion(parsed.data);
    if (status.state === 'error') {
      return reply.status(500).send({ ...status, error: status.lastError || 'Failed to start mobile companion' });
    }
    return reply.send(status);
  });

  app.post('/mobile-host/stop', async (_req, reply) => {
    const status = await stopMobileCompanion();
    return reply.send(status);
  });

  app.post('/mobile-host/install-cloudflared', async (_req, reply) => {
    try {
      await installCloudflaredBinary();
      return reply.send(getMobileCompanionStatus());
    } catch (err) {
      return reply.status(500).send({
        ...getMobileCompanionStatus(),
        error: (err as Error).message,
      });
    }
  });
}
