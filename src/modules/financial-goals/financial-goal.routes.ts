import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  createFinancialGoalController,
  deleteFinancialGoalController,
  listFinancialGoalSavingsController,
  listFinancialGoalsController,
  updateFinancialGoalController
} from './financial-goal.controller.js';

export async function financialGoalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listFinancialGoalsController);
  app.get('/:id/savings', listFinancialGoalSavingsController);
  app.post('/', createFinancialGoalController);
  app.put('/:id', updateFinancialGoalController);
  app.delete('/:id', deleteFinancialGoalController);
}
