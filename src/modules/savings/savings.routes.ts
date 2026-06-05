import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  createSavingController,
  deleteSavingController,
  listSavingsController,
  savingsSummaryController,
  savingsTransferController,
  updateSavingController
} from './savings.controller.js';

export async function savingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listSavingsController);
  app.post('/', createSavingController);
  app.get('/summary', savingsSummaryController);
  app.post('/transfer', savingsTransferController);
  app.put('/:id', updateSavingController);
  app.delete('/:id', deleteSavingController);
}
