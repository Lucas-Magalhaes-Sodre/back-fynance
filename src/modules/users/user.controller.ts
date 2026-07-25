import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { COOKIES_VERSION, LGPD_CONSENT_VERSION, PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legal.js';
import { accessInfo } from '../billing/access.service.js';

const profileSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  occupation: z.string().optional().nullable()
});

const privacyConsentSchema = z.object({
  lgpdAccepted: z.literal(true),
  marketingConsent: z.boolean().optional().default(false)
});

const deleteAccountSchema = z.object({
  password: z.string().min(1)
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  city: true,
  occupation: true,
  lgpdAcceptedAt: true,
  lgpdConsentVersion: true,
  termsAcceptedAt: true,
  termsVersion: true,
  privacyVersion: true,
  cookiesVersion: true,
  marketingConsent: true,
  dataDeletionRequestedAt: true,
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
  lastPaymentAt: true,
  createdAt: true,
  updatedAt: true
};

function serializeUser(user: {
  role: Parameters<typeof accessInfo>[0]['role'];
  subscriptionStatus: Parameters<typeof accessInfo>[0]['subscriptionStatus'];
  trialEndsAt: Date | null;
  manualAccessUntil: Date | null;
  accessBlockedAt: Date | null;
  subscriptionCurrentPeriodEnd: Date | null;
  planPriceSnapshot?: unknown | null;
  [key: string]: unknown;
}) {
  return {
    ...user,
    planPriceSnapshot: user.planPriceSnapshot ? Number(user.planPriceSnapshot) : null,
    couponDiscountSnapshot: user.couponDiscountSnapshot ? Number(user.couponDiscountSnapshot) : null,
    access: accessInfo(user)
  };
}

export async function meController(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: userSelect
  });

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  return reply.send({ user: serializeUser(user) });
}

export async function updateProfileController(request: FastifyRequest, reply: FastifyReply) {
  const data = profileSchema.parse(request.body);
  const user = await prisma.user.update({
    where: { id: request.user.sub },
    data,
    select: userSelect
  });

  return reply.send({ user: serializeUser(user) });
}

export async function updatePrivacyConsentController(request: FastifyRequest, reply: FastifyReply) {
  const data = privacyConsentSchema.parse(request.body);
  const user = await prisma.user.update({
    where: { id: request.user.sub },
    data: {
      lgpdAcceptedAt: new Date(),
      lgpdConsentVersion: LGPD_CONSENT_VERSION,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      cookiesVersion: COOKIES_VERSION,
      marketingConsent: data.marketingConsent
    },
    select: userSelect
  });

  return reply.send({ user: serializeUser(user) });
}

export async function exportMyDataController(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.sub;
  const [
    user,
    categories,
    financialItems,
    savings,
    goals,
    creditCards,
    creditCardPurchases
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: userSelect }),
    prisma.financialCategory.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.financialItem.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.savings.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.financialGoal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.creditCardPurchase.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  ]);

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  return reply
    .header('Content-Disposition', 'attachment; filename="deluket-finance-dados.json"')
    .send({
      exportedAt: new Date().toISOString(),
      privacy: {
        legalBasis: 'Execucao de contrato e consentimento do titular',
        consentVersion: user.lgpdConsentVersion,
        lgpdAcceptedAt: user.lgpdAcceptedAt,
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
        cookiesVersion: user.cookiesVersion,
        marketingConsent: user.marketingConsent
      },
      user,
      data: {
        categories,
        financialItems,
        savings,
        goals,
        creditCards,
        creditCardPurchases
      }
    });
}

export async function deleteMyAccountController(request: FastifyRequest, reply: FastifyReply) {
  const data = deleteAccountSchema.parse(request.body);
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { id: true, password_hash: true }
  });

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  const validPassword = await bcrypt.compare(data.password, user.password_hash);
  if (!validPassword) {
    return reply.status(401).send({ message: 'Senha invalida' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { dataDeletionRequestedAt: new Date() }
  });
  await prisma.user.delete({ where: { id: user.id } });

  return reply.status(204).send();
}
