import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  adminBillingOverviewController,
  getAppSettingsController,
  grantTrialController,
  listAdminUsersController,
  listSubscriptionEventsController,
  updateAppSettingsController,
  updateAdminUserSubscriptionController
} from './admin.controller.js';
import { assertAdmin } from './admin.service.js';

async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (reply.sent) return;
  await assertAdmin(request.user.sub);
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticateAdmin);

  app.get('/subscriptions/users', listAdminUsersController);
  app.get('/subscriptions/overview', adminBillingOverviewController);
  app.get('/settings', getAppSettingsController);
  app.put('/settings', updateAppSettingsController);
  app.patch('/subscriptions/users/:userId', updateAdminUserSubscriptionController);
  app.post('/subscriptions/users/:userId/grant-trial', grantTrialController);
  app.get('/subscriptions/events', listSubscriptionEventsController);
}
