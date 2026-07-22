import { FinancialGoalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreateFinancialGoalInput,
  ListGoalSavingsInput,
  ListFinancialGoalsInput,
  UpdateFinancialGoalInput
} from './financial-goal.schemas.js';

type Goal = Awaited<ReturnType<typeof prisma.financialGoal.findMany>>[number];
type GoalSaving = Awaited<ReturnType<typeof prisma.savings.findMany>>[number];

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function monthsBetween(start: Date, end: Date) {
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}

function daysBetween(start: Date, end: Date) {
  const startDay = new Date(start);
  const endDay = new Date(end);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((endDay.getTime() - startDay.getTime()) / 86_400_000));
}

function compoundValue(amount: number, monthlyRatePercent: number, fromDate: Date, toDate: Date) {
  if (amount <= 0 || monthlyRatePercent <= 0 || fromDate >= toDate) return amount;
  const monthlyRate = monthlyRatePercent / 100;
  const months = daysBetween(fromDate, toDate) / 30;
  return amount * Math.pow(1 + monthlyRate, months);
}

function periodicContribution(target: number, periods: number, periodRate: number) {
  if (target <= 0 || periods <= 0) return 0;
  if (periodRate <= 0) return target / periods;
  return (target * periodRate) / (Math.pow(1 + periodRate, periods) - 1);
}

function contributionPlan(remainingAmount: number, targetDate: Date | null, monthlyRatePercent: number) {
  if (!targetDate) {
    return { daily: null, weekly: null, monthly: null, daysRemaining: null, weeksRemaining: null, monthsRemaining: null };
  }

  const today = new Date();
  const daysRemaining = daysBetween(today, targetDate);
  const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));
  const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
  if (daysRemaining <= 0) {
    return { daily: remainingAmount, weekly: remainingAmount, monthly: remainingAmount, daysRemaining: 0, weeksRemaining: 0, monthsRemaining: 0 };
  }

  const monthlyRate = monthlyRatePercent / 100;
  const dailyRate = monthlyRate > 0 ? Math.pow(1 + monthlyRate, 1 / 30) - 1 : 0;
  const weeklyRate = monthlyRate > 0 ? Math.pow(1 + monthlyRate, 7 / 30) - 1 : 0;

  return {
    daily: periodicContribution(remainingAmount, daysRemaining, dailyRate),
    weekly: periodicContribution(remainingAmount, weeksRemaining, weeklyRate),
    monthly: periodicContribution(remainingAmount, monthsRemaining, monthlyRate),
    daysRemaining,
    weeksRemaining,
    monthsRemaining
  };
}

function normalizeImages(input: Pick<CreateFinancialGoalInput, 'imageUrl' | 'imageUrls'>) {
  return (input.imageUrls?.length ? input.imageUrls : input.imageUrl ? [input.imageUrl] : [])
    .filter((image) => image.trim())
    .slice(0, 3);
}

async function savingsForGoal(goalId: string, userId: string) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return prisma.savings.findMany({
    where: {
      goalId,
      userId,
      date: { lte: today }
    }
  });
}

function savingsTotals(savings: GoalSaving[], goal: Goal) {
  const today = new Date();
  return savings.reduce(
    (acc, saving) => {
      const amount = toNumber(saving.amount);
      acc.linkedSavings += amount;
      const savingRate = saving.hasYield
        ? toNumber(saving.yieldRateMonthly ?? 0)
        : 0;
      acc.projectedSavings += compoundValue(amount, savingRate, saving.date, today);
      return acc;
    },
    { linkedSavings: 0, projectedSavings: 0 }
  );
}

