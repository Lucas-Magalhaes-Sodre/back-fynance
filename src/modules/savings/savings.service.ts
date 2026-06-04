import { FinancialItemType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreateSavingInput,
  ListSavingsInput,
  SavingsSummaryInput,
  UpdateSavingInput
} from './savings.schemas.js';

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function serializeSaving(saving: {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  amount: Prisma.Decimal;
  date: Date;
  month: number;
  year: number;
  goalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...saving, amount: toNumber(saving.amount) };
}

function writeData(input: CreateSavingInput) {
  return {
    title: input.title,
    description: input.description,
    amount: input.amount,
    date: input.date,
    month: input.month ?? input.date.getMonth() + 1,
    year: input.year ?? input.date.getFullYear(),
    goalId: input.goalId
  };
}

function incomeTypes(): FinancialItemType[] {
  return [FinancialItemType.INCOME, FinancialItemType.FIXED_INCOME, FinancialItemType.EXTRA_INCOME];
}

function expenseTypes(): FinancialItemType[] {
  return [FinancialItemType.EXPENSE, FinancialItemType.FIXED_EXPENSE, FinancialItemType.EXTRA_EXPENSE];
}

async function assertGoalOwnership(userId: string, goalId?: string | null) {
  if (!goalId) return;

  const goal = await prisma.financialGoal.findFirst({ where: { id: goalId, userId } });
  if (!goal) {
    const error = new Error('Meta financeira nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
}

export async function listSavings(userId: string, filters: ListSavingsInput) {
  const savings = await prisma.savings.findMany({
    where: {
      userId,
      month: filters.month,
      year: filters.year,
      goalId: filters.goalId,
      date: {
        gte: filters.startDate,
        lte: filters.endDate
      }
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });

  return savings.map(serializeSaving);
}

export async function createSaving(userId: string, input: CreateSavingInput) {
  await assertGoalOwnership(userId, input.goalId);

  const saving = await prisma.savings.create({
    data: {
      userId,
      ...writeData(input)
    }
  });

  return serializeSaving(saving);
}

export async function updateSaving(userId: string, id: string, input: UpdateSavingInput) {
  const existing = await prisma.savings.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Economia nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await assertGoalOwnership(userId, input.goalId);

  const saving = await prisma.savings.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      amount: input.amount,
      date: input.date,
      month: input.month ?? (input.date ? input.date.getMonth() + 1 : undefined),
      year: input.year ?? (input.date ? input.date.getFullYear() : undefined),
      goalId: input.goalId
    }
  });

  return serializeSaving(saving);
}

export async function deleteSaving(userId: string, id: string) {
  const existing = await prisma.savings.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Economia nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await prisma.savings.delete({ where: { id } });
}

export async function getSavingsSummary(userId: string, filters: SavingsSummaryInput) {
  const [monthSavings, accumulatedSavings, monthItems] = await Promise.all([
    prisma.savings.aggregate({
      where: { userId, month: filters.month, year: filters.year },
      _sum: { amount: true }
    }),
    prisma.savings.aggregate({
      where: { userId },
      _sum: { amount: true }
    }),
    prisma.financialItem.findMany({
      where: { userId, month: filters.month, year: filters.year },
      select: { amount: true, type: true }
    })
  ]);

  const monthlyIncome = monthItems
    .filter((item) => incomeTypes().includes(item.type))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthlyExpense = monthItems
    .filter((item) => expenseTypes().includes(item.type))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const balance = monthlyIncome - monthlyExpense;

  return {
    monthlyRegisteredSavings: toNumber(monthSavings._sum.amount ?? 0),
    accumulatedSavings: toNumber(accumulatedSavings._sum.amount ?? 0),
    suggestedSavings: balance > 0 ? balance : 0,
    monthlyIncome,
    monthlyExpense,
    monthlyBalance: balance
  };
}
