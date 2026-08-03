import type { FastifyInstance } from 'fastify';
import { authenticate } from '../users/authenticate.js';
import {
  getMyReferralProgramController,
  listMarketingBannersController,
  requestMyReferralWithdrawalController,
  updateMyReferralPayoutController,
  updateMyReferralCouponController
} from './referral.controller.js';

export async function referralRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: authenticate }, getMyReferralProgramController);
  app.patch('/me/coupon', { preHandler: authenticate }, updateMyReferralCouponController);
  app.patch('/me/payout', { preHandler: authenticate }, updateMyReferralPayoutController);
  app.post('/me/withdrawals', { preHandler: authenticate }, requestMyReferralWithdrawalController);
  app.get('/banners', { preHandler: authenticate }, listMarketingBannersController);
}
