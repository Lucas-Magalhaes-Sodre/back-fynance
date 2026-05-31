import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  createFinancialItemController,
  dashboardController,
  deleteFinancialItemController,
  listFinancialItemsController,
  updateFinancialItemController,
  updateFinancialItemValueController
} from './financial-item.controller.js';

export async function financialItemRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listFinancialItemsController);
  app.post('/', createFinancialItemController);
  app.patch('/:id/value', updateFinancialItemValueController);
  app.put('/:id', updateFinancialItemController);
  app.delete('/:id', deleteFinancialItemController);
  app.get('/dashboard/summary', dashboardController);
}
