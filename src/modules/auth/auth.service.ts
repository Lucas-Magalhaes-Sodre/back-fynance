import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../shared/prisma.js';
import { env } from '../../shared/env.js';
import { COOKIES_VERSION, LGPD_CONSENT_VERSION, PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legal.js';
import { accessInfo, roleForEmail, trialEndDateWithDays } from '../billing/access.service.js';
import { getDefaultTrialDays } from '../admin/admin.service.js';
import { ensureReferralCoupon } from '../referrals/referral.service.js';
import type { ForgotPasswordInput, GoogleLoginInput, LoginInput, RegisterInput } from './auth.schemas.js';

function sanitizeUser(user: {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  occupation?: string | null;
  lgpdAcceptedAt?: Date | null;
  lgpdConsentVersion?: string | null;
  termsAcceptedAt?: Date | null;
  termsVersion?: string | null;
  privacyVersion?: string | null;
  cookiesVersion?: string | null;
  marketingConsent?: boolean;
  role?: 'USER' | 'ADMIN';
  subscriptionStatus?: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'BLOCKED' | 'MANUAL';
  trialEndsAt?: Date | null;
  manualAccessUntil?: Date | null;
  accessBlockedAt?: Date | null;
  paymentProvider?: 'NONE' | 'MERCADO_PAGO' | 'STRIPE';
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  subscriptionPlan?: 'FREE' | 'MONTHLY' | 'YEARLY' | 'LIFETIME';
  billingPlanId?: string | null;
  planNameSnapshot?: string | null;
  planPriceSnapshot?: unknown | null;
  planDurationMonthsSnapshot?: number | null;
  planProductKeysSnapshot?: string[] | null;
  planProductLabelsSnapshot?: unknown;
  planIncludedItemsSnapshot?: string[] | null;
  couponCodeSnapshot?: string | null;
  couponDiscountSnapshot?: unknown | null;
  subscriptionCurrentPeriodEnd?: Date | null;
  lastPaymentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const access = accessInfo({
    role: user.role ?? 'USER',
    subscriptionStatus: user.subscriptionStatus ?? 'TRIALING',
    trialEndsAt: user.trialEndsAt ?? null,
    manualAccessUntil: user.manualAccessUntil ?? null,
    accessBlockedAt: user.accessBlockedAt ?? null,
    subscriptionPlan: user.subscriptionPlan ?? 'FREE',
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? null,
    planProductKeysSnapshot: user.planProductKeysSnapshot ?? null
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    city: user.city ?? null,
    occupation: user.occupation ?? null,
    lgpdAcceptedAt: user.lgpdAcceptedAt ?? null,
    lgpdConsentVersion: user.lgpdConsentVersion ?? null,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    termsVersion: user.termsVersion ?? null,
    privacyVersion: user.privacyVersion ?? null,
    cookiesVersion: user.cookiesVersion ?? null,
    marketingConsent: user.marketingConsent ?? false,
    role: user.role ?? 'USER',
    subscriptionStatus: user.subscriptionStatus ?? 'TRIALING',
    trialEndsAt: user.trialEndsAt ?? null,
    manualAccessUntil: user.manualAccessUntil ?? null,
    accessBlockedAt: user.accessBlockedAt ?? null,
    paymentProvider: user.paymentProvider ?? 'NONE',
    providerCustomerId: user.providerCustomerId ?? null,
    providerSubscriptionId: user.providerSubscriptionId ?? null,
    subscriptionPlan: user.subscriptionPlan ?? 'FREE',
    billingPlanId: user.billingPlanId ?? null,
    planNameSnapshot: user.planNameSnapshot ?? null,
    planPriceSnapshot: user.planPriceSnapshot ? Number(user.planPriceSnapshot) : null,
    planDurationMonthsSnapshot: user.planDurationMonthsSnapshot ?? null,
    planProductKeysSnapshot: user.planProductKeysSnapshot ?? [],
    planProductLabelsSnapshot: user.planProductLabelsSnapshot ?? {},
    planIncludedItemsSnapshot: user.planIncludedItemsSnapshot ?? [],
    couponCodeSnapshot: user.couponCodeSnapshot ?? null,
    couponDiscountSnapshot: user.couponDiscountSnapshot ? Number(user.couponDiscountSnapshot) : null,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? null,
    lastPaymentAt: user.lastPaymentAt ?? null,
    access,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function adminLifetimeAccessData() {
  return {
    subscriptionStatus: 'ACTIVE' as const,
    subscriptionPlan: 'LIFETIME' as const,
    trialEndsAt: null,
    manualAccessUntil: null,
    accessBlockedAt: null,
    paymentProvider: 'NONE' as const,
    providerSubscriptionId: null,
    billingPlanId: null,
    planNameSnapshot: 'Vitalício',
    planPriceSnapshot: 0,
    planDurationMonthsSnapshot: null,
    planProductKeysSnapshot: [],
    planProductLabelsSnapshot: {},
    planIncludedItemsSnapshot: [],
    couponCodeSnapshot: null,
    couponDiscountSnapshot: null,
    subscriptionCurrentPeriodEnd: null
  };
}

export async function registerUser(app: FastifyInstance, input: RegisterInput) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) {
    const error = new Error('E-mail ja cadastrado') as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }

  if (roleForEmail(input.email) === 'ADMIN') {
    const error = new Error('Este e-mail administrativo deve entrar com Google para confirmar a posse do e-mail.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const password_hash = await bcrypt.hash(input.password, 10);
  const defaultTrialDays = await getDefaultTrialDays();
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password_hash,
      lgpdAcceptedAt: new Date(),
      lgpdConsentVersion: LGPD_CONSENT_VERSION,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      cookiesVersion: COOKIES_VERSION,
      marketingConsent: input.marketingConsent,
      role: 'USER',
      trialEndsAt: trialEndDateWithDays(defaultTrialDays)
    }
  });
  await ensureReferralCoupon(user.id).catch(() => null);

  const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '7d' });
  return { user: sanitizeUser(user), token };
}

