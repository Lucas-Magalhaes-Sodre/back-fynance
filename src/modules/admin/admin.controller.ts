import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminReferralCommissionSchema, adminReferralCouponSchema, adminReferralWithdrawalSchema, adminUpdateSubscriptionSchema, anonymizeUserSchema, appSettingsSchema, billingCouponSchema, billingPlanOrderSchema, billingPlanSchema, grantTrialSchema, marketingBannerOrderSchema, marketingBannerSchema } from './admin.schemas.js';
import {
  anonymizeAdminUser,
  assertCanDemoteAdmin,
  createAdminAuditLog,
  createAdminBillingCoupon,
  createAdminBillingPlan,
  deactivateAdminBillingCoupon,
  deactivateAdminBillingPlan,
  getAdminBillingOverview,
  getAppSettings,
  grantTrial,
  listAdminAuditLogs,
  listAdminBillingCoupons,
  listAdminBillingPlans,
  listAdminMarketingBanners,
  listAdminReferralCommissions,
  listAdminReferralCoupons,
  listAdminReferralWithdrawals,
  listAdminUsers,
  listSubscriptionEvents,
  reorderAdminBillingPlans,
  reorderAdminMarketingBanners,
  createAdminMarketingBanner,
  deleteAdminMarketingBanner,
  updateAppSettings,
  updateAdminBillingCoupon,
  updateAdminBillingPlan,
  updateAdminMarketingBanner,
  updateAdminReferralCommission,
  updateAdminReferralCoupon,
  updateAdminReferralWithdrawal,
  updateAdminUserSubscription
} from './admin.service.js';

const userParamsSchema = z.object({ userId: z.string().uuid() });
const planParamsSchema = z.object({ planId: z.string().min(1) });
const couponParamsSchema = z.object({ couponId: z.string().uuid() });
const referralCouponParamsSchema = z.object({ couponId: z.string().uuid() });
const referralCommissionParamsSchema = z.object({ commissionId: z.string().uuid() });
const referralWithdrawalParamsSchema = z.object({ withdrawalId: z.string().uuid() });
const bannerParamsSchema = z.object({ bannerId: z.string().uuid() });
const eventsQuerySchema = z.object({ userId: z.string().uuid().optional() });
const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  subscriptionStatus: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'BLOCKED', 'MANUAL']).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  billingPlanId: z.string().min(1).optional()
});
const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20)
});
const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10)
});

export async function listAdminUsersController(request: FastifyRequest, reply: FastifyReply) {
  const query = usersQuerySchema.parse(request.query);
  const result = await listAdminUsers(query);
  return reply.send(result);
}

export async function listAdminAuditLogsController(request: FastifyRequest, reply: FastifyReply) {
  const query = auditLogsQuerySchema.parse(request.query);
  const result = await listAdminAuditLogs(query);
  return reply.send(result);
}

export async function updateAdminUserSubscriptionController(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = userParamsSchema.parse(request.params);
  const data = adminUpdateSubscriptionSchema.parse(request.body);
  if (data.role === 'USER' && userId === request.user.sub) {
    return reply.status(400).send({ message: 'Voce nao pode remover seu proprio acesso administrativo.' });
  }
  if (data.role === 'USER') {
    await assertCanDemoteAdmin(userId);
  }
  const user = await updateAdminUserSubscription(userId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_USER_SUBSCRIPTION_UPDATE',
    targetType: 'USER',
    targetId: userId,
    payload: data
  });
  return reply.send({ user });
}

export async function grantTrialController(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = userParamsSchema.parse(request.params);
  const data = grantTrialSchema.parse(request.body);
  const user = await grantTrial(userId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_GRANT_TRIAL',
    targetType: 'USER',
    targetId: userId,
    payload: data
  });
  return reply.send({ user });
}

export async function anonymizeAdminUserController(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = userParamsSchema.parse(request.params);
  if (userId === request.user.sub) {
    return reply.status(400).send({ message: 'Voce nao pode anonimizar seu proprio usuario.' });
  }
  const data = anonymizeUserSchema.parse(request.body);
  const user = await anonymizeAdminUser(userId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_USER_ANONYMIZE',
    targetType: 'USER',
    targetId: userId,
    payload: { confirmationEmail: data.confirmationEmail, note: data.note ?? null }
  });
  return reply.send({ user });
}

