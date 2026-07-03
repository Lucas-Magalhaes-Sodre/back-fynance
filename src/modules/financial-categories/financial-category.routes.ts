import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  createFinancialCategoryController,
  deleteFinancialCategoryController,
  listFinancialCategoriesController,
  updateFinancialCategoryController
} from './financial-category.controller.js';

export async function financialCategoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listFinancialCategoriesController);
  app.post('/', createFinancialCategoryController);
  app.put('/:id', updateFinancialCategoryController);
  app.delete('/:id', deleteFinancialCategoryController);
}
