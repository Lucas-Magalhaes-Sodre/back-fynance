import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  bulkDeleteFinancialScopeController,
  createFinancialItemController,
  copyFinancialCategoryController,
  dashboardController,
  deleteFinancialCategoryController,
  deleteFinancialItemController,
  listFinancialItemsController,
  paymentSummaryController,
  renameFinancialCategoryController,
  salaryCandidatesController,
  updateCreditCardStatementValueController,
  updateFinancialItemController,
  updateFinancialItemPaymentStatusController,
  updateFinancialItemValueController
} from './financial-item.controller.js';

export async function financialItemRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listFinancialItemsController);
  app.post('/', createFinancialItemController);
  app.post('/copy-category', copyFinancialCategoryController);
  app.delete('/bulk-scope', bulkDeleteFinancialScopeController);
  app.patch('/category', renameFinancialCategoryController);
  app.delete('/category', deleteFinancialCategoryController);
  app.get('/payment-summary', paymentSummaryController);
  app.get('/salary-candidates', salaryCandidatesController);
  app.patch('/credit-card-statement/value', updateCreditCardStatementValueController);
  app.patch('/:id/payment-status', updateFinancialItemPaymentStatusController);
  app.patch('/:id/value', updateFinancialItemValueController);
  app.put('/:id', updateFinancialItemController);
  app.delete('/:id', deleteFinancialItemController);
  app.get('/dashboard/summary', dashboardController);
}
