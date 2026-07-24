import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminUpdateSubscriptionSchema, appSettingsSchema, billingCouponSchema, billingPlanOrderSchema, billingPlanSchema, grantTrialSchema } from './admin.schemas.js';
import {
  assertCanDemoteAdmin,
  createAdminAuditLog,
  createAdminBillingCoupon,
  createAdminBillingPlan,
  deactivateAdminBillingCoupon,
  deactivateAdminBillingPlan,
  getAdminBillingOverview,
  getDefaultTrialDays,
  grantTrial,
  listAdminAuditLogs,
  listAdminBillingCoupons,
  listAdminBillingPlans,
  listAdminUsers,
  listSubscriptionEvents,
  reorderAdminBillingPlans,
  updateAppSettings,
  updateAdminBillingCoupon,
  updateAdminBillingPlan,
  updateAdminUserSubscription
} from './admin.service.js';

const userParamsSchema = z.object({ userId: z.string().uuid() });
const planParamsSchema = z.object({ planId: z.string().min(1) });
const couponParamsSchema = z.object({ couponId: z.string().uuid() });
const eventsQuerySchema = z.object({ userId: z.string().uuid().optional() });
const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20)
});
const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20)
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
  const defaultTrialDays = await getDefaultTrialDays();
  return reply.send({ settings: { defaultTrialDays } });
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

export async function listAdminBillingCouponsController(_request: FastifyRequest, reply: FastifyReply) {
  const coupons = await listAdminBillingCoupons();
  return reply.send({ coupons });
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
