import { Prisma } from '@prisma/client';
import type { CouponDiscountType, PixKeyType, ReferralCommission, ReferralCoupon, ReferralPayoutPreference } from '@prisma/client';
import { REFERRAL_TERMS_VERSION } from '../../shared/legal.js';
import { prisma } from '../../shared/prisma.js';
import type { UpdateReferralCouponInput, UpdateReferralPayoutInput } from './referral.schemas.js';

const CASH_AVAILABILITY_DAYS = 14;
const MIN_WITHDRAWAL_AMOUNT = 20;

export type CouponResolution =
  | {
    kind: 'PROMOTIONAL';
    id: string;
    code: string;
    description: string | null;
    discountType: CouponDiscountType;
    discountValue: unknown;
  }
  | {
    kind: 'REFERRAL';
    id: string;
    code: string;
    description: string | null;
    discountType: CouponDiscountType;
    discountValue: unknown;
    ownerUserId: string;
    commissionType: CouponDiscountType;
    commissionValue: unknown;
    planCommissions: unknown;
  };

function normalizeCode(code?: string | null) {
  return (code ?? '').trim().toUpperCase();
}

function cleanBaseCode(value: string) {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 14);
  return cleaned || 'DELUKET';
}

function serializeCoupon(coupon: ReferralCoupon) {
  return {
    ...coupon,
    discountValue: Number(coupon.discountValue),
    commissionValue: Number(coupon.commissionValue)
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function maxDate(...dates: Array<Date | null | undefined>) {
  const validDates = dates.filter(Boolean) as Date[];
  return validDates.reduce((latest, date) => date > latest ? date : latest, validDates[0] ?? new Date(0));
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function remainingCommissionAmount(commission: ReferralCommission & { settlements?: Array<{ amount: unknown }> }) {
  const settled = commission.settlements?.reduce((sum, settlement) => sum + toNumber(settlement.amount), 0) ?? 0;
  return Number(Math.max(0, Number(commission.amount) - settled).toFixed(2));
}

function serializeCommission(commission: ReferralCommission & {
  settlements?: Array<{ amount: unknown }>;
  referredUser?: { name: string; email: string };
  billingPlan?: { name: string } | null;
}) {
  return {
    ...commission,
    amount: Number(commission.amount),
    baseAmount: Number(commission.baseAmount),
    settledAmount: Number((commission.settlements?.reduce((sum, settlement) => sum + toNumber(settlement.amount), 0) ?? 0).toFixed(2)),
    remainingAmount: remainingCommissionAmount(commission)
  };
}

export function defaultReferralBanner() {
  const now = new Date();
  return {
    id: 'default-referral-dashboard-banner',
    key: 'referral-dashboard',
    variant: 'REFERRAL',
    title: 'Ganhe comissão indicando o Deluket Finance',
    subtitle: 'Compartilhe seu cupom com amigos, clientes e parceiros. Eles ganham 5% de desconto e você recebe 5% de comissão quando a contratação for confirmada.',
    imageUrl: null,
    ctaLabel: 'Ver meu cupom',
    ctaPath: '/app/profile',
    location: 'DASHBOARD',
    active: true,
    sortOrder: 10,
    createdAt: now,
    updatedAt: now
  };
}

export function isMissingReferralSchemaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2021', 'P2022', 'P2010'].includes(error.code)
  );
}

function referralSchemaUnavailableError() {
  const error = new Error('Estrutura de indicações ainda não está disponível. Aplique as migrations do banco de dados.') as Error & { statusCode: number };
  error.statusCode = 503;
  return error;
}

function commissionForPlan(coupon: Pick<ReferralCoupon, 'commissionType' | 'commissionValue' | 'planCommissions'>, planId?: string | null) {
  const overrides = coupon.planCommissions && typeof coupon.planCommissions === 'object' && !Array.isArray(coupon.planCommissions)
    ? coupon.planCommissions as Record<string, { type?: CouponDiscountType; value?: number | string }>
    : {};
  const override = planId ? overrides[planId] : null;
  return {
    type: override?.type ?? coupon.commissionType,
    value: override?.value !== undefined ? Number(override.value) : Number(coupon.commissionValue)
  };
}

export function calculateReferralCommission(input: {
  coupon: Pick<ReferralCoupon, 'commissionType' | 'commissionValue' | 'planCommissions'>;
  planId?: string | null;
  baseAmount: number;
}) {
  const rule = commissionForPlan(input.coupon, input.planId);
  const amount = rule.type === 'PERCENT' ? input.baseAmount * (rule.value / 100) : rule.value;
  return Number(Math.max(0, amount).toFixed(2));
}

async function codeExists(code: string, exceptCouponId?: string) {
  const [billingCoupon, referralCoupon] = await Promise.all([
    prisma.billingCoupon.findUnique({ where: { code }, select: { id: true } }),
    prisma.referralCoupon.findUnique({ where: { code }, select: { id: true } })
  ]);
  return Boolean(billingCoupon || (referralCoupon && referralCoupon.id !== exceptCouponId));
}

async function uniqueReferralCode(name: string, email: string) {
  const prefix = cleanBaseCode(name || email.split('@')[0] || 'DELUKET');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : String(attempt + 1);
    const code = `${prefix}${suffix}`.slice(0, 24);
    if (!(await codeExists(code))) return code;
  }
  return `DELUKET${Date.now().toString(36).toUpperCase()}`.slice(0, 24);
}

