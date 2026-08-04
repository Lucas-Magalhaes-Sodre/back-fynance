import { prisma } from '../../shared/prisma.js';
import { env } from '../../shared/env.js';
import { PLAN_PRODUCT_KEYS, normalizePlanIncludedItems, normalizePlanProductKeys, normalizePlanProductLabels } from '../../shared/plan-products.js';
import { accessInfo } from '../billing/access.service.js';
import { defaultReferralBanner, ensureReferralCoupon, isMissingReferralSchemaError } from '../referrals/referral.service.js';
import type { AdminReferralCommissionInput, AdminReferralCouponInput, AdminReferralWithdrawalInput, AdminUpdateSubscriptionInput, AnonymizeUserInput, AppSettingsInput, BillingCouponInput, BillingPlanInput, BillingPlanOrderInput, GrantTrialInput, MarketingBannerInput, MarketingBannerOrderInput } from './admin.schemas.js';

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
  planProductKeysSnapshot: true,
  planProductLabelsSnapshot: true,
  planIncludedItemsSnapshot: true,
  couponCodeSnapshot: true,
  couponDiscountSnapshot: true,
  subscriptionCurrentPeriodEnd: true,
  lastPaymentAt: true,
  lastSeenAt: true,
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
  originalPrice: unknown | null;
  price: unknown;
  currency: string;
  durationMonths: number;
  productKeys: string[];
  productLabels: unknown;
  includedItems: string[];
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...plan,
    originalPrice: plan.originalPrice ? Number(plan.originalPrice) : null,
    price: Number(plan.price),
    productKeys: normalizePlanProductKeys(plan.productKeys),
    productLabels: normalizePlanProductLabels(plan.productLabels),
    includedItems: normalizePlanIncludedItems(plan.includedItems)
  };
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

function serializeReferralCoupon(coupon: {
  id: string;
  userId: string;
  code: string;
  active: boolean;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: unknown;
  commissionType: 'PERCENT' | 'FIXED';
  commissionValue: unknown;
  planCommissions: unknown;
  createdAt: Date;
  updatedAt: Date;
  user?: { name: string; email: string };
  _count?: { commissions: number };
}) {
  return {
    ...coupon,
    discountValue: Number(coupon.discountValue),
    commissionValue: Number(coupon.commissionValue)
  };
}

function referralSchemaUnavailableError() {
  const error = new Error('Estrutura de indicações ainda não está disponível. Aplique as migrations do banco de dados.') as Error & { statusCode: number };
  error.statusCode = 503;
  return error;
}

function pagination(input: { page: number; pageSize: number }, minimumPageSize = 1) {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(100, Math.max(minimumPageSize, input.pageSize));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

function paginationResult(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

async function ensureDefaultAdminMarketingBanner() {
  const fallback = defaultReferralBanner();
  return prisma.marketingBanner.upsert({
    where: { key: fallback.key },
    update: {},
    create: {
      id: fallback.id,
      key: fallback.key,
      variant: fallback.variant,
      title: fallback.title,
      subtitle: fallback.subtitle,
      imageUrl: fallback.imageUrl,
      ctaLabel: fallback.ctaLabel,
      ctaPath: fallback.ctaPath,
      location: fallback.location,
      active: fallback.active,
      sortOrder: fallback.sortOrder
    }
  });
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
    planProductKeysSnapshot: PLAN_PRODUCT_KEYS,
    planProductLabelsSnapshot: {},
    planIncludedItemsSnapshot: [],
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

export async function listAdminUsers(input: {
  page: number;
  pageSize: number;
  search?: string;
  subscriptionStatus?: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'BLOCKED' | 'MANUAL';
  role?: 'USER' | 'ADMIN';
  billingPlanId?: string;
}) {
  const { page, pageSize, skip, take } = pagination(input, 5);
  const search = input.search?.trim();
  const where = {
    ...(search
      ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } }
        ]
      }
      : {}),
    ...(input.subscriptionStatus ? { subscriptionStatus: input.subscriptionStatus } : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.billingPlanId ? { billingPlanId: input.billingPlanId } : {})
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.user.count({ where })
  ]);

  return {
    users: users.map(withAccess),
    pagination: paginationResult(page, pageSize, total)
  };
}

