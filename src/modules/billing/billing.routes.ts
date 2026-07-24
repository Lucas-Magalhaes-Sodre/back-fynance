import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  billingPublicSettingsController,
  billingStatusController,
  createCheckoutController,
  mercadoPagoWebhookController
} from './billing.controller.js';

export async function billingRoutes(app: FastifyInstance) {
  app.get('/public-settings', billingPublicSettingsController);
  app.get('/me', { preHandler: authenticate }, billingStatusController);
  app.post('/checkout', { preHandler: authenticate }, createCheckoutController);
  app.post('/webhooks/mercado-pago', mercadoPagoWebhookController);
}
