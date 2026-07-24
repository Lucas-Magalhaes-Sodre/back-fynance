import { prisma } from '../../shared/prisma.js';
import { env } from '../../shared/env.js';
import { accessInfo } from '../billing/access.service.js';
import type { AdminUpdateSubscriptionInput, AppSettingsInput, BillingCouponInput, BillingPlanInput, BillingPlanOrderInput, GrantTrialInput } from './admin.schemas.js';

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

function withAccess<T extends Parameters<typeof accessInfo>[0]>(user: T) {
  return {
    ...user,
    planPriceSnapshot: 'planPriceSnapshot' in user && user.planPriceSnapshot ? Number(user.planPriceSnapshot) : null,
    couponDiscountSnapshot: 'couponDiscountSnapshot' in user && user.couponDiscountSnapshot ? Number(user.couponDiscountSnapshot) : null,
    access: accessInfo(user)
  };
}

function serializePlan(plan: {
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
  return { ...plan, price: Number(plan.price) };
}

function serializeCoupon(coupon: {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: unknown;
  active: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  billingPlanId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...coupon, discountValue: Number(coupon.discountValue) };
}

function legacySnapshotPrice(user: { subscriptionPlan: 'FREE' | 'MONTHLY' | 'YEARLY' | 'LIFETIME' }) {
  if (user.subscriptionPlan === 'MONTHLY') return { price: 24.9, duration: 1 };
  if (user.subscriptionPlan === 'YEARLY') return { price: 238.9, duration: 12 };
  return { price: 0, duration: 1 };
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
    couponCodeSnapshot: null,
    couponDiscountSnapshot: null,
    subscriptionCurrentPeriodEnd: null
  };
}

export async function assertAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, subscriptionStatus: true, subscriptionPlan: true }
  });
  if (user?.role === 'ADMIN') {
    if (user.subscriptionStatus !== 'ACTIVE' || user.subscriptionPlan !== 'LIFETIME') {
      await prisma.user.update({
        where: { id: userId },
        data: adminLifetimeAccessData()
      });
    }
    return;
  }
  const error = new Error('Acesso administrativo necessario') as Error & { statusCode: number };
  error.statusCode = 403;
  throw error;
}

export async function assertCanDemoteAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== 'ADMIN') return;

  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount > 1) return;

  const error = new Error('Nao e possivel remover o ultimo administrador do sistema') as Error & { statusCode: number };
  error.statusCode = 400;
  throw error;
}

export async function createAdminAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  payload?: object | null;
}) {
  return prisma.adminAuditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      payload: input.payload ?? undefined
    }
  });
}

export async function listAdminUsers(input: { page: number; pageSize: number }) {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(5, input.pageSize));
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      select: adminUserSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.user.count()
  ]);

  return {
    users: users.map(withAccess),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

export async function listAdminAuditLogs(input: { page: number; pageSize: number }) {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(5, input.pageSize));
  const [logs, total] = await prisma.$transaction([
    prisma.adminAuditLog.findMany({
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.adminAuditLog.count()
  ]);

  return {
    logs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}

export async function getDefaultTrialDays() {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'DEFAULT_TRIAL_DAYS' } });
  const value = Number(setting?.value ?? env.DEFAULT_TRIAL_DAYS);
  return Number.isFinite(value) ? value : env.DEFAULT_TRIAL_DAYS;
}

