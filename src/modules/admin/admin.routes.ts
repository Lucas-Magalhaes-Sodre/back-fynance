import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  adminBillingOverviewController,
  anonymizeAdminUserController,
  createAdminBillingCouponController,
  createAdminBillingPlanController,
  createAdminMarketingBannerController,
  deleteAdminMarketingBannerController,
  deactivateAdminBillingCouponController,
  deactivateAdminBillingPlanController,
  getAppSettingsController,
  grantTrialController,
  listAdminAuditLogsController,
  listAdminBillingCouponsController,
  listAdminBillingPlansController,
  listAdminMarketingBannersController,
  listAdminReferralCommissionsController,
  listAdminReferralCouponsController,
  listAdminReferralWithdrawalsController,
  listAdminUsersController,
  listSubscriptionEventsController,
  reorderAdminBillingPlansController,
  reorderAdminMarketingBannersController,
  updateAppSettingsController,
  updateAdminBillingCouponController,
  updateAdminBillingPlanController,
  updateAdminMarketingBannerController,
  updateAdminReferralCommissionController,
  updateAdminReferralCouponController,
  updateAdminReferralWithdrawalController,
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
  app.get('/referrals/coupons', listAdminReferralCouponsController);
  app.put('/referrals/coupons/:couponId', updateAdminReferralCouponController);
  app.get('/referrals/commissions', listAdminReferralCommissionsController);
  app.put('/referrals/commissions/:commissionId', updateAdminReferralCommissionController);
  app.get('/referrals/withdrawals', listAdminReferralWithdrawalsController);
  app.put('/referrals/withdrawals/:withdrawalId', updateAdminReferralWithdrawalController);
  app.get('/marketing-banners', listAdminMarketingBannersController);
  app.post('/marketing-banners', createAdminMarketingBannerController);
  app.put('/marketing-banners/order', reorderAdminMarketingBannersController);
  app.put('/marketing-banners/:bannerId', updateAdminMarketingBannerController);
  app.delete('/marketing-banners/:bannerId', deleteAdminMarketingBannerController);
  app.get('/settings', getAppSettingsController);
  app.put('/settings', updateAppSettingsController);
  app.patch('/subscriptions/users/:userId', updateAdminUserSubscriptionController);
  app.post('/subscriptions/users/:userId/grant-trial', grantTrialController);
  app.post('/subscriptions/users/:userId/anonymize', anonymizeAdminUserController);
  app.get('/subscriptions/events', listSubscriptionEventsController);
}