export async function ensureReferralCoupon(userId: string) {
  const existing = await prisma.referralCoupon.findUnique({ where: { userId } });
  if (existing) return serializeCoupon(existing);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true }
  });
  if (!user) {
    const error = new Error('Usuario nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const code = await uniqueReferralCode(user.name, user.email);
  const coupon = await prisma.referralCoupon.create({
    data: {
      userId,
      code,
      discountType: 'PERCENT',
      discountValue: 5,
      commissionType: 'PERCENT',
      commissionValue: 5
    }
  });
  return serializeCoupon(coupon);
}

export async function getMyReferralProgram(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralPayoutPreference: true,
        referralPayoutChangedAt: true,
        referralPixKeyType: true,
        referralPixKey: true,
        referralPixHolderName: true,
        referralTermsAcceptedAt: true,
        referralTermsVersion: true
      }
    });
    const coupon = await ensureReferralCoupon(userId);
    const commissions = await prisma.referralCommission.findMany({
      where: { referrerUserId: userId },
      include: {
        referredUser: { select: { name: true, email: true } },
        billingPlan: { select: { name: true } },
        settlements: { select: { amount: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    const allOpenCommissions = await prisma.referralCommission.findMany({
      where: {
        referrerUserId: userId,
        status: { in: ['PENDING', 'APPROVED'] }
      },
      include: { settlements: { select: { amount: true } } }
    });
    const now = new Date();
    const cashChangedAt = user?.referralPayoutChangedAt;
    const totalOpenAmount = allOpenCommissions.reduce((sum, commission) => sum + remainingCommissionAmount(commission), 0);
    const creditAvailableAmount = Number(totalOpenAmount.toFixed(2));
    const cashAvailableAmount = Number(allOpenCommissions.reduce((sum, commission) => {
      const remaining = remainingCommissionAmount(commission);
      const cashAvailableAt = addDays(maxDate(commission.createdAt, cashChangedAt), CASH_AVAILABILITY_DAYS);
      return cashAvailableAt <= now ? sum + remaining : sum;
    }, 0).toFixed(2));
    const paidSettlements = await prisma.referralCommissionSettlement.aggregate({
      where: { commission: { referrerUserId: userId }, type: 'PIX' },
      _sum: { amount: true }
    });

    return {
      coupon,
      payout: {
        preference: user?.referralPayoutPreference ?? 'CREDIT',
        cashAvailabilityDays: CASH_AVAILABILITY_DAYS,
        minimumWithdrawalAmount: MIN_WITHDRAWAL_AMOUNT,
        pixKeyType: user?.referralPixKeyType ?? null,
        pixKey: user?.referralPixKey ?? null,
        pixHolderName: user?.referralPixHolderName ?? null,
        referralTermsAcceptedAt: user?.referralTermsAcceptedAt ?? null,
        referralTermsVersion: user?.referralTermsVersion ?? null
      },
      summary: {
        totalAmount: commissions.reduce((sum, item) => sum + Number(item.amount), 0),
        pendingAmount: allOpenCommissions.filter((item) => item.status === 'PENDING').reduce((sum, item) => sum + remainingCommissionAmount(item), 0),
        approvedAmount: allOpenCommissions.filter((item) => item.status === 'APPROVED').reduce((sum, item) => sum + remainingCommissionAmount(item), 0),
        paidAmount: Number(paidSettlements._sum.amount ?? 0),
        availableCreditAmount: creditAvailableAmount,
        availableCashAmount: cashAvailableAmount,
        minimumWithdrawalAmount: MIN_WITHDRAWAL_AMOUNT,
        cashAvailabilityDays: CASH_AVAILABILITY_DAYS,
        indications: commissions.length
      },
      commissions: commissions.map(serializeCommission)
    };
  } catch (error) {
    if (isMissingReferralSchemaError(error)) {
      return {
        coupon: {
          id: '',
          userId,
          code: '',
          active: false,
          discountType: 'PERCENT' as const,
          discountValue: 5,
          commissionType: 'PERCENT' as const,
          commissionValue: 5,
          planCommissions: {},
          createdAt: new Date(),
          updatedAt: new Date()
        },
        summary: {
          totalAmount: 0,
          pendingAmount: 0,
          approvedAmount: 0,
          paidAmount: 0,
          availableCreditAmount: 0,
          availableCashAmount: 0,
          minimumWithdrawalAmount: MIN_WITHDRAWAL_AMOUNT,
          cashAvailabilityDays: CASH_AVAILABILITY_DAYS,
          indications: 0
        },
        payout: {
          preference: 'CREDIT' as const,
          cashAvailabilityDays: CASH_AVAILABILITY_DAYS,
          minimumWithdrawalAmount: MIN_WITHDRAWAL_AMOUNT,
          pixKeyType: null,
          pixKey: null,
          pixHolderName: null,
          referralTermsAcceptedAt: null,
          referralTermsVersion: null
        },
        commissions: []
      };
    }
    throw error;
  }
}

export async function updateMyReferralPayoutPreference(userId: string, input: UpdateReferralPayoutInput) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralPayoutPreference: true, referralTermsAcceptedAt: true }
    });
    if (!user) {
      const error = new Error('Usuario nao encontrado') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }
    if (input.preference === 'PIX' && (!input.pixKeyType || !input.pixKey?.trim() || !input.pixHolderName?.trim())) {
      const error = new Error('Informe tipo de chave PIX, chave PIX e nome do titular para receber em dinheiro.') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    if (!user.referralTermsAcceptedAt && !input.referralTermsAccepted) {
      const error = new Error('Aceite os termos do programa de indicacao para alterar a forma de recebimento.') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    const preferenceChanged = user.referralPayoutPreference !== input.preference;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        referralPayoutPreference: input.preference as ReferralPayoutPreference,
        referralPayoutChangedAt: preferenceChanged ? new Date() : undefined,
        referralPixKeyType: input.preference === 'PIX' ? input.pixKeyType as PixKeyType : undefined,
        referralPixKey: input.preference === 'PIX' ? input.pixKey?.trim() : undefined,
        referralPixHolderName: input.preference === 'PIX' ? input.pixHolderName?.trim() : undefined,
        referralTermsAcceptedAt: input.referralTermsAccepted ? new Date() : undefined,
        referralTermsVersion: input.referralTermsAccepted ? REFERRAL_TERMS_VERSION : undefined
      },
      select: {
        referralPayoutPreference: true,
        referralPayoutChangedAt: true,
        referralPixKeyType: true,
        referralPixKey: true,
        referralPixHolderName: true,
        referralTermsAcceptedAt: true,
        referralTermsVersion: true
      }
    });
    return updated;
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function requestMyReferralWithdrawal(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralPayoutPreference: true,
        referralPayoutChangedAt: true,
        referralPixKeyType: true,
        referralPixKey: true,
        referralPixHolderName: true,
        referralTermsAcceptedAt: true
      }
    });
    if (!user) {
      const error = new Error('Usuario nao encontrado') as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }
    if (user.referralPayoutPreference !== 'PIX' || !user.referralPixKeyType || !user.referralPixKey || !user.referralPixHolderName) {
      const error = new Error('Configure seus dados PIX antes de solicitar saque.') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    if (!user.referralTermsAcceptedAt) {
      const error = new Error('Aceite os termos do programa de indicacao antes de solicitar saque.') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    const commissions = await prisma.referralCommission.findMany({
      where: {
        referrerUserId: userId,
        status: { in: ['PENDING', 'APPROVED'] }
      },
      include: { settlements: { select: { amount: true } } },
      orderBy: { createdAt: 'asc' }
    });
    const now = new Date();
    const eligible = commissions
      .map((commission) => ({
        commission,
        remaining: remainingCommissionAmount(commission),
        cashAvailableAt: addDays(maxDate(commission.createdAt, user.referralPayoutChangedAt), CASH_AVAILABILITY_DAYS)
      }))
      .filter((item) => item.remaining > 0 && item.cashAvailableAt <= now);
    const amount = Number(eligible.reduce((sum, item) => sum + item.remaining, 0).toFixed(2));
    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      const error = new Error(`Saque minimo de R$ ${MIN_WITHDRAWAL_AMOUNT.toFixed(2).replace('.', ',')}.`) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const withdrawal = await prisma.$transaction(async (tx) => {
      const created = await tx.referralWithdrawal.create({
        data: {
          userId,
          amount,
          pixKeyType: user.referralPixKeyType!,
          pixKey: user.referralPixKey!,
          pixHolderName: user.referralPixHolderName!
        }
      });
      await tx.referralCommissionSettlement.createMany({
        data: eligible.map((item) => ({
          commissionId: item.commission.id,
          withdrawalId: created.id,
          type: 'PIX',
          amount: item.remaining,
          reference: 'Solicitacao de saque PIX'
        }))
      });
      return created;
    });
    return { ...withdrawal, amount: Number(withdrawal.amount) };
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function applyReferralCreditDiscount(userId: string, checkoutReference: string, maxAmount: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralPayoutPreference: true }
  });
  if (user?.referralPayoutPreference !== 'CREDIT' || maxAmount <= 0) {
    return { amount: 0, settlements: [] as Array<{ commissionId: string; amount: number }> };
  }
  const commissions = await prisma.referralCommission.findMany({
    where: {
      referrerUserId: userId,
      status: { in: ['PENDING', 'APPROVED'] }
    },
    include: { settlements: { select: { amount: true } } },
    orderBy: { createdAt: 'asc' }
  });
  let remainingToUse = maxAmount;
  const settlementDrafts: Array<{ commissionId: string; amount: number }> = [];
  for (const commission of commissions) {
    const available = remainingCommissionAmount(commission);
    if (available <= 0 || remainingToUse <= 0) continue;
    const amount = Number(Math.min(available, remainingToUse).toFixed(2));
    settlementDrafts.push({ commissionId: commission.id, amount });
    remainingToUse = Number((remainingToUse - amount).toFixed(2));
  }
  const amount = Number(settlementDrafts.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  if (amount <= 0) return { amount: 0, settlements: [] };
  await prisma.referralCommissionSettlement.createMany({
    data: settlementDrafts.map((item) => ({
      commissionId: item.commissionId,
      type: 'CREDIT',
      amount: item.amount,
      reference: checkoutReference
    }))
  });
  return { amount, settlements: settlementDrafts };
}

