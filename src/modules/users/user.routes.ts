import type { FastifyInstance } from 'fastify';
import { authenticate } from './authenticate.js';
import {
  deleteMyAccountController,
  exportMyDataController,
  meController,
  updatePrivacyConsentController,
  updateProfileController
} from './user.controller.js';

export async function userRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: authenticate }, meController);
  app.put('/me', { preHandler: authenticate }, updateProfileController);
  app.put('/me/privacy-consent', { preHandler: authenticate }, updatePrivacyConsentController);
  app.get('/me/export', { preHandler: authenticate }, exportMyDataController);
  app.delete('/me', { preHandler: authenticate }, deleteMyAccountController);
}
