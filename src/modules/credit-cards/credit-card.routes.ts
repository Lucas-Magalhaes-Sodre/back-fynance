import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  createCreditCardController,
  createCreditCardPurchaseController,
  deleteCreditCardController,
  deleteCreditCardPurchaseController,
  listCreditCardsController,
  updateCreditCardController,
  updateCreditCardPurchaseController
} from './credit-card.controller.js';

export async function creditCardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', listCreditCardsController);
  app.post('/', createCreditCardController);
  app.put('/:id', updateCreditCardController);
  app.delete('/:id', deleteCreditCardController);
  app.post('/purchases', createCreditCardPurchaseController);
  app.put('/purchases/:id', updateCreditCardPurchaseController);
  app.delete('/purchases/:id', deleteCreditCardPurchaseController);
}
