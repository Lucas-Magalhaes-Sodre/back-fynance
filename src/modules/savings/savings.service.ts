import { FinancialItemType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreateSavingInput,
  ListSavingsInput,
  SavingsSummaryInput,
  SavingsTransferInput,
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
  return [FinancialItemType.INCOME];
}

function expenseTypes(): FinancialItemType[] {
  return [FinancialItemType.EXPENSE];
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

export async function transferSavings(userId: string, input: SavingsTransferInput) {
  await assertGoalOwnership(userId, input.goalId);

  const date = input.date;
  const month = input.month ?? date.getMonth() + 1;
  const year = input.year ?? date.getFullYear();
  const description = input.description ?? (
    input.direction === 'SAVE_FROM_BALANCE'
      ? 'Transferencia do saldo para economias/investimentos'
      : 'Resgate de economias/investimentos para o saldo'
  );

  return prisma.$transaction(async (tx) => {
    const saving = await tx.savings.create({
      data: {
        userId,
        title: input.title,
        description,
        amount: input.direction === 'SAVE_FROM_BALANCE' ? input.amount : -input.amount,
        date,
        month,
        year,
        goalId: input.goalId
      }
    });

    let income = null;
    if (input.direction === 'WITHDRAW_TO_BALANCE') {
      income = await tx.financialItem.create({
        data: {
          userId,
          title: input.title,
          name: input.title,
          description,
          amount: input.amount,
          type: FinancialItemType.INCOME,
          category: 'Resgate de economias/investimentos',
          date,
          paymentDate: date,
          status: 'PAGO',
          month,
          year,
          isFixed: false,
          recurrenceType: 'NONE'
        }
      });
    }

    return {
      saving: serializeSaving(saving),
      income: income ? { ...income, amount: toNumber(income.amount) } : null
    };
  });
}

export async function updateSaving(userId: string, id: string, input: UpdateSavingInput) {
  const existing = await prisma.savings.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Economia/investimento nao encontrada') as Error & { statusCode: number };
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
    const error = new Error('Economia/investimento nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await prisma.savings.delete({ where: { id } });
}

export async function getSavingsSummary(userId: string, filters: SavingsSummaryInput) {
  const [monthSavings, monthSavedOut, accumulatedSavings, monthItems] = await Promise.all([
    prisma.savings.aggregate({
      where: { userId, month: filters.month, year: filters.year },
      _sum: { amount: true }
    }),
    prisma.savings.aggregate({
      where: { userId, month: filters.month, year: filters.year, amount: { gt: 0 } },
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
  const monthlySavings = toNumber(monthSavings._sum.amount ?? 0);
  const savedOut = toNumber(monthSavedOut._sum.amount ?? 0);
  const availableBalance = balance - savedOut;

  return {
    monthlyRegisteredSavings: monthlySavings,
    accumulatedSavings: toNumber(accumulatedSavings._sum.amount ?? 0),
    suggestedSavings: availableBalance > 0 ? availableBalance : 0,
    monthlyIncome,
    monthlyExpense,
    monthlyBalance: availableBalance
  };
}