export async function listAdminAuditLogs(input: { page: number; pageSize: number }) {
  const { page, pageSize, skip, take } = pagination(input, 5);
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
      skip,
      take
    }),
    prisma.adminAuditLog.count()
  ]);

  return {
    logs,
    pagination: paginationResult(page, pageSize, total)
  };
}

export async function getDefaultTrialDays() {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'DEFAULT_TRIAL_DAYS' } });
  const value = Number(setting?.value ?? env.DEFAULT_TRIAL_DAYS);
  return Number.isFinite(value) ? value : env.DEFAULT_TRIAL_DAYS;
}

function normalizeFooterContacts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { contactEmails: [] as string[], contactPhones: [] as string[], contactMessage: '' };
  }
  const data = value as Record<string, unknown>;
  return {
    contactEmails: Array.isArray(data.contactEmails)
      ? data.contactEmails.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [],
    contactPhones: Array.isArray(data.contactPhones)
      ? data.contactPhones.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [],
    contactMessage: typeof data.contactMessage === 'string' ? data.contactMessage : ''
  };
}

export async function getAppSettings() {
  const [defaultTrialDays, footerContactsSetting] = await Promise.all([
    getDefaultTrialDays(),
    prisma.appSetting.findUnique({ where: { key: 'FOOTER_CONTACTS' } })
  ]);
  return {
    defaultTrialDays,
    ...normalizeFooterContacts(footerContactsSetting?.value)
  };
}

export async function getAdminBillingOverview() {
  const users = await prisma.user.findMany({ select: adminUserSelect });
  const activeUsers = users.filter((user) => withAccess(user).access.hasPaidAccess);
  const trialUsers = users.filter((user) => withAccess(user).access.hasTrialAccess);
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const paidThisMonthUsers = users.filter((user) => user.lastPaymentAt && user.lastPaymentAt >= currentMonthStart && user.lastPaymentAt < nextMonthStart);
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
  const currentMonthRevenue = paidThisMonthUsers.reduce((total, user) => total + Number(user.planPriceSnapshot ?? legacySnapshotPrice(user).price), 0);
  const currentMonthMonthlyRevenueIncrease = paidThisMonthUsers.reduce((total, user) => {
    const legacy = legacySnapshotPrice(user);
    const price = Number(user.planPriceSnapshot ?? legacy.price);
    const duration = user.planDurationMonthsSnapshot ?? legacy.duration;
    return total + price / Math.max(1, duration);
  }, 0);

  return {
    usersTotal: users.length,
    activePaidUsers: activeUsers.length,
    trialUsers: trialUsers.length,
    blockedUsers: users.filter((user) => user.subscriptionStatus === 'BLOCKED').length,
    currentMonthlyRecurringRevenue: monthlyRecurringRevenue,
    realizedRevenueEstimate,
    currentMonthRevenue,
    currentMonthNewPaidPlans: paidThisMonthUsers.length,
    currentMonthMonthlyRevenueIncrease,
    projectedTrialRevenue: trialUsers.length * defaultMonthlyPrice,
    defaultTrialDays: await getDefaultTrialDays()
  };
}

export async function updateAppSettings(input: AppSettingsInput) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: 'DEFAULT_TRIAL_DAYS' },
      create: { key: 'DEFAULT_TRIAL_DAYS', value: input.defaultTrialDays },
      update: { value: input.defaultTrialDays }
    }),
    prisma.appSetting.upsert({
      where: { key: 'FOOTER_CONTACTS' },
      create: {
        key: 'FOOTER_CONTACTS',
        value: {
          contactEmails: input.contactEmails,
          contactPhones: input.contactPhones,
          contactMessage: input.contactMessage
        }
      },
      update: {
        value: {
          contactEmails: input.contactEmails,
          contactPhones: input.contactPhones,
          contactMessage: input.contactMessage
        }
      }
    })
  ]);
  return getAppSettings();
}

