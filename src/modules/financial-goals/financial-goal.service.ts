import { FinancialGoalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreateFinancialGoalInput,
  ListFinancialGoalsInput,
  UpdateFinancialGoalInput
} from './financial-goal.schemas.js';

type Goal = Awaited<ReturnType<typeof prisma.financialGoal.findMany>>[number];

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function monthsBetween(start: Date, end: Date) {
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
}

async function savingsTotal(goalId: string, userId: string) {
  const result = await prisma.savings.aggregate({
    where: { goalId, userId },
    _sum: { amount: true }
  });
  return toNumber(result._sum.amount ?? 0);
}

async function serializeGoal(goal: Goal) {
  const linkedSavings = await savingsTotal(goal.id, goal.userId);
  const targetAmount = toNumber(goal.targetAmount);
  const manualCurrentAmount = toNumber(goal.currentAmount);
  const currentAmount = Math.max(manualCurrentAmount, linkedSavings);
  const remainingAmount = Math.max(targetAmount - currentAmount, 0);
  const progressPercent = targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;
  const monthsSinceStart = monthsBetween(goal.startDate, new Date());
  const averageMonthlySavings = linkedSavings / monthsSinceStart;
  const estimatedCompletionMonths = averageMonthlySavings > 0 ? Math.ceil(remainingAmount / averageMonthlySavings) : null;

  return {
    ...goal,
    targetAmount,
    currentAmount,
    linkedSavings,
    remainingAmount,
    progressPercent,
    averageMonthlySavings,
    estimatedCompletionMonths
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
    data: input
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
