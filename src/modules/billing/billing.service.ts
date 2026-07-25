import { PaymentProvider, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { env } from '../../shared/env.js';
import { CANCELLATION_VERSION, PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legal.js';
import { prisma } from '../../shared/prisma.js';
import { accessInfo } from './access.service.js';
import type { CheckoutInput, CouponValidationInput } from './billing.schemas.js';

const mercadoPagoApiUrl = 'https://api.mercadopago.com';

function publicPlan(plan: {
  id: string;
  name: string;
  description: string | null;
  price: unknown;
  currency: string;
  durationMonths: number;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...plan,
    price: Number(plan.price)
  };
}

function legacyPlanCode(durationMonths: number): SubscriptionPlan {
  if (durationMonths >= 12) return 'YEARLY';
  if (durationMonths <= 0) return 'FREE';
  return 'MONTHLY';
}

function normalizeCouponCode(code?: string | null) {
  return (code ?? '').trim().toUpperCase();
}

function applyDiscount(price: number, coupon: { discountType: 'PERCENT' | 'FIXED'; discountValue: unknown }) {
  const discountValue = Number(coupon.discountValue);
  const discount = coupon.discountType === 'PERCENT' ? price * (discountValue / 100) : discountValue;
  const normalizedDiscount = Math.min(price, Math.max(0, discount));
  return {
    discountAmount: Number(normalizedDiscount.toFixed(2)),
    finalPrice: Number(Math.max(0, price - normalizedDiscount).toFixed(2))
  };
}

function subscriptionStatusFromMercadoPago(status?: string): SubscriptionStatus {
  if (status === 'authorized' || status === 'active') return 'ACTIVE';
  if (status === 'cancelled' || status === 'paused') return 'CANCELED';
  if (status === 'pending' || status === 'in_process') return 'PAST_DUE';
  return 'TRIALING';
}

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function stringValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function parseMercadoPagoSignature(signatureHeader: string | undefined) {
  if (!signatureHeader) return null;

  return signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=').map((item) => item.trim());
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

function assertMercadoPagoWebhookSignature(input: {
  body: Record<string, any>;
  query: Record<string, unknown>;
  headers?: IncomingHttpHeaders;
}) {
  if (!env.MERCADO_PAGO_WEBHOOK_SECRET) return;

  const signature = parseMercadoPagoSignature(firstHeaderValue(input.headers?.['x-signature']));
  const requestId = firstHeaderValue(input.headers?.['x-request-id']);
  const timestamp = signature?.ts;
  const receivedSignature = signature?.v1;
  const dataId = stringValue(input.query['data.id'] ?? input.body.data?.id ?? input.query.id);

  if (!requestId || !timestamp || !receivedSignature || !dataId) {
    const error = new Error('Assinatura do Mercado Pago ausente ou incompleta') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const expectedSignature = createHmac('sha256', env.MERCADO_PAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const receivedBuffer = Buffer.from(receivedSignature, 'hex');

  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    const error = new Error('Assinatura do Mercado Pago invalida') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
}

export async function getBillingStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      manualAccessUntil: true,
      accessBlockedAt: true,
      paymentProvider: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
      subscriptionPlan: true,
      billingPlanId: true,
      planNameSnapshot: true,
      planPriceSnapshot: true,
      planDurationMonthsSnapshot: true,
      couponCodeSnapshot: true,
      couponDiscountSnapshot: true,
      subscriptionCurrentPeriodEnd: true,
      lastPaymentAt: true
    }
  });
  if (!user) {
    const error = new Error('Usuario nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  return {
    ...user,
    planPriceSnapshot: user.planPriceSnapshot ? Number(user.planPriceSnapshot) : null,
    couponDiscountSnapshot: user.couponDiscountSnapshot ? Number(user.couponDiscountSnapshot) : null,
    access: accessInfo(user)
  };
}

export async function listPublicBillingPlans() {
  const plans = await prisma.billingPlan.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }, { createdAt: 'asc' }]
  });
  return plans.map(publicPlan);
}