export async function updateAdminUserSubscription(userId: string, input: AdminUpdateSubscriptionInput) {
  const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const nextRole = input.role ?? currentUser?.role ?? 'USER';
  const lifetimeAccessData =
    nextRole === 'ADMIN' || input.subscriptionPlan === 'LIFETIME'
      ? adminLifetimeAccessData()
      : {};
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: input.subscriptionStatus,
      role: input.role,
      trialEndsAt: input.trialEndsAt,
      manualAccessUntil: input.manualAccessUntil,
      accessBlockedAt: input.accessBlockedAt,
      subscriptionPlan: input.subscriptionPlan,
      subscriptionCurrentPeriodEnd: input.subscriptionCurrentPeriodEnd,
      ...lifetimeAccessData
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

export async function anonymizeAdminUser(userId: string, input: AnonymizeUserInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true }
  });
  if (!user) {
    const error = new Error('Usuario nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  if (user.email.toLowerCase() !== input.confirmationEmail.trim().toLowerCase()) {
    const error = new Error('E-mail de confirmacao nao confere com o usuario selecionado') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  if (user.role === 'ADMIN') {
    await assertCanDemoteAdmin(user.id);
  }

  const anonymizedEmail = `anonimizado-${user.id}@deluket.invalid`;
  const anonymized = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: 'Usuario anonimizado',
      email: anonymizedEmail,
      password_hash: `anonimizado:${user.id}:${Date.now()}`,
      phone: null,
      city: null,
      occupation: null,
      marketingConsent: false,
      dataDeletionRequestedAt: new Date(),
      role: 'USER',
      subscriptionStatus: 'BLOCKED',
      trialEndsAt: null,
      manualAccessUntil: null,
      accessBlockedAt: new Date(),
      paymentProvider: 'NONE',
      providerCustomerId: null,
      providerSubscriptionId: null,
      subscriptionPlan: 'FREE',
      subscriptionCurrentPeriodEnd: null,
      lastPaymentAt: null,
      billingPlanId: null,
      planNameSnapshot: null,
      planPriceSnapshot: null,
      planDurationMonthsSnapshot: null,
      planProductKeysSnapshot: [],
      planProductLabelsSnapshot: {},
      planIncludedItemsSnapshot: [],
      couponCodeSnapshot: null,
      couponDiscountSnapshot: null
    },
    select: adminUserSelect
  });

  await prisma.subscriptionEvent.create({
    data: {
      userId: user.id,
      provider: 'NONE',
      eventType: 'ADMIN_USER_ANONYMIZED',
      payload: { previousEmail: user.email, note: input.note ?? null }
    }
  });

  return withAccess(anonymized);
}

export async function listAdminBillingPlans() {
  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { active: 'desc' }, { price: 'asc' }, { createdAt: 'asc' }]
  });
  return plans.map(serializePlan);
}

export async function createAdminBillingPlan(input: BillingPlanInput) {
  const productKeys = normalizePlanProductKeys(input.productKeys);
  const productLabels = normalizePlanProductLabels(input.productLabels);
  const includedItems = normalizePlanIncludedItems(input.includedItems);
  const plan = await prisma.billingPlan.create({
    data: {
      name: input.name,
      description: input.description,
      originalPrice: input.originalPrice,
      price: input.price,
      currency: input.currency.toUpperCase(),
      durationMonths: input.durationMonths,
      productKeys,
      productLabels,
      includedItems,
      active: input.active,
      sortOrder: input.sortOrder
    }
  });
  return serializePlan(plan);
}

