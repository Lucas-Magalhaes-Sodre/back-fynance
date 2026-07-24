import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDefaultTrialDays } from '../admin/admin.service.js';
import { checkoutSchema } from './billing.schemas.js';
import { createCheckout, getBillingStatus, processMercadoPagoWebhook } from './billing.service.js';

export async function billingStatusController(request: FastifyRequest, reply: FastifyReply) {
  const billing = await getBillingStatus(request.user.sub);
  return reply.send({ billing });
}

export async function createCheckoutController(request: FastifyRequest, reply: FastifyReply) {
  const data = checkoutSchema.parse(request.body);
  const checkout = await createCheckout(request.user.sub, data);
  return reply.send({ checkout });
}

export async function mercadoPagoWebhookController(request: FastifyRequest, reply: FastifyReply) {
  const result = await processMercadoPagoWebhook(request.body, request.query as Record<string, unknown>);
  return reply.send(result);
}

export async function billingPublicSettingsController(_request: FastifyRequest, reply: FastifyReply) {
  const defaultTrialDays = await getDefaultTrialDays();
  return reply.send({ settings: { defaultTrialDays } });
}