async function resolveCoupon(planId: string, couponCode?: string | null) {
  const code = normalizeCouponCode(couponCode);
  if (!code) return null;

  const now = new Date();
  const coupon = await prisma.billingCoupon.findUnique({ where: { code } });
  if (
    !coupon ||
    !coupon.active ||
    (coupon.startsAt && coupon.startsAt > now) ||
    (coupon.expiresAt && coupon.expiresAt < now) ||
    (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) ||
    (coupon.billingPlanId && coupon.billingPlanId !== planId)
  ) {
    const error = new Error('Cupom invalido ou indisponivel para este plano') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  return coupon;
}

export async function validateBillingCoupon(input: CouponValidationInput) {
  const plan = await prisma.billingPlan.findFirst({ where: { id: input.planId, active: true } });
  if (!plan) {
    const error = new Error('Plano indisponivel') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const coupon = await resolveCoupon(plan.id, input.couponCode);
  if (!coupon) {
    const error = new Error('Informe um cupom') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const price = Number(plan.price);
  const discount = applyDiscount(price, coupon);
  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue),
    originalPrice: price,
    ...discount
  };
}

async function resolveCheckoutPlan(input: CheckoutInput) {
  if (input.planId) {
    const plan = await prisma.billingPlan.findFirst({ where: { id: input.planId, active: true } });
    if (!plan) {
      const error = new Error('Plano indisponivel') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }
    return plan;
  }

  const legacyDurationMonths = input.plan === 'YEARLY' ? 12 : 1;
  const plan = await prisma.billingPlan.findFirst({
    where: { durationMonths: legacyDurationMonths, active: true },
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }]
  });
  if (plan) return plan;

  const error = new Error('Nenhum plano ativo encontrado') as Error & { statusCode: number };
  error.statusCode = 404;
  throw error;
}

async function recordSubscriptionTermsAcceptance(input: {
  userId: string;
  plan: Awaited<ReturnType<typeof resolveCheckoutPlan>>;
  originalPrice: number;
  discount: { discountAmount: number; finalPrice: number };
  couponCode?: string | null;
  provider: PaymentProvider;
  metadata?: { ipAddress?: string; userAgent?: string | string[] };
}) {
  await prisma.subscriptionTermsAcceptance.create({
    data: {
      userId: input.userId,
      billingPlanId: input.plan.id,
      planName: input.plan.name,
      planPrice: input.originalPrice,
      planCurrency: input.plan.currency,
      planDurationMonths: input.plan.durationMonths,
      couponCode: input.couponCode ?? null,
      discountAmount: input.discount.discountAmount,
      finalPrice: input.discount.finalPrice,
      paymentProvider: input.provider,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      cancellationVersion: CANCELLATION_VERSION,
      ipAddress: input.metadata?.ipAddress ?? null,
      userAgent: Array.isArray(input.metadata?.userAgent) ? input.metadata?.userAgent[0] : input.metadata?.userAgent ?? null
    }
  });
}

