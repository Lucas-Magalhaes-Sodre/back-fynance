import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getMyReferralProgram, listMarketingBanners, requestMyReferralWithdrawal, updateMyReferralCoupon, updateMyReferralPayoutPreference } from './referral.service.js';
import { requestReferralWithdrawalSchema, updateReferralCouponSchema, updateReferralPayoutSchema } from './referral.schemas.js';

const bannersQuerySchema = z.object({
  location: z.string().trim().max(40).optional().default('DASHBOARD')
});

export async function getMyReferralProgramController(request: FastifyRequest, reply: FastifyReply) {
  const referral = await getMyReferralProgram(request.user.sub);
  return reply.send({ referral });
}

export async function updateMyReferralCouponController(request: FastifyRequest, reply: FastifyReply) {
  const data = updateReferralCouponSchema.parse(request.body);
  const coupon = await updateMyReferralCoupon(request.user.sub, data);
  return reply.send({ coupon });
}

export async function updateMyReferralPayoutController(request: FastifyRequest, reply: FastifyReply) {
  const data = updateReferralPayoutSchema.parse(request.body);
  const payout = await updateMyReferralPayoutPreference(request.user.sub, data);
  return reply.send({ payout });
}

export async function requestMyReferralWithdrawalController(request: FastifyRequest, reply: FastifyReply) {
  requestReferralWithdrawalSchema.parse(request.body);
  const withdrawal = await requestMyReferralWithdrawal(request.user.sub);
  return reply.status(201).send({ withdrawal });
}

export async function listMarketingBannersController(request: FastifyRequest, reply: FastifyReply) {
  const { location } = bannersQuerySchema.parse(request.query);
  const banners = await listMarketingBanners(location);
  return reply.send({ banners });
}