export async function listSubscriptionEventsController(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = eventsQuerySchema.parse(request.query);
  const events = await listSubscriptionEvents(userId);
  return reply.send({ events });
}

export async function adminBillingOverviewController(_request: FastifyRequest, reply: FastifyReply) {
  const overview = await getAdminBillingOverview();
  return reply.send({ overview });
}

export async function getAppSettingsController(_request: FastifyRequest, reply: FastifyReply) {
  const settings = await getAppSettings();
  return reply.send({ settings });
}

export async function updateAppSettingsController(request: FastifyRequest, reply: FastifyReply) {
  const data = appSettingsSchema.parse(request.body);
  const settings = await updateAppSettings(data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_SETTINGS_UPDATE',
    targetType: 'APP_SETTING',
    targetId: 'DEFAULT_TRIAL_DAYS',
    payload: data
  });
  return reply.send({ settings });
}

export async function listAdminBillingPlansController(_request: FastifyRequest, reply: FastifyReply) {
  const plans = await listAdminBillingPlans();
  return reply.send({ plans });
}

export async function createAdminBillingPlanController(request: FastifyRequest, reply: FastifyReply) {
  const data = billingPlanSchema.parse(request.body);
  const plan = await createAdminBillingPlan(data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_BILLING_PLAN_CREATE',
    targetType: 'BILLING_PLAN',
    targetId: plan.id,
    payload: data
  });
  return reply.status(201).send({ plan });
}

export async function updateAdminBillingPlanController(request: FastifyRequest, reply: FastifyReply) {
  const { planId } = planParamsSchema.parse(request.params);
  const data = billingPlanSchema.parse(request.body);
  const plan = await updateAdminBillingPlan(planId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_BILLING_PLAN_UPDATE',
    targetType: 'BILLING_PLAN',
    targetId: planId,
    payload: data
  });
  return reply.send({ plan });
}

export async function deactivateAdminBillingPlanController(request: FastifyRequest, reply: FastifyReply) {
  const { planId } = planParamsSchema.parse(request.params);
  const plan = await deactivateAdminBillingPlan(planId);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_BILLING_PLAN_DEACTIVATE',
    targetType: 'BILLING_PLAN',
    targetId: planId
  });
  return reply.send({ plan });
}

export async function reorderAdminBillingPlansController(request: FastifyRequest, reply: FastifyReply) {
  const data = billingPlanOrderSchema.parse(request.body);
  const plans = await reorderAdminBillingPlans(data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_BILLING_PLAN_REORDER',
    targetType: 'BILLING_PLAN',
    payload: data
  });
  return reply.send({ plans });
}

export async function listAdminBillingCouponsController(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationQuerySchema.parse(request.query);
  const result = await listAdminBillingCoupons(query);
  return reply.send(result);
}

export async function createAdminBillingCouponController(request: FastifyRequest, reply: FastifyReply) {
  const data = billingCouponSchema.parse(request.body);
  const coupon = await createAdminBillingCoupon(data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_BILLING_COUPON_CREATE',
    targetType: 'BILLING_COUPON',
    targetId: coupon.id,
    payload: data
  });
  return reply.status(201).send({ coupon });
}

export async function updateAdminBillingCouponController(request: FastifyRequest, reply: FastifyReply) {
  const { couponId } = couponParamsSchema.parse(request.params);
  const data = billingCouponSchema.parse(request.body);
  const coupon = await updateAdminBillingCoupon(couponId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_BILLING_COUPON_UPDATE',
    targetType: 'BILLING_COUPON',
    targetId: couponId,
    payload: data
  });
  return reply.send({ coupon });
}

export async function deactivateAdminBillingCouponController(request: FastifyRequest, reply: FastifyReply) {
  const { couponId } = couponParamsSchema.parse(request.params);
  const coupon = await deactivateAdminBillingCoupon(couponId);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_BILLING_COUPON_DEACTIVATE',
    targetType: 'BILLING_COUPON',
    targetId: couponId
  });
  return reply.send({ coupon });
}

