import { PaymentProvider, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { env } from '../../shared/env.js';
import { prisma } from '../../shared/prisma.js';
import { accessInfo } from './access.service.js';
import type { CheckoutInput } from './billing.schemas.js';

const mercadoPagoApiUrl = 'https://api.mercadopago.com';

function planPrice(plan: SubscriptionPlan) {
  if (plan === 'YEARLY') return 238.9;
  return 24.9;
}

function subscriptionStatusFromMercadoPago(status?: string): SubscriptionStatus {
  if (status === 'authorized' || status === 'active') return 'ACTIVE';
  if (status === 'cancelled' || status === 'paused') return 'CANCELED';
  if (status === 'pending' || status === 'in_process') return 'PAST_DUE';
  return 'TRIALING';
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
      subscriptionCurrentPeriodEnd: true,
      lastPaymentAt: true
    }
  });
  if (!user) {
    const error = new Error('Usuario nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  return { ...user, access: accessInfo(user) };
}

export async function createCheckout(userId: string, input: CheckoutInput) {
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

  const configuredPlanUrl =
    input.plan === 'MONTHLY' ? env.MERCADO_PAGO_MONTHLY_PLAN_URL : env.MERCADO_PAGO_YEARLY_PLAN_URL;
  if (configuredPlanUrl && !env.MERCADO_PAGO_ACCESS_TOKEN) {
    return { provider: input.provider, plan: input.plan, url: configuredPlanUrl };
  }

  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    const error = new Error('Mercado Pago nao configurado. Informe MERCADO_PAGO_ACCESS_TOKEN no .env.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const frequency = input.plan === 'YEARLY' ? 12 : 1;
  const response = await fetch(`${mercadoPagoApiUrl}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason: `Minha Receita - plano ${input.plan === 'YEARLY' ? 'anual' : 'mensal'}`,
      external_reference: user.id,
      payer_email: user.email,
      back_url: `${env.WEB_ORIGIN}/app/billing`,
      auto_recurring: {
        frequency,
        frequency_type: 'months',
        transaction_amount: planPrice(input.plan),
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
      subscriptionPlan: input.plan
    }
  });

  return { provider: input.provider, plan: input.plan, url: data.init_point };
}

async function mercadoPagoGet(path: string) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) return null;
  const response = await fetch(`${mercadoPagoApiUrl}${path}`, {
    headers: { Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}` }
  });
  if (!response.ok) return null;
  return response.json() as Promise<Record<string, any>>;
}

export async function processMercadoPagoWebhook(payload: unknown, query: Record<string, unknown>) {
  const body = payload as Record<string, any>;
  const eventType = String(body.type ?? body.action ?? query.type ?? query.topic ?? 'unknown');
  const providerEventId = String(body.id ?? body.data?.id ?? query.id ?? '');

  let providerPayload: Record<string, any> | null = null;
  if (providerEventId && eventType.includes('preapproval')) {
    providerPayload = await mercadoPagoGet(`/preapproval/${providerEventId}`);
  }
  if (providerEventId && eventType.includes('payment')) {
    providerPayload = await mercadoPagoGet(`/v1/payments/${providerEventId}`);
  }

  const externalReference = String(providerPayload?.external_reference ?? body.external_reference ?? '');
  const providerSubscriptionId = String(providerPayload?.id ?? providerEventId ?? '');
  const userId = externalReference || null;

  await prisma.subscriptionEvent.create({
    data: {
      userId,
      provider: 'MERCADO_PAGO',
      eventType,
      providerEventId: providerEventId || null,
      payload: (providerPayload ?? body) as object
    }
  });

  if (!userId) return { ok: true };

  const status = subscriptionStatusFromMercadoPago(providerPayload?.status);
  const approvedPayment = providerPayload?.status === 'approved';
  await prisma.user.update({
    where: { id: userId },
    data: {
      paymentProvider: 'MERCADO_PAGO',
      providerSubscriptionId: providerSubscriptionId || undefined,
      subscriptionStatus: approvedPayment ? 'ACTIVE' : status,
      subscriptionPlan: providerPayload?.auto_recurring?.frequency === 12 ? 'YEARLY' : undefined,
      lastPaymentAt: approvedPayment ? new Date() : undefined,
      accessBlockedAt: approvedPayment || status === 'ACTIVE' ? null : undefined
    }
  }).catch(() => null);

  return { ok: true };
}
