import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  adminBillingOverviewController,
  anonymizeAdminUserController,
  createAdminBillingCouponController,
  createAdminBillingPlanController,
  deactivateAdminBillingCouponController,
  deactivateAdminBillingPlanController,
  getAppSettingsController,
  grantTrialController,
  listAdminAuditLogsController,
  listAdminBillingCouponsController,
  listAdminBillingPlansController,
  listAdminUsersController,
  listSubscriptionEventsController,
  reorderAdminBillingPlansController,
  updateAppSettingsController,
  updateAdminBillingCouponController,
  updateAdminBillingPlanController,
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
  app.get('/audit-logs', listAdminAuditLogsController);
  app.get('/subscriptions/overview', adminBillingOverviewController);
  app.get('/subscriptions/plans', listAdminBillingPlansController);
  app.post('/subscriptions/plans', createAdminBillingPlanController);
  app.put('/subscriptions/plans/order', reorderAdminBillingPlansController);
  app.put('/subscriptions/plans/:planId', updateAdminBillingPlanController);
  app.delete('/subscriptions/plans/:planId', deactivateAdminBillingPlanController);
  app.get('/subscriptions/coupons', listAdminBillingCouponsController);
  app.post('/subscriptions/coupons', createAdminBillingCouponController);
  app.put('/subscriptions/coupons/:couponId', updateAdminBillingCouponController);
  app.delete('/subscriptions/coupons/:couponId', deactivateAdminBillingCouponController);
  app.get('/settings', getAppSettingsController);
  app.put('/settings', updateAppSettingsController);
  app.patch('/subscriptions/users/:userId', updateAdminUserSubscriptionController);
  app.post('/subscriptions/users/:userId/grant-trial', grantTrialController);
  app.post('/subscriptions/users/:userId/anonymize', anonymizeAdminUserController);
  app.get('/subscriptions/events', listSubscriptionEventsController);
}
