import type { FastifyInstance } from 'fastify';
import { createCookieConsentController } from './privacy.controller.js';

export async function privacyRoutes(app: FastifyInstance) {
  app.post('/cookie-consent', createCookieConsentController);
}