export async function listAdminReferralCouponsController(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationQuerySchema.parse(request.query);
  const result = await listAdminReferralCoupons(query);
  return reply.send(result);
}

export async function updateAdminReferralCouponController(request: FastifyRequest, reply: FastifyReply) {
  const { couponId } = referralCouponParamsSchema.parse(request.params);
  const data = adminReferralCouponSchema.parse(request.body);
  const coupon = await updateAdminReferralCoupon(couponId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_REFERRAL_COUPON_UPDATE',
    targetType: 'REFERRAL_COUPON',
    targetId: couponId,
    payload: data
  });
  return reply.send({ coupon });
}

export async function listAdminReferralCommissionsController(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationQuerySchema.parse(request.query);
  const result = await listAdminReferralCommissions(query);
  return reply.send(result);
}

export async function updateAdminReferralCommissionController(request: FastifyRequest, reply: FastifyReply) {
  const { commissionId } = referralCommissionParamsSchema.parse(request.params);
  const data = adminReferralCommissionSchema.parse(request.body);
  const commission = await updateAdminReferralCommission(commissionId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_REFERRAL_COMMISSION_UPDATE',
    targetType: 'REFERRAL_COMMISSION',
    targetId: commissionId,
    payload: data
  });
  return reply.send({ commission });
}

export async function listAdminReferralWithdrawalsController(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationQuerySchema.parse(request.query);
  const result = await listAdminReferralWithdrawals(query);
  return reply.send(result);
}

export async function updateAdminReferralWithdrawalController(request: FastifyRequest, reply: FastifyReply) {
  const { withdrawalId } = referralWithdrawalParamsSchema.parse(request.params);
  const data = adminReferralWithdrawalSchema.parse(request.body);
  const withdrawal = await updateAdminReferralWithdrawal(withdrawalId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_REFERRAL_WITHDRAWAL_UPDATE',
    targetType: 'REFERRAL_WITHDRAWAL',
    targetId: withdrawalId,
    payload: data
  });
  return reply.send({ withdrawal });
}

export async function listAdminMarketingBannersController(request: FastifyRequest, reply: FastifyReply) {
  const query = paginationQuerySchema.parse(request.query);
  const result = await listAdminMarketingBanners(query);
  return reply.send(result);
}

export async function createAdminMarketingBannerController(request: FastifyRequest, reply: FastifyReply) {
  const data = marketingBannerSchema.parse(request.body);
  const banner = await createAdminMarketingBanner(data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_MARKETING_BANNER_CREATE',
    targetType: 'MARKETING_BANNER',
    targetId: banner.id,
    payload: data
  });
  return reply.status(201).send({ banner });
}

export async function updateAdminMarketingBannerController(request: FastifyRequest, reply: FastifyReply) {
  const { bannerId } = bannerParamsSchema.parse(request.params);
  const data = marketingBannerSchema.parse(request.body);
  const banner = await updateAdminMarketingBanner(bannerId, data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_MARKETING_BANNER_UPDATE',
    targetType: 'MARKETING_BANNER',
    targetId: bannerId,
    payload: data
  });
  return reply.send({ banner });
}

export async function reorderAdminMarketingBannersController(request: FastifyRequest, reply: FastifyReply) {
  const data = marketingBannerOrderSchema.parse(request.body);
  const banners = await reorderAdminMarketingBanners(data);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_MARKETING_BANNER_REORDER',
    targetType: 'MARKETING_BANNER',
    payload: data
  });
  return reply.send({ banners });
}

export async function deleteAdminMarketingBannerController(request: FastifyRequest, reply: FastifyReply) {
  const { bannerId } = bannerParamsSchema.parse(request.params);
  const banner = await deleteAdminMarketingBanner(bannerId);
  await createAdminAuditLog({
    actorUserId: request.user.sub,
    action: 'ADMIN_MARKETING_BANNER_DELETE',
    targetType: 'MARKETING_BANNER',
    targetId: bannerId
  });
  return reply.send({ banner });
}