export async function updateAdminBillingPlan(planId: string, input: BillingPlanInput) {
  const productKeys = normalizePlanProductKeys(input.productKeys);
  const productLabels = normalizePlanProductLabels(input.productLabels);
  const includedItems = normalizePlanIncludedItems(input.includedItems);
  const plan = await prisma.billingPlan.update({
    where: { id: planId },
    data: {
      name: input.name,
      description: input.description,
      originalPrice: input.originalPrice,
      price: input.price,
      currency: input.currency.toUpperCase(),
      durationMonths: input.durationMonths,
      productKeys,
      productLabels,
      includedItems,
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

export async function listAdminBillingCoupons(input: { page: number; pageSize: number }) {
  const { page, pageSize, skip, take } = pagination(input);
  const [coupons, total] = await prisma.$transaction([
    prisma.billingCoupon.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      skip,
      take
    }),
    prisma.billingCoupon.count()
  ]);
  return {
    coupons: coupons.map(serializeCoupon),
    pagination: paginationResult(page, pageSize, total)
  };
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

async function referralCodeAvailable(code: string, currentCouponId?: string) {
  const normalizedCode = code.trim().toUpperCase();
  const [billingCoupon, referralCoupon] = await Promise.all([
    prisma.billingCoupon.findUnique({ where: { code: normalizedCode }, select: { id: true } }),
    prisma.referralCoupon.findUnique({ where: { code: normalizedCode }, select: { id: true } })
  ]);
  return !billingCoupon && (!referralCoupon || referralCoupon.id === currentCouponId);
}

export async function listAdminReferralCoupons(input: { page: number; pageSize: number }) {
  try {
    const { page, pageSize, skip, take } = pagination(input);
    const usersWithoutCoupon = await prisma.user.findMany({
      where: { referralCoupon: null },
      select: { id: true }
    });
    await Promise.all(usersWithoutCoupon.map((user) => ensureReferralCoupon(user.id).catch(() => null)));

    const [coupons, total] = await prisma.$transaction([
      prisma.referralCoupon.findMany({
        include: {
          user: { select: { name: true, email: true } },
          _count: { select: { commissions: true } }
        },
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
        skip,
        take
      }),
      prisma.referralCoupon.count()
    ]);
    return {
      coupons: coupons.map(serializeReferralCoupon),
      pagination: paginationResult(page, pageSize, total)
    };
  } catch (error) {
    if (isMissingReferralSchemaError(error)) return { coupons: [], pagination: paginationResult(1, input.pageSize, 0) };
    throw error;
  }
}

export async function updateAdminReferralCoupon(couponId: string, input: AdminReferralCouponInput) {
  try {
    const code = input.code.trim().toUpperCase();
    if (!(await referralCodeAvailable(code, couponId))) {
      const error = new Error('Esse nome de cupom ja esta em uso.') as Error & { statusCode: number };
      error.statusCode = 409;
      throw error;
    }
    const coupon = await prisma.referralCoupon.update({
      where: { id: couponId },
      data: {
        code,
        active: input.active,
        discountType: input.discountType,
        discountValue: input.discountValue,
        commissionType: input.commissionType,
        commissionValue: input.commissionValue,
        planCommissions: input.planCommissions
      },
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { commissions: true } }
      }
    });
    return serializeReferralCoupon(coupon);
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function listAdminReferralCommissions(input: { page: number; pageSize: number }) {
  try {
    const { page, pageSize, skip, take } = pagination(input);
    const [commissions, total] = await prisma.$transaction([
      prisma.referralCommission.findMany({
        include: {
          referrerUser: { select: { name: true, email: true } },
          referredUser: { select: { name: true, email: true } },
          billingPlan: { select: { name: true } },
          referralCoupon: { select: { code: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.referralCommission.count()
    ]);
    return {
      commissions: commissions.map((commission) => ({
        ...commission,
        amount: Number(commission.amount),
        baseAmount: Number(commission.baseAmount)
      })),
      pagination: paginationResult(page, pageSize, total)
    };
  } catch (error) {
    if (isMissingReferralSchemaError(error)) return { commissions: [], pagination: paginationResult(1, input.pageSize, 0) };
    throw error;
  }
}

export async function updateAdminReferralCommission(commissionId: string, input: AdminReferralCommissionInput) {
  try {
    const commission = await prisma.referralCommission.update({
      where: { id: commissionId },
      data: {
        status: input.status,
        notes: input.notes
      },
      include: {
        referrerUser: { select: { name: true, email: true } },
        referredUser: { select: { name: true, email: true } },
        billingPlan: { select: { name: true } },
        referralCoupon: { select: { code: true } }
      }
    });
    return {
      ...commission,
      amount: Number(commission.amount),
      baseAmount: Number(commission.baseAmount)
    };
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function listAdminReferralWithdrawals(input: { page: number; pageSize: number }) {
  try {
    const { page, pageSize, skip, take } = pagination(input);
    const [withdrawals, total] = await prisma.$transaction([
      prisma.referralWithdrawal.findMany({
        include: {
          user: { select: { name: true, email: true } },
          settlements: { select: { id: true } }
        },
        orderBy: { requestedAt: 'desc' },
        skip,
        take
      }),
      prisma.referralWithdrawal.count()
    ]);
    return {
      withdrawals: withdrawals.map((withdrawal) => ({
        ...withdrawal,
        amount: Number(withdrawal.amount),
        settlementsCount: withdrawal.settlements.length
      })),
      pagination: paginationResult(page, pageSize, total)
    };
  } catch (error) {
    if (isMissingReferralSchemaError(error)) return { withdrawals: [], pagination: paginationResult(1, input.pageSize, 0) };
    throw error;
  }
}

export async function updateAdminReferralWithdrawal(withdrawalId: string, input: AdminReferralWithdrawalInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.status === 'CANCELED') {
        await tx.referralCommissionSettlement.deleteMany({ where: { withdrawalId } });
      }
      const withdrawal = await tx.referralWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: input.status,
          paidAt: input.status === 'PAID' ? new Date() : undefined,
          canceledAt: input.status === 'CANCELED' ? new Date() : undefined,
          adminNotes: input.adminNotes
        },
        include: {
          user: { select: { name: true, email: true } },
          settlements: { select: { id: true } }
        }
      });
      return {
        ...withdrawal,
        amount: Number(withdrawal.amount),
        settlementsCount: withdrawal.settlements.length
      };
    });
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

async function listAllAdminMarketingBanners() {
  return prisma.marketingBanner.findMany({
    orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
}

export async function listAdminMarketingBanners(input: { page: number; pageSize: number }) {
  try {
    const { page, pageSize, skip, take } = pagination(input);
    await ensureDefaultAdminMarketingBanner();
    const [banners, total] = await prisma.$transaction([
      prisma.marketingBanner.findMany({
        orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip,
        take
      }),
      prisma.marketingBanner.count()
    ]);
    return { banners, pagination: paginationResult(page, pageSize, total) };
  } catch (error) {
    if (isMissingReferralSchemaError(error)) return { banners: [], pagination: paginationResult(1, input.pageSize, 0) };
    throw error;
  }
}

export async function deleteAdminMarketingBanner(bannerId: string) {
  try {
    return await prisma.marketingBanner.delete({
      where: { id: bannerId }
    });
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function createAdminMarketingBanner(input: MarketingBannerInput) {
  try {
    const banner = await prisma.marketingBanner.create({
      data: {
        key: `banner-${Date.now()}`,
        variant: input.variant,
        title: input.title,
        subtitle: input.subtitle,
        imageUrl: input.imageUrl,
        ctaLabel: input.ctaLabel,
        ctaPath: input.ctaPath,
        location: input.location,
        active: input.active,
        sortOrder: input.sortOrder
      }
    });
    return banner;
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function updateAdminMarketingBanner(bannerId: string, input: MarketingBannerInput) {
  try {
    return await prisma.marketingBanner.update({
      where: { id: bannerId },
      data: input
    });
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function reorderAdminMarketingBanners(input: MarketingBannerOrderInput) {
  try {
    await prisma.$transaction(
      input.bannerIds.map((id, index) =>
        prisma.marketingBanner.update({
          where: { id },
          data: { sortOrder: (index + 1) * 10 }
        })
      )
    );
    return listAllAdminMarketingBanners();
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
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
