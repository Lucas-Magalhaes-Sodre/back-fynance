import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  deactivatePushTokenController,
  dispatchDuePushRemindersController,
  registerPushTokenController
} from './push-notification.controller.js';

export async function pushNotificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post('/tokens', registerPushTokenController);
  app.delete('/tokens', deactivatePushTokenController);
  app.post('/dispatch-due', dispatchDuePushRemindersController);
}
