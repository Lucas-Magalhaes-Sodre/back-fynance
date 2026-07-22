import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  createFinancialReminderController,
  deleteFinancialReminderController,
  listFinancialRemindersController,
  updateFinancialReminderController
} from './financial-reminder.controller.js';

export async function financialReminderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listFinancialRemindersController);
  app.post('/', createFinancialReminderController);
  app.put('/:id', updateFinancialReminderController);
  app.delete('/:id', deleteFinancialReminderController);
}
