import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDefaultTrialDays } from '../admin/admin.service.js';
import { checkoutSchema, couponValidationSchema } from './billing.schemas.js';
import { createCheckout, getBillingStatus, listPublicBillingPlans, processMercadoPagoWebhook, validateBillingCoupon } from './billing.service.js';

export async function billingStatusController(request: FastifyRequest, reply: FastifyReply) {
  const billing = await getBillingStatus(request.user.sub);
  return reply.send({ billing });
}

export async function createCheckoutController(request: FastifyRequest, reply: FastifyReply) {
  const data = checkoutSchema.parse(request.body);
  const checkout = await createCheckout(request.user.sub, data);
  return reply.send({ checkout });
}

export async function listPublicBillingPlansController(_request: FastifyRequest, reply: FastifyReply) {
  const plans = await listPublicBillingPlans();
  return reply.send({ plans });
}

export async function validateBillingCouponController(request: FastifyRequest, reply: FastifyReply) {
  const data = couponValidationSchema.parse(request.body);
  const coupon = await validateBillingCoupon(data);
  return reply.send({ coupon });
}

export async function mercadoPagoWebhookController(request: FastifyRequest, reply: FastifyReply) {
  const result = await processMercadoPagoWebhook(request.body, request.query as Record<string, unknown>, request.headers);
  return reply.send(result);
}

export async function billingPublicSettingsController(_request: FastifyRequest, reply: FastifyReply) {
  const defaultTrialDays = await getDefaultTrialDays();
  return reply.send({ settings: { defaultTrialDays } });
}