export async function updateMyReferralCoupon(userId: string, input: UpdateReferralCouponInput) {
  try {
    const coupon = await ensureReferralCoupon(userId);
    const code = normalizeCode(input.code);
    if (await codeExists(code, coupon.id)) {
      const error = new Error('Esse nome de cupom ja esta em uso. Escolha outro.') as Error & { statusCode: number };
      error.statusCode = 409;
      throw error;
    }
    const updated = await prisma.referralCoupon.update({
      where: { id: coupon.id },
      data: { code }
    });
    return serializeCoupon(updated);
  } catch (error) {
    if (isMissingReferralSchemaError(error)) throw referralSchemaUnavailableError();
    throw error;
  }
}

export async function listMarketingBanners(location = 'DASHBOARD') {
  try {
    const banners = await prisma.marketingBanner.findMany({
      where: { location, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    return banners.length || location !== 'DASHBOARD' ? banners : [defaultReferralBanner()];
  } catch (error) {
    if (isMissingReferralSchemaError(error)) {
      return location === 'DASHBOARD' ? [defaultReferralBanner()] : [];
    }
    throw error;
  }
}

export async function resolveAnyCoupon(planId: string, couponCode?: string | null, buyerUserId?: string): Promise<CouponResolution | null> {
  const code = normalizeCode(couponCode);
  if (!code) return null;

  const now = new Date();
  const billingCoupon = await prisma.billingCoupon.findUnique({ where: { code } });
  if (billingCoupon) {
    if (
      !billingCoupon.active ||
      (billingCoupon.startsAt && billingCoupon.startsAt > now) ||
      (billingCoupon.expiresAt && billingCoupon.expiresAt < now) ||
      (billingCoupon.usageLimit !== null && billingCoupon.usedCount >= billingCoupon.usageLimit) ||
      (billingCoupon.billingPlanId && billingCoupon.billingPlanId !== planId)
    ) {
      const error = new Error('Cupom invalido ou indisponivel para este plano') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    return {
      kind: 'PROMOTIONAL',
      id: billingCoupon.id,
      code: billingCoupon.code,
      description: billingCoupon.description,
      discountType: billingCoupon.discountType,
      discountValue: billingCoupon.discountValue
    };
  }

  const referralCoupon = await prisma.referralCoupon.findUnique({ where: { code } });
  if (!referralCoupon || !referralCoupon.active) {
    const error = new Error('Cupom invalido ou indisponivel para este plano') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  if (buyerUserId && referralCoupon.userId === buyerUserId) {
    const error = new Error('Voce nao pode usar seu proprio cupom de indicacao.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  return {
    kind: 'REFERRAL',
    id: referralCoupon.id,
    code: referralCoupon.code,
    description: 'Cupom de indicacao',
    discountType: referralCoupon.discountType,
    discountValue: referralCoupon.discountValue,
    ownerUserId: referralCoupon.userId,
    commissionType: referralCoupon.commissionType,
    commissionValue: referralCoupon.commissionValue,
    planCommissions: referralCoupon.planCommissions
  };
}
