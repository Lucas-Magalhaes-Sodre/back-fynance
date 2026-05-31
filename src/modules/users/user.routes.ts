import type { FastifyInstance } from 'fastify';
import { authenticate } from './authenticate.js';
import { meController } from './user.controller.js';

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: authenticate }, meController);
}

