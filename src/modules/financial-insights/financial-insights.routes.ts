import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import { financialInsightsController } from './financial-insights.controller.js';

export async function financialInsightsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', financialInsightsController);
}
