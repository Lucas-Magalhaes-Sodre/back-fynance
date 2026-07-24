import { prisma } from '../../shared/prisma.js';
import { env } from '../../shared/env.js';
import { accessInfo } from '../billing/access.service.js';
import type { AdminUpdateSubscriptionInput, AppSettingsInput, GrantTrialInput } from './admin.schemas.js';

const adminUserSelect = {
  id: true,
  name: true,
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
  lastPaymentAt: true,
  createdAt: true,
  updatedAt: true
};

function withAccess<T extends Parameters<typeof accessInfo>[0]>(user: T) {
  return { ...user, access: accessInfo(user) };
}

export async function assertAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === 'ADMIN') return;
  const error = new Error('Acesso administrativo necessario') as Error & { statusCode: number };
  error.statusCode = 403;
  throw error;
}

export async function listAdminUsers() {
  const users = await prisma.user.findMany({
    select: adminUserSelect,
    orderBy: { createdAt: 'desc' },
    take: 300
  });
  return users.map(withAccess);
}

export async function getDefaultTrialDays() {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'DEFAULT_TRIAL_DAYS' } });
  const value = Number(setting?.value ?? env.DEFAULT_TRIAL_DAYS);
  return Number.isFinite(value) ? value : env.DEFAULT_TRIAL_DAYS;
}

export async function getAdminBillingOverview() {
  const users = await prisma.user.findMany({ select: adminUserSelect });
  const monthlyPrice = 24.9;
  const yearlyPrice = 238.9;
  const activeUsers = users.filter((user) => withAccess(user).access.hasPaidAccess);
  const trialUsers = users.filter((user) => withAccess(user).access.hasTrialAccess);
  const monthlyActive = activeUsers.filter((user) => user.subscriptionPlan === 'MONTHLY').length;
  const yearlyActive = activeUsers.filter((user) => user.subscriptionPlan === 'YEARLY').length;
  const projectedTrialRevenue = trialUsers.length * monthlyPrice;

  return {
    usersTotal: users.length,
    activePaidUsers: activeUsers.length,
    trialUsers: trialUsers.length,
    blockedUsers: users.filter((user) => user.subscriptionStatus === 'BLOCKED').length,
    currentMonthlyRecurringRevenue: monthlyActive * monthlyPrice + (yearlyActive * yearlyPrice) / 12,
    realizedRevenueEstimate: monthlyActive * monthlyPrice + yearlyActive * yearlyPrice,
    projectedTrialRevenue,
    defaultTrialDays: await getDefaultTrialDays()
  };
}

export async function updateAppSettings(input: AppSettingsInput) {
  await prisma.appSetting.upsert({
    where: { key: 'DEFAULT_TRIAL_DAYS' },
    create: { key: 'DEFAULT_TRIAL_DAYS', value: input.defaultTrialDays },
    update: { value: input.defaultTrialDays }
  });
  return { defaultTrialDays: input.defaultTrialDays };
}

export async function updateAdminUserSubscription(userId: string, input: AdminUpdateSubscriptionInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: input.subscriptionStatus,
      role: input.role,
      trialEndsAt: input.trialEndsAt,
      manualAccessUntil: input.manualAccessUntil,
      accessBlockedAt: input.accessBlockedAt,
      subscriptionPlan: input.subscriptionPlan
    },
    select: adminUserSelect
  });

  await prisma.subscriptionEvent.create({
    data: {
      userId,
      provider: 'NONE',
      eventType: 'ADMIN_UPDATE',
      payload: { ...input }
    }
  });

  return withAccess(user);
}

export async function grantTrial(userId: string, input: GrantTrialInput) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + input.days);
  return updateAdminUserSubscription(userId, {
    subscriptionStatus: 'TRIALING',
    trialEndsAt,
    accessBlockedAt: null,
    note: input.note
  });
}

export async function listSubscriptionEvents(userId?: string) {
  return prisma.subscriptionEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}
