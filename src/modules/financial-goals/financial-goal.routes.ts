import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  createFinancialGoalController,
  deleteFinancialGoalController,
  listFinancialGoalsController,
  updateFinancialGoalController
} from './financial-goal.controller.js';

export async function financialGoalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listFinancialGoalsController);
  app.post('/', createFinancialGoalController);
  app.put('/:id', updateFinancialGoalController);
  app.delete('/:id', deleteFinancialGoalController);
}