export async function createCheckout(
  userId: string,
  input: CheckoutInput,
  metadata?: { ipAddress?: string; userAgent?: string | string[] }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const error = new Error('Usuario nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  if (input.provider === 'STRIPE') {
    const error = new Error('Stripe ainda nao configurado. Use Mercado Pago por enquanto.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const plan = await resolveCheckoutPlan(input);
  const coupon = await resolveCoupon(plan.id, input.couponCode);
  const originalPrice = Number(plan.price);
  const discount = coupon ? applyDiscount(originalPrice, coupon) : { discountAmount: 0, finalPrice: originalPrice };
  const legacyCode = legacyPlanCode(plan.durationMonths);
  const configuredPlanUrl =
    legacyCode === 'MONTHLY' ? env.MERCADO_PAGO_MONTHLY_PLAN_URL : legacyCode === 'YEARLY' ? env.MERCADO_PAGO_YEARLY_PLAN_URL : undefined;
  if (configuredPlanUrl && !env.MERCADO_PAGO_ACCESS_TOKEN) {
    await recordSubscriptionTermsAcceptance({
      userId: user.id,
      plan,
      originalPrice,
      discount,
      couponCode: coupon?.code,
      provider: 'MERCADO_PAGO',
      metadata
    });
    return { provider: input.provider, planId: plan.id, planName: plan.name, url: configuredPlanUrl };
  }

  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    const error = new Error('Mercado Pago nao configurado. Informe MERCADO_PAGO_ACCESS_TOKEN no .env.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const frequency = Math.max(1, plan.durationMonths);
  const response = await fetch(`${mercadoPagoApiUrl}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason: `Deluket Finance - ${plan.name}${coupon ? ` - cupom ${coupon.code}` : ''}`,
      external_reference: `${user.id}:${plan.id}:${coupon?.id ?? ''}`,
      payer_email: user.email,
      back_url: `${env.WEB_ORIGIN}/app/billing`,
      auto_recurring: {
        frequency,
        frequency_type: 'months',
        transaction_amount: discount.finalPrice,
        currency_id: 'BRL'
      },
      status: 'pending'
    })
  });

  const data = await response.json() as { id?: string; init_point?: string; message?: string };
  if (!response.ok || !data.init_point) {
    const error = new Error(data.message ?? 'Nao foi possivel criar checkout no Mercado Pago') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      paymentProvider: 'MERCADO_PAGO',
      providerSubscriptionId: data.id ?? null,
      subscriptionPlan: legacyCode,
      billingPlanId: plan.id,
      planNameSnapshot: plan.name,
      planPriceSnapshot: discount.finalPrice,
      planDurationMonthsSnapshot: plan.durationMonths,
      couponCodeSnapshot: coupon?.code,
      couponDiscountSnapshot: coupon ? discount.discountAmount : null
    }
  });

  await recordSubscriptionTermsAcceptance({
    userId: user.id,
    plan,
    originalPrice,
    discount,
    couponCode: coupon?.code,
    provider: 'MERCADO_PAGO',
    metadata
  });

  if (coupon) {
    await prisma.billingCoupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
  }

  return {
    provider: input.provider,
    planId: plan.id,
    planName: plan.name,
    originalPrice,
    discountAmount: discount.discountAmount,
    finalPrice: discount.finalPrice,
    couponCode: coupon?.code ?? null,
    url: data.init_point
  };
}

async function mercadoPagoGet(path: string) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) return null;
  const response = await fetch(`${mercadoPagoApiUrl}${path}`, {
    headers: { Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}` }
  });
  if (!response.ok) return null;
  return response.json() as Promise<Record<string, any>>;
}

export async function processMercadoPagoWebhook(payload: unknown, query: Record<string, unknown>, headers?: IncomingHttpHeaders) {
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, any>;
  assertMercadoPagoWebhookSignature({ body, query, headers });

  const eventType = String(body.type ?? body.action ?? query.type ?? query.topic ?? 'unknown');
  const providerEventId = String(query['data.id'] ?? body.data?.id ?? query.id ?? body.id ?? '');

  let providerPayload: Record<string, any> | null = null;
  const normalizedEventType = eventType.toLowerCase();
  if (providerEventId && normalizedEventType.includes('preapproval')) {
    providerPayload = await mercadoPagoGet(`/preapproval/${providerEventId}`);
  }
  if (providerEventId && normalizedEventType.includes('payment')) {
    providerPayload = await mercadoPagoGet(`/v1/payments/${providerEventId}`);
  }

  await prisma.subscriptionEvent.create({
    data: {
      userId: null,
      provider: 'MERCADO_PAGO',
      eventType,
      providerEventId: providerEventId || null,
      payload: (providerPayload ?? body) as object
    }
  });

  if (!providerPayload) return { ok: true, ignored: true };

  const externalReference = String(providerPayload.external_reference ?? '');
  const [externalUserId, externalPlanId, externalCouponId] = externalReference.split(':');
  const providerSubscriptionId = String(providerPayload?.id ?? providerEventId ?? '');
  const userId = externalUserId || null;

  if (userId) {
    await prisma.subscriptionEvent.updateMany({
      where: {
        provider: 'MERCADO_PAGO',
        providerEventId: providerEventId || null,
        eventType,
        userId: null
      },
      data: { userId }
    });
  }

  if (!userId) return { ok: true };

  const status = subscriptionStatusFromMercadoPago(providerPayload?.status);
  const approvedPayment = providerPayload?.status === 'approved';
  const plan = externalPlanId ? await prisma.billingPlan.findUnique({ where: { id: externalPlanId } }) : null;
  const coupon = externalCouponId ? await prisma.billingCoupon.findUnique({ where: { id: externalCouponId } }) : null;
  const durationMonths = plan?.durationMonths ?? providerPayload?.auto_recurring?.frequency ?? 1;
  const providerAmount = providerPayload?.auto_recurring?.transaction_amount ?? providerPayload?.transaction_amount;
  const finalPrice = providerAmount !== undefined ? Number(providerAmount) : plan ? Number(plan.price) : undefined;
  const originalPrice = plan ? Number(plan.price) : finalPrice;
  const discountAmount = coupon && originalPrice !== undefined && finalPrice !== undefined ? Math.max(0, originalPrice - finalPrice) : undefined;
  await prisma.user.update({
    where: { id: userId },
    data: {
      paymentProvider: 'MERCADO_PAGO',
      providerSubscriptionId: providerSubscriptionId || undefined,
      subscriptionStatus: approvedPayment ? 'ACTIVE' : status,
      subscriptionPlan: legacyPlanCode(durationMonths),
      billingPlanId: plan?.id,
      planNameSnapshot: plan?.name,
      planPriceSnapshot: finalPrice,
      planDurationMonthsSnapshot: plan?.durationMonths,
      couponCodeSnapshot: coupon?.code,
      couponDiscountSnapshot: discountAmount,
      lastPaymentAt: approvedPayment ? new Date() : undefined,
      accessBlockedAt: approvedPayment || status === 'ACTIVE' ? null : undefined
    }
  }).catch(() => null);

  return { ok: true };
}
