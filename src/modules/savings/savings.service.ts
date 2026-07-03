import { FinancialItemType, Prisma, RecurrenceType } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreateSavingInput,
  ListSavingsInput,
  SavingsExtractInput,
  SavingsProjectionInput,
  SavingsSummaryInput,
  SavingsTransferInput,
  UpdateSavingInput
} from './savings.schemas.js';

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfTomorrow() {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

function endOfDate(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function savingsMovementType(amount: Prisma.Decimal | number) {
  return toNumber(amount) >= 0 ? 'DEPOSIT' : 'WITHDRAW';
}

function syntheticCategoryId(name: string) {
  return `category:${name}`;
}

function syntheticSubItemId(category: string, title: string) {
  return `subitem:${category}:${title}`;
}

function serializeSaving(saving: {
  id: string;
  userId: string;
  title: string;
  category: string;
  description: string | null;
  amount: Prisma.Decimal;
  date: Date;
  month: number;
  year: number;
  isFixed: boolean;
  recurrenceType: RecurrenceType;
  recurrenceGroupId: string | null;
  goalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...saving, amount: toNumber(saving.amount) };
}

function serializeExtractItem(saving: Awaited<ReturnType<typeof prisma.savings.findMany>>[number]) {
  const amount = toNumber(saving.amount);
  return {
    id: saving.id,
    type: amount >= 0 ? 'DEPOSIT' : 'WITHDRAW',
    amount: Math.abs(amount),
    categoryId: syntheticCategoryId(saving.category),
    categoryName: saving.category,
    subItemId: syntheticSubItemId(saving.category, saving.title),
    subItemName: saving.title,
    description: saving.description,
    registeredAt: saving.createdAt,
    movementDate: saving.date
  };
}

function writeData(input: CreateSavingInput) {
  const isFixed = input.isFixed ?? false;
  const recurrenceType = input.recurrenceType ?? (isFixed ? RecurrenceType.MONTHLY : RecurrenceType.NONE);
  const category = input.category?.trim() || 'Outros';
  return {
    title: input.title,
    category,
    description: input.description,
    amount: input.amount,
    date: input.date,
    month: input.month ?? input.date.getMonth() + 1,
    year: input.year ?? input.date.getFullYear(),
    isFixed,
    recurrenceType,
    recurrenceGroupId: input.recurrenceGroupId ?? (isFixed || recurrenceType !== RecurrenceType.NONE ? `${category}:${input.title}` : null),
    goalId: input.goalId
  };
}

function daysInMonth(yearValue: number, monthValue: number) {
  return new Date(yearValue, monthValue, 0).getDate();
}

function dateForMonthlyOccurrence(yearValue: number, monthValue: number, dayValue: number) {
  const safeDay = Math.min(dayValue, daysInMonth(yearValue, monthValue));
  return new Date(`${yearValue}-${String(monthValue).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}T00:00:00`);
}

function monthCursorValue(yearValue: number, monthValue: number) {
  return yearValue * 12 + monthValue;
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
      category: filters.category,
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

  if (input.recurrenceType === RecurrenceType.MONTHLY && input.recurrenceGeneration) {
    const generation = input.recurrenceGeneration;
    const startCursor = monthCursorValue(generation.startYear, generation.startMonth);
    const endCursor = monthCursorValue(generation.endYear, generation.endMonth);
    const dueDay = input.date.getDate();
    if (endCursor < startCursor) {
      const error = new Error('Periodo final da recorrencia anterior ao periodo inicial') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const category = input.category?.trim() || 'Outros';
    const recurrenceGroupId = input.recurrenceGroupId ?? `${userId}:INVESTMENT:${category}:${input.title}:${Date.now()}`;
    const savings = await prisma.$transaction(
      Array.from({ length: endCursor - startCursor + 1 }, (_, index) => {
        const cursor = startCursor + index;
        const occurrenceYear = Math.floor((cursor - 1) / 12);
        const occurrenceMonth = ((cursor - 1) % 12) + 1;
        const occurrenceDate = dateForMonthlyOccurrence(occurrenceYear, occurrenceMonth, dueDay);
        return prisma.savings.create({
          data: {
            userId,
            ...writeData({
              ...input,
              date: occurrenceDate,
              month: occurrenceMonth,
              year: occurrenceYear,
              category,
              isFixed: true,
              recurrenceType: RecurrenceType.MONTHLY,
              recurrenceGroupId
            })
          }
        });
      })
    );
    return serializeSaving(savings[0]);
  }

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
      ? 'Transferencia do saldo para economias'
      : 'Resgate de economias para o saldo'
  );

  return prisma.$transaction(async (tx) => {
    if (input.direction === 'WITHDRAW_TO_BALANCE') {
      const available = await tx.savings.aggregate({
        where: {
          userId,
          category: input.category?.trim() || 'Outros',
          title: input.title
        },
        _sum: { amount: true }
      });
      if (toNumber(available._sum.amount ?? 0) < input.amount) {
        const error = new Error('Saldo insuficiente para sacar esta economia') as Error & { statusCode: number };
        error.statusCode = 400;
        throw error;
      }
    }

    const saving = await tx.savings.create({
      data: {
        userId,
        title: input.title,
        category: input.category?.trim() || 'Outros',
        description,
        amount: input.direction === 'SAVE_FROM_BALANCE' ? input.amount : -input.amount,
        date,
        month,
        year,
        isFixed: false,
        recurrenceType: RecurrenceType.NONE,
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
          category: 'Economias',
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
    const error = new Error('Economia nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await assertGoalOwnership(userId, input.goalId);

  const saving = await prisma.savings.update({
    where: { id },
    data: {
      title: input.title,
      category: input.category,
      description: input.description,
      amount: input.amount,
      date: input.date,
      month: input.month ?? (input.date ? input.date.getMonth() + 1 : undefined),
      year: input.year ?? (input.date ? input.date.getFullYear() : undefined),
      isFixed: input.isFixed,
      recurrenceType: input.recurrenceType,
      recurrenceGroupId: input.recurrenceGroupId,
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

export async function getSavingsOverview(userId: string) {
  const today = endOfToday();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const [savings, categories, monthItems, monthlySavings] = await Promise.all([
    prisma.savings.findMany({
      where: { userId, date: { lte: today } },
      orderBy: [{ category: 'asc' }, { title: 'asc' }]
    }),
    prisma.financialCategory.findMany({
      where: { userId, type: FinancialItemType.INVESTMENT },
      select: { name: true, color: true }
    }),
    prisma.financialItem.findMany({
      where: { userId, month: currentMonth, year: currentYear },
      select: { amount: true, type: true }
    }),
    prisma.savings.aggregate({
      where: { userId, month: currentMonth, year: currentYear, amount: { gt: 0 } },
      _sum: { amount: true }
    })
  ]);

  const colorMap = new Map(categories.map((category) => [category.name, category.color]));
  const categoryMap = new Map<string, {
    id: string;
    name: string;
    color: string;
    currentSavedBalance: number;
    items: Map<string, { id: string; name: string; currentSavedBalance: number }>;
  }>();

  for (const saving of savings) {
    const amount = toNumber(saving.amount);
    const category = categoryMap.get(saving.category) ?? {
      id: syntheticCategoryId(saving.category),
      name: saving.category,
      color: colorMap.get(saving.category) ?? '#D4A017',
      currentSavedBalance: 0,
      items: new Map()
    };
    category.currentSavedBalance += amount;
    const subItem = category.items.get(saving.title) ?? {
      id: syntheticSubItemId(saving.category, saving.title),
      name: saving.title,
      currentSavedBalance: 0
    };
    subItem.currentSavedBalance += amount;
    category.items.set(saving.title, subItem);
    categoryMap.set(saving.category, category);
  }

  const monthlyIncome = monthItems
    .filter((item) => incomeTypes().includes(item.type))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthlyExpense = monthItems
    .filter((item) => expenseTypes().includes(item.type))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthlyPlannedSavings = toNumber(monthlySavings._sum.amount ?? 0);
  const monthlySavingsOpportunity = monthlyIncome - monthlyExpense - monthlyPlannedSavings;

  return {
    currentSavedBalance: savings.reduce((sum, saving) => sum + toNumber(saving.amount), 0),
    monthlyPlannedSavings,
    monthlySavingsOpportunity: monthlySavingsOpportunity > 0 ? monthlySavingsOpportunity : 0,
    categories: Array.from(categoryMap.values())
      .map((category) => ({
        ...category,
        items: Array.from(category.items.values())
          .filter((item) => item.currentSavedBalance !== 0)
          .sort((a, b) => b.currentSavedBalance - a.currentSavedBalance)
      }))
      .filter((category) => category.currentSavedBalance !== 0 || category.items.length > 0)
      .sort((a, b) => b.currentSavedBalance - a.currentSavedBalance)
  };
}

export async function getSavingsExtract(userId: string, filters: SavingsExtractInput) {
  const page = filters.page;
  const limit = filters.limit;
  const today = endOfToday();
  const tomorrow = startOfTomorrow();
  const dateFilter: Prisma.DateTimeFilter =
    filters.mode === 'current' ? { lte: today } : { gte: tomorrow };

  if (filters.startDate) dateFilter.gte = filters.startDate;
  if (filters.endDate) dateFilter.lte = endOfDate(filters.endDate);

  const where: Prisma.SavingsWhereInput = {
    userId,
    date: dateFilter,
    category: filters.categoryId?.startsWith('category:') ? filters.categoryId.replace(/^category:/, '') : filters.categoryId,
    title: filters.subItemId?.startsWith('subitem:')
      ? filters.subItemId.split(':').slice(2).join(':')
      : filters.subItemId,
    amount:
      filters.movementType === 'DEPOSIT'
        ? { gt: 0 }
        : filters.movementType === 'WITHDRAW'
          ? { lt: 0 }
          : undefined
  };

  const [items, total, balance, futureBalance] = await Promise.all([
    prisma.savings.findMany({
      where,
      orderBy:
        filters.mode === 'future'
          ? [{ date: 'asc' }, { createdAt: 'asc' }]
          : [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.savings.count({ where }),
    prisma.savings.aggregate({
      where: { userId, date: { lte: today } },
      _sum: { amount: true }
    }),
    prisma.savings.aggregate({
      where: { userId, date: { gte: tomorrow } },
      _sum: { amount: true }
    })
  ]);
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return {
    items: items.map(serializeExtractItem),
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    currentSavedBalance: toNumber(balance._sum.amount ?? 0),
    futureProjectedBalance: toNumber(balance._sum.amount ?? 0) + toNumber(futureBalance._sum.amount ?? 0)
  };
}

export async function getSavingsProjection(userId: string, filters: SavingsProjectionInput) {
  const today = endOfToday();
  const tomorrow = startOfTomorrow();
  const targetDate = endOfDate(filters.targetDate);

  if (targetDate <= today) {
    const error = new Error('A data da simulacao precisa ser futura') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const [currentBalance, futureMovements] = await Promise.all([
    prisma.savings.aggregate({
      where: { userId, date: { lte: today } },
      _sum: { amount: true }
    }),
    prisma.savings.findMany({
      where: {
        userId,
        date: {
          gte: tomorrow,
          lte: targetDate
        }
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  const currentSavedBalance = toNumber(currentBalance._sum.amount ?? 0);
  const futureTotal = futureMovements.reduce((sum, saving) => sum + toNumber(saving.amount), 0);

  return {
    targetDate: filters.targetDate,
    currentSavedBalance,
    projectedBalance: currentSavedBalance + futureTotal,
    items: futureMovements.map((saving) => {
      const amount = toNumber(saving.amount);
      return {
        id: saving.id,
        type: amount >= 0 ? 'DEPOSIT' : 'WITHDRAW',
        amount: Math.abs(amount),
        categoryName: saving.category,
        subItemName: saving.title,
        movementDate: saving.date
      };
    })
  };
}

export async function getSavingsSummary(userId: string, filters: SavingsSummaryInput) {
  const today = new Date();
  const [monthSavings, monthSavedOut, accumulatedSavings, currentSavings, futureSavings, monthItems] = await Promise.all([
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
    prisma.savings.aggregate({
      where: { userId, date: { lte: today } },
      _sum: { amount: true }
    }),
    prisma.savings.aggregate({
      where: { userId, date: { gt: today } },
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
    monthlyPlannedSavings: savedOut,
    accumulatedSavings: toNumber(accumulatedSavings._sum.amount ?? 0),
    currentSavings: toNumber(currentSavings._sum.amount ?? 0),
    futureSavings: toNumber(futureSavings._sum.amount ?? 0),
    suggestedSavings: availableBalance > 0 ? availableBalance : 0,
    monthlyIncome,
    monthlyExpense,
    monthlyBalance: availableBalance
  };
}
