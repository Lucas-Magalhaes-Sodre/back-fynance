import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  dayControlController,
  monthControlController,
  weekControlController,
  yearControlByParamController,
  yearControlController,
  yearSummaryController
} from './financial-control.controller.js';

export async function financialControlRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/day', dayControlController);
  app.get('/week', weekControlController);
  app.get('/month', monthControlController);
  app.get('/year', yearControlController);
  app.get('/:year', yearControlByParamController);
  app.get('/summary/:year', yearSummaryController);
}

export async function financialSummaryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.get('/:year', yearSummaryController);
}
