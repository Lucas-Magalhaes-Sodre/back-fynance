import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import { financialCalendarController } from './financial-calendar.controller.js';

export async function financialCalendarRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', financialCalendarController);
}