export async function getAdminBillingOverview() {
  const users = await prisma.user.findMany({ select: adminUserSelect });
  const activeUsers = users.filter((user) => withAccess(user).access.hasPaidAccess);
  const trialUsers = users.filter((user) => withAccess(user).access.hasTrialAccess);
  const plans = await prisma.billingPlan.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] });
  const defaultPlan = plans[0];
  const defaultMonthlyPrice = defaultPlan ? Number(defaultPlan.price) / Math.max(1, defaultPlan.durationMonths) : 0;
  const monthlyRecurringRevenue = activeUsers.reduce((total, user) => {
    const legacy = legacySnapshotPrice(user);
    const price = Number(user.planPriceSnapshot ?? legacy.price);
    const duration = user.planDurationMonthsSnapshot ?? legacy.duration;
    return total + price / Math.max(1, duration);
  }, 0);
  const realizedRevenueEstimate = activeUsers.reduce((total, user) => total + Number(user.planPriceSnapshot ?? legacySnapshotPrice(user).price), 0);

  return {
    usersTotal: users.length,
    activePaidUsers: activeUsers.length,
    trialUsers: trialUsers.length,
    blockedUsers: users.filter((user) => user.subscriptionStatus === 'BLOCKED').length,
    currentMonthlyRecurringRevenue: monthlyRecurringRevenue,
    realizedRevenueEstimate,
    projectedTrialRevenue: trialUsers.length * defaultMonthlyPrice,
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
  const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const nextRole = input.role ?? currentUser?.role ?? 'USER';
  const adminAccessData = nextRole === 'ADMIN' ? adminLifetimeAccessData() : {};
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: input.subscriptionStatus,
      role: input.role,
      trialEndsAt: input.trialEndsAt,
      manualAccessUntil: input.manualAccessUntil,
      accessBlockedAt: input.accessBlockedAt,
      subscriptionPlan: input.subscriptionPlan,
      ...adminAccessData
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

export async function listAdminBillingPlans() {
  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { active: 'desc' }, { price: 'asc' }, { createdAt: 'asc' }]
  });
  return plans.map(serializePlan);
}

export async function createAdminBillingPlan(input: BillingPlanInput) {
  const plan = await prisma.billingPlan.create({
    data: {
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency.toUpperCase(),
      durationMonths: input.durationMonths,
      active: input.active,
      sortOrder: input.sortOrder
    }
  });
  return serializePlan(plan);
}

export async function updateAdminBillingPlan(planId: string, input: BillingPlanInput) {
  const plan = await prisma.billingPlan.update({
    where: { id: planId },
    data: {
      name: input.name,
      description: input.description,
      price: input.price,
      currency: input.currency.toUpperCase(),
      durationMonths: input.durationMonths,
      active: input.active,
      sortOrder: input.sortOrder
    }
  });
  return serializePlan(plan);
}

export async function deactivateAdminBillingPlan(planId: string) {
  const plan = await prisma.billingPlan.update({
    where: { id: planId },
    data: { active: false }
  });
  return serializePlan(plan);
}

export async function reorderAdminBillingPlans(input: BillingPlanOrderInput) {
  await prisma.$transaction(
    input.planIds.map((id, index) =>
      prisma.billingPlan.update({
        where: { id },
        data: { sortOrder: (index + 1) * 10 }
      })
    )
  );
  return listAdminBillingPlans();
}

export async function listAdminBillingCoupons() {
  const coupons = await prisma.billingCoupon.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }]
  });
  return coupons.map(serializeCoupon);
}

export async function createAdminBillingCoupon(input: BillingCouponInput) {
  const coupon = await prisma.billingCoupon.create({
    data: {
      code: input.code.trim().toUpperCase(),
      description: input.description,
      discountType: input.discountType,
      discountValue: input.discountValue,
      active: input.active,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      usageLimit: input.usageLimit,
      billingPlanId: input.billingPlanId
    }
  });
  return serializeCoupon(coupon);
}

export async function updateAdminBillingCoupon(couponId: string, input: BillingCouponInput) {
  const coupon = await prisma.billingCoupon.update({
    where: { id: couponId },
    data: {
      code: input.code.trim().toUpperCase(),
      description: input.description,
      discountType: input.discountType,
      discountValue: input.discountValue,
      active: input.active,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      usageLimit: input.usageLimit,
      billingPlanId: input.billingPlanId
    }
  });
  return serializeCoupon(coupon);
}

export async function deactivateAdminBillingCoupon(couponId: string) {
  const coupon = await prisma.billingCoupon.update({
    where: { id: couponId },
    data: { active: false }
  });
  return serializeCoupon(coupon);
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