export async function loginUser(app: FastifyInstance, input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    const error = new Error('Credenciais invalidas') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  const validPassword = await bcrypt.compare(input.password, user.password_hash);
  if (!validPassword) {
    const error = new Error('Credenciais invalidas') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '7d' });
  return { user: sanitizeUser(user), token };
}

export async function loginWithGoogle(app: FastifyInstance, input: GoogleLoginInput) {
  if (!env.GOOGLE_CLIENT_ID) {
    const error = new Error('Login com Google nao configurado') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: input.idToken,
    audience: env.GOOGLE_CLIENT_ID
  }).catch(() => {
    const error = new Error('Login com Google invalido. Confira se o Client ID do front e do backend e o mesmo.') as Error & {
      statusCode: number;
    };
    error.statusCode = 401;
    throw error;
  });
  const payload = ticket.getPayload();
  const email = payload?.email;
  if (!email || !payload.email_verified) {
    const error = new Error('Conta Google invalida ou e-mail nao verificado') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  const adminRole = roleForEmail(email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing && input.legalAccepted !== true) {
    const error = new Error('Para criar a conta com Google, aceite os Termos de Uso e a Politica de Privacidade.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  const defaultTrialDays = await getDefaultTrialDays();
  const user = existing
    ? await prisma.user.update({
      where: { id: existing.id },
      data: adminRole === 'ADMIN'
        ? {
          role: 'ADMIN',
          password_hash: await bcrypt.hash(`google-admin:${payload.sub}:${Date.now()}`, 10),
          ...adminLifetimeAccessData()
        }
        : {},
    })
    : await prisma.user.create({
    data: {
      name: payload.name ?? email.split('@')[0],
      email,
      password_hash: await bcrypt.hash(`google:${payload.sub}:${Date.now()}`, 10),
      lgpdAcceptedAt: new Date(),
      lgpdConsentVersion: LGPD_CONSENT_VERSION,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      cookiesVersion: COOKIES_VERSION,
      marketingConsent: false,
      role: adminRole,
      ...(adminRole === 'ADMIN'
        ? adminLifetimeAccessData()
        : { trialEndsAt: trialEndDateWithDays(defaultTrialDays) })
    }
  });
  await ensureReferralCoupon(user.id).catch(() => null);

  const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '7d' });
  return { user: sanitizeUser(user), token };
}

export async function requestPasswordRecovery(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  return {
    message: user
      ? 'Se o e-mail existir, enviaremos instrucoes de recuperacao.'
      : 'Se o e-mail existir, enviaremos instrucoes de recuperacao.'
  };
}
