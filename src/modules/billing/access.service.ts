import type { SubscriptionPlan, SubscriptionStatus, UserRole } from '@prisma/client';
import { env } from '../../shared/env.js';
import { PLAN_PRODUCT_KEYS, hasPlanProductAccess, normalizePlanProductKeys } from '../../shared/plan-products.js';

export function trialEndDate(from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + env.DEFAULT_TRIAL_DAYS);
  return date;
}

export function trialEndDateWithDays(days: number, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date;
}

export function roleForEmail(email: string): UserRole {
  const adminEmails = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase()) ? 'ADMIN' : 'USER';
}

export function accessInfo(user: {
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  manualAccessUntil: Date | null;
  accessBlockedAt: Date | null;
  subscriptionPlan?: SubscriptionPlan | null;
  subscriptionCurrentPeriodEnd: Date | null;
  planProductKeysSnapshot?: string[] | null;
}) {
  const now = new Date();
  const isAdmin = user.role === 'ADMIN';
  const hasManualAccess = Boolean(user.manualAccessUntil && user.manualAccessUntil >= now);
  const hasTrialAccess = Boolean(user.trialEndsAt && user.trialEndsAt >= now);
  const hasLifetimeAccess = user.subscriptionStatus === 'ACTIVE' && user.subscriptionPlan === 'LIFETIME';
  const hasPaidAccess =
    user.subscriptionStatus === 'ACTIVE' &&
    (hasLifetimeAccess || Boolean(user.subscriptionCurrentPeriodEnd && user.subscriptionCurrentPeriodEnd >= now));
  const canAccess =
    isAdmin ||
    (!user.accessBlockedAt &&
      user.subscriptionStatus !== 'BLOCKED' &&
      (hasPaidAccess || hasTrialAccess || hasManualAccess));

  return {
    canAccess,
    isAdmin,
    hasManualAccess,
    hasTrialAccess,
    hasPaidAccess,
    productKeys: isAdmin || !hasPaidAccess ? PLAN_PRODUCT_KEYS : normalizePlanProductKeys(user.planProductKeysSnapshot),
    reason: canAccess
      ? null
      : user.subscriptionStatus === 'PAST_DUE'
        ? 'PAYMENT_PAST_DUE'
        : user.subscriptionStatus === 'CANCELED'
          ? 'SUBSCRIPTION_CANCELED'
          : 'ACCESS_EXPIRED'
  };
}

export function canAccessProduct(user: Parameters<typeof accessInfo>[0], productKey: string) {
  const access = accessInfo(user);
  if (!access.canAccess) return false;
  if (access.isAdmin || access.hasTrialAccess || access.hasManualAccess) return true;
  if (!access.hasPaidAccess) return true;
  return hasPlanProductAccess({ productKey, productKeys: user.planProductKeysSnapshot });
}