async function serializeGoal(goal: Goal) {
  const savings = await savingsForGoal(goal.id, goal.userId);
  const { linkedSavings, projectedSavings } = savingsTotals(savings, goal);
  const targetAmount = toNumber(goal.targetAmount);
  const manualCurrentAmount = toNumber(goal.currentAmount);
  const currentAmount = Math.max(manualCurrentAmount, projectedSavings);
  const remainingAmount = Math.max(targetAmount - currentAmount, 0);
  const progressPercent = targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;
  const monthsSinceStart = monthsBetween(goal.startDate, new Date());
  const averageMonthlySavings = linkedSavings / monthsSinceStart;
  const estimatedCompletionMonths = averageMonthlySavings > 0 ? Math.ceil(remainingAmount / averageMonthlySavings) : null;
  const yieldRateMonthly = goal.hasYield ? toNumber(goal.yieldRateMonthly ?? 0) : 0;
  const plan = contributionPlan(remainingAmount, goal.targetDate, yieldRateMonthly);

  return {
    ...goal,
    targetAmount,
    manualCurrentAmount,
    currentAmount,
    linkedSavings,
    projectedSavings,
    remainingAmount,
    progressPercent,
    averageMonthlySavings,
    estimatedCompletionMonths,
    yieldRateMonthly,
    requiredDailySavings: plan.daily,
    requiredWeeklySavings: plan.weekly,
    requiredMonthlySavings: plan.monthly,
    daysRemaining: plan.daysRemaining,
    weeksRemaining: plan.weeksRemaining,
    monthsRemaining: plan.monthsRemaining
  };
}

export async function listFinancialGoals(userId: string, filters: ListFinancialGoalsInput) {
  const goals = await prisma.financialGoal.findMany({
    where: { userId, status: filters.status },
    orderBy: [{ status: 'asc' }, { targetDate: 'asc' }, { createdAt: 'desc' }]
  });

  return Promise.all(goals.map(serializeGoal));
}

export async function createFinancialGoal(userId: string, input: CreateFinancialGoalInput) {
  const goal = await prisma.financialGoal.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount ?? 0,
      startDate: input.startDate,
      targetDate: input.targetDate,
      category: input.category,
      imageUrl: normalizeImages(input)[0] ?? null,
      imageUrls: normalizeImages(input),
      color: input.color?.toUpperCase() ?? '#0F766E',
      hasYield: input.hasYield ?? false,
      yieldRateMonthly: input.hasYield ? input.yieldRateMonthly ?? 0 : null,
      status: input.status ?? FinancialGoalStatus.ACTIVE
    }
  });

  return serializeGoal(goal);
}

export async function updateFinancialGoal(userId: string, id: string, input: UpdateFinancialGoalInput) {
  const existing = await prisma.financialGoal.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Meta financeira nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const goal = await prisma.financialGoal.update({
    where: { id },
    data: {
      ...input,
      imageUrl: input.imageUrls || input.imageUrl !== undefined ? normalizeImages(input)[0] ?? null : undefined,
      imageUrls: input.imageUrls || input.imageUrl !== undefined ? normalizeImages(input) : undefined,
      color: input.color?.toUpperCase(),
      yieldRateMonthly: input.hasYield === false ? null : input.yieldRateMonthly
    }
  });

  return serializeGoal(goal);
}

export async function deleteFinancialGoal(userId: string, id: string) {
  const existing = await prisma.financialGoal.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Meta financeira nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await prisma.financialGoal.delete({ where: { id } });
}

export async function listFinancialGoalSavings(userId: string, goalId: string, filters: ListGoalSavingsInput) {
  const goal = await prisma.financialGoal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) {
    const error = new Error('Meta financeira nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const page = filters.page;
  const limit = filters.limit;
  const skip = (page - 1) * limit;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const where = { userId, goalId };
  const [items, total] = await Promise.all([
    prisma.savings.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      skip,
      take: limit
    }),
    prisma.savings.count({ where })
  ]);

  return {
    items: items.map((saving) => ({
      ...saving,
      amount: toNumber(saving.amount),
      yieldRateMonthly: toNumber(saving.yieldRateMonthly ?? 0),
      countsAsSaved: saving.date <= today
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1
  };
}
