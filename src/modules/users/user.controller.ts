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
  planProductKeysSnapshot: true,
  planProductLabelsSnapshot: true,
  planIncludedItemsSnapshot: true,
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
  subscriptionPlan?: Parameters<typeof accessInfo>[0]['subscriptionPlan'];
  subscriptionCurrentPeriodEnd: Date | null;
  planPriceSnapshot?: unknown | null;
  planProductKeysSnapshot?: string[] | null;
  [key: string]: unknown;
}) {
  return {
    ...user,
    planPriceSnapshot: user.planPriceSnapshot ? Number(user.planPriceSnapshot) : null,
    couponDiscountSnapshot: user.couponDiscountSnapshot ? Number(user.couponDiscountSnapshot) : null,
    access: accessInfo(user)
  };
}

function money(value: unknown) {
  return value == null ? null : Number(value);
}

function dateIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function dateOnly(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
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
    creditCardPurchases,
    reminders
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: userSelect }),
    prisma.financialCategory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { name: true, type: true, color: true }
    }),
    prisma.financialItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        title: true,
        name: true,
        description: true,
        amount: true,
        type: true,
        category: true,
        dueDate: true,
        paymentDate: true,
        status: true,
        dueDay: true,
        isFixed: true,
        recurrenceType: true,
        excludedFromTotals: true,
        linkedCreditCardInstallments: true,
        linkedCreditCardAmount: true,
        date: true,
        month: true,
        year: true
      }
    }),
    prisma.savings.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        title: true,
        category: true,
        color: true,
        description: true,
        amount: true,
        date: true,
        month: true,
        year: true,
        isFixed: true,
        recurrenceType: true,
        isInitialBalance: true,
        hasYield: true,
        yieldRateMonthly: true,
        goal: { select: { title: true } }
      }
    }),
    prisma.financialGoal.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        title: true,
        description: true,
        targetAmount: true,
        currentAmount: true,
        startDate: true,
        targetDate: true,
        category: true,
        imageUrls: true,
        color: true,
        hasYield: true,
        yieldRateMonthly: true,
        status: true
      }
    }),
    prisma.creditCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        dueDay: true,
        creditLimit: true,
        isActive: true,
        color: true
      }
    }),
    prisma.creditCardPurchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        title: true,
        description: true,
        amount: true,
        purchaseDate: true,
        installments: true,
        skippedInstallments: true,
        card: { select: { name: true } }
      }
    }),
    prisma.financialReminder.findMany({
      where: { userId },
      orderBy: { remindAt: 'asc' },
      select: {
        title: true,
        message: true,
        remindAt: true,
        offsetDays: true,
        status: true,
        sentAt: true,
        financialItem: { select: { name: true, category: true, date: true } },
        saving: { select: { title: true, category: true, date: true } }
      }
    })
  ]);

  if (!user) {
    return reply.status(404).send({ message: 'Usuario nao encontrado' });
  }

  return reply
    .header('Content-Disposition', 'attachment; filename="deluket-finance-dados.json"')
    .send({
      exportedAt: new Date().toISOString(),
      exportType: 'portabilidade-lgpd',
      note: 'Arquivo com dados fornecidos pelo titular e dados gerados pelo uso da conta. Campos tecnicos internos, ids e metadados de banco foram omitidos.',
      privacy: {
        legalBasis: 'Execucao de contrato e consentimento do titular',
        consentVersion: user.lgpdConsentVersion,
        lgpdAcceptedAt: dateIso(user.lgpdAcceptedAt),
        termsAcceptedAt: dateIso(user.termsAcceptedAt),
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
        cookiesVersion: user.cookiesVersion,
        marketingConsent: user.marketingConsent
      },
      account: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        city: user.city,
        occupation: user.occupation,
        dataDeletionRequestedAt: dateIso(user.dataDeletionRequestedAt),
        plan: {
          name: user.planNameSnapshot ?? user.subscriptionPlan,
          status: user.subscriptionStatus,
          trialEndsAt: dateIso(user.trialEndsAt),
          manualAccessUntil: dateIso(user.manualAccessUntil),
          currentPeriodEnd: dateIso(user.subscriptionCurrentPeriodEnd),
          lastPaymentAt: dateIso(user.lastPaymentAt)
        }
      },
      data: {
        categories: categories.map((category) => ({
          name: category.name,
          type: category.type,
          color: category.color
        })),
        financialEntries: financialItems.map((item) => ({
          title: item.title,
          name: item.name,
          description: item.description,
          amount: money(item.amount),
          type: item.type,
          category: item.category,
          date: dateOnly(item.date),
          month: item.month,
          year: item.year,
          dueDate: dateOnly(item.dueDate),
          paymentDate: dateOnly(item.paymentDate),
          status: item.status,
          dueDay: item.dueDay,
          isRecurring: item.isFixed,
          recurrenceType: item.recurrenceType,
          excludedFromTotals: item.excludedFromTotals,
          paidWithCreditCard: Boolean(item.linkedCreditCardInstallments || item.linkedCreditCardAmount),
          creditCardInstallments: item.linkedCreditCardInstallments,
          creditCardAmount: money(item.linkedCreditCardAmount)
        })),
        savings: savings.map((saving) => ({
          title: saving.title,
          category: saving.category,
          color: saving.color,
          description: saving.description,
          amount: money(saving.amount),
          date: dateOnly(saving.date),
          month: saving.month,
          year: saving.year,
          isRecurring: saving.isFixed,
          recurrenceType: saving.recurrenceType,
          isInitialBalance: saving.isInitialBalance,
          linkedGoal: saving.goal?.title ?? null,
          hasYield: saving.hasYield,
          yieldRateMonthly: money(saving.yieldRateMonthly)
        })),
        financialGoals: goals.map((goal) => ({
          title: goal.title,
          description: goal.description,
          targetAmount: money(goal.targetAmount),
          currentAmount: money(goal.currentAmount),
          startDate: dateOnly(goal.startDate),
          targetDate: dateOnly(goal.targetDate),
          category: goal.category,
          images: goal.imageUrls,
          color: goal.color,
          hasYield: goal.hasYield,
          yieldRateMonthly: money(goal.yieldRateMonthly),
          status: goal.status
        })),
        creditCards: creditCards.map((card) => ({
          name: card.name,
          dueDay: card.dueDay,
          creditLimit: money(card.creditLimit),
          isActive: card.isActive,
          color: card.color
        })),
        creditCardPurchases: creditCardPurchases.map((purchase) => ({
          title: purchase.title,
          description: purchase.description,
          amount: money(purchase.amount),
          purchaseDate: dateOnly(purchase.purchaseDate),
          installments: purchase.installments,
          skippedInstallments: purchase.skippedInstallments,
          cardName: purchase.card.name
        })),
        reminders: reminders.map((reminder) => ({
          title: reminder.title,
          message: reminder.message,
          remindAt: dateIso(reminder.remindAt),
          offsetDays: reminder.offsetDays,
          status: reminder.status,
          sentAt: dateIso(reminder.sentAt),
          relatedTo: reminder.financialItem
            ? {
              type: 'financial-entry',
              name: reminder.financialItem.name,
              category: reminder.financialItem.category,
              date: dateOnly(reminder.financialItem.date)
            }
            : reminder.saving
              ? {
                type: 'saving',
                name: reminder.saving.title,
                category: reminder.saving.category,
                date: dateOnly(reminder.saving.date)
              }
              : null
        }))
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
