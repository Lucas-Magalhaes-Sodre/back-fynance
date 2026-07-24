import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../shared/prisma.js';
import { env } from '../../shared/env.js';
import { accessInfo, roleForEmail, trialEndDateWithDays } from '../billing/access.service.js';
import { getDefaultTrialDays } from '../admin/admin.service.js';
import type { ForgotPasswordInput, GoogleLoginInput, LoginInput, RegisterInput } from './auth.schemas.js';

export const LGPD_CONSENT_VERSION = '2026-07-21';

function sanitizeUser(user: {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  occupation?: string | null;
  lgpdAcceptedAt?: Date | null;
  lgpdConsentVersion?: string | null;
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
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? null
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
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? null,
    lastPaymentAt: user.lastPaymentAt ?? null,
    access,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function registerUser(app: FastifyInstance, input: RegisterInput) {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) {
    const error = new Error('E-mail ja cadastrado') as Error & { statusCode: number };
    error.statusCode = 409;
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
      marketingConsent: input.marketingConsent,
      role: roleForEmail(input.email),
      trialEndsAt: trialEndDateWithDays(defaultTrialDays)
    }
  });

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
  });
  const payload = ticket.getPayload();
  const email = payload?.email;
  if (!email || !payload.email_verified) {
    const error = new Error('Conta Google invalida ou e-mail nao verificado') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  const defaultTrialDays = await getDefaultTrialDays();
  const user = existing ?? await prisma.user.create({
    data: {
      name: payload.name ?? email.split('@')[0],
      email,
      password_hash: await bcrypt.hash(`google:${payload.sub}:${Date.now()}`, 10),
      lgpdAcceptedAt: new Date(),
      lgpdConsentVersion: LGPD_CONSENT_VERSION,
      marketingConsent: false,
      role: roleForEmail(email),
      trialEndsAt: trialEndDateWithDays(defaultTrialDays)
    }
  });

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
