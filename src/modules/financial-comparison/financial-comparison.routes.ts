import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import { financialComparisonController } from './financial-comparison.controller.js';

export async function financialComparisonRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', financialComparisonController);
}
