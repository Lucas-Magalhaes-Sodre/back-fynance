import { FinancialItemType, Prisma, RecurrenceType } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import {
  SAVINGS_REDEMPTION_INCOME_CATEGORY,
  SAVINGS_REDEMPTION_INCOME_ITEM
} from '../../shared/system-categories.js';
import type {
  CreateSavingInput,
  ListSavingsInput,
  SavingsExtractInput,
  SavingsDeleteGroupInput,
  SavingsProjectionInput,
  SavingsSummaryInput,
  SavingsTransferInput,
  SavingsUpdateGroupInput,
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

function startOfCurrentMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfCurrentMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
}

function endOfDate(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function daysBetween(start: Date, end: Date) {
  const startDay = new Date(start);
  const endDay = new Date(end);
  startDay.setHours(0, 0, 0, 0);
  endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((endDay.getTime() - startDay.getTime()) / 86_400_000));
}

function projectedSavingAmount(saving: {
  amount: Prisma.Decimal | number;
  date: Date;
  hasYield: boolean;
  yieldRateMonthly: Prisma.Decimal | number | null;
}) {
  const amount = toNumber(saving.amount);
  const rate = saving.hasYield ? toNumber(saving.yieldRateMonthly ?? 0) / 100 : 0;
  if (amount <= 0 || rate <= 0) return amount;
  const months = daysBetween(saving.date, new Date()) / 30;
  return amount * Math.pow(1 + rate, months);
}

function savingsMovementType(amount: Prisma.Decimal | number) {
  return toNumber(amount) >= 0 ? 'DEPOSIT' : 'WITHDRAW';
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
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
  color: string;
  description: string | null;
  amount: Prisma.Decimal;
  date: Date;
  month: number;
  year: number;
  isFixed: boolean;
  recurrenceType: RecurrenceType;
  recurrenceGroupId: string | null;
  isInitialBalance: boolean;
  goalId: string | null;
  hasYield: boolean;
  yieldRateMonthly: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...saving, amount: toNumber(saving.amount), yieldRateMonthly: toNumber(saving.yieldRateMonthly ?? 0) };
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
    movementDate: saving.date,
    isInitialBalance: saving.isInitialBalance
  };
}

function writeData(input: CreateSavingInput) {
  const isFixed = input.isFixed ?? false;
  const recurrenceType = input.recurrenceType ?? (isFixed ? RecurrenceType.MONTHLY : RecurrenceType.NONE);
  const category = input.category?.trim() || 'Outros';
  return {
    title: input.title,
    category,
    color: input.color?.toUpperCase() ?? '#D4A017',
    description: input.description,
    amount: input.amount,
    date: input.date,
    month: input.month ?? input.date.getMonth() + 1,
    year: input.year ?? input.date.getFullYear(),
    isFixed,
    recurrenceType,
    recurrenceGroupId: input.recurrenceGroupId ?? (isFixed || recurrenceType !== RecurrenceType.NONE ? `${category}:${input.title}` : null),
    isInitialBalance: input.isInitialBalance ?? false,
    goalId: input.goalId,
    hasYield: input.hasYield ?? false,
    yieldRateMonthly: input.hasYield ? input.yieldRateMonthly ?? 0 : null
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

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function addYearsClamped(value: Date, years: number) {
  return dateForMonthlyOccurrence(value.getFullYear() + years, value.getMonth() + 1, value.getDate());
}

function jsWeekdayToFormWeekday(value: Date) {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function recurringSavingDatesForInput(input: CreateSavingInput) {
  if (!input.recurrenceType || input.recurrenceType === RecurrenceType.NONE || !input.recurrenceGeneration) return [];

  const generation = input.recurrenceGeneration;
  const maxOccurrences = 15_000;

  if (input.recurrenceType === RecurrenceType.MONTHLY) {
    const startCursor = monthCursorValue(generation.startYear, generation.startMonth);
    const endCursor = monthCursorValue(generation.endYear, generation.endMonth);
    const dueDay = input.date.getDate();
    if (endCursor < startCursor) {
      const error = new Error('Periodo final da recorrencia anterior ao periodo inicial') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    return Array.from({ length: endCursor - startCursor + 1 }, (_, index) => {
      const cursor = startCursor + index;
      const occurrenceYear = Math.floor((cursor - 1) / 12);
      const occurrenceMonth = ((cursor - 1) % 12) + 1;
      return dateForMonthlyOccurrence(occurrenceYear, occurrenceMonth, dueDay);
    });
  }

  const startDate = startOfDay(generation.startDate ?? input.date);
  const endDate = startOfDay(generation.endDate ?? input.date);
  if (endDate < startDate) {
    const error = new Error('Periodo final da recorrencia anterior ao periodo inicial') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const dates: Date[] = [];
  if (input.recurrenceType === RecurrenceType.DAILY) {
    for (let date = startDate; date <= endDate && dates.length < maxOccurrences; date = addDays(date, 1)) {
      dates.push(date);
    }
    return dates;
  }

  if (input.recurrenceType === RecurrenceType.WEEKLY) {
    const targetWeekday = input.date ? jsWeekdayToFormWeekday(input.date) : jsWeekdayToFormWeekday(startDate);
    const firstOffset = (targetWeekday - jsWeekdayToFormWeekday(startDate) + 7) % 7;
    for (let date = addDays(startDate, firstOffset); date <= endDate && dates.length < maxOccurrences; date = addDays(date, 7)) {
      dates.push(date);
    }
    return dates;
  }

  if (input.recurrenceType === RecurrenceType.YEARLY) {
    for (let index = 0, date = startDate; date <= endDate && dates.length < maxOccurrences; index += 1, date = addYearsClamped(startDate, index)) {
      dates.push(date);
    }
  }

  return dates;
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

  if (input.recurrenceType && input.recurrenceType !== RecurrenceType.NONE && input.recurrenceGeneration) {
    const occurrenceDates = recurringSavingDatesForInput(input);
    if (!occurrenceDates.length) {
      const error = new Error('Nenhuma ocorrencia encontrada para o periodo informado') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    const category = input.category?.trim() || 'Outros';
    const recurrenceGroupId = input.recurrenceGroupId ?? `${userId}:INVESTMENT:${category}:${input.title}:${Date.now()}`;
    const savings = await prisma.$transaction(
      occurrenceDates.map((occurrenceDate) => {
        const occurrenceYear = occurrenceDate.getFullYear();
        const occurrenceMonth = occurrenceDate.getMonth() + 1;
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
              recurrenceType: input.recurrenceType,
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
      if (date < startOfCurrentMonth() || date > endOfCurrentMonth()) {
        const error = new Error('Resgate de economia deve ser feito dentro do mes atual') as Error & {
          statusCode: number;
        };
        error.statusCode = 400;
        throw error;
      }

      const available = await tx.savings.aggregate({
        where: {
          userId,
          category: input.category?.trim() || 'Outros',
          title: input.title,
          date: { lte: endOfToday() }
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
        color: input.color?.toUpperCase() ?? '#D4A017',
        description,
        amount: input.direction === 'SAVE_FROM_BALANCE' ? input.amount : -input.amount,
        date,
        month,
        year,
        isFixed: false,
        recurrenceType: RecurrenceType.NONE,
        goalId: input.goalId,
        hasYield: input.hasYield ?? false,
        yieldRateMonthly: input.hasYield ? input.yieldRateMonthly ?? 0 : null
      }
    });

    let income = null;
    if (input.direction === 'WITHDRAW_TO_BALANCE') {
      await tx.financialCategory.upsert({
        where: {
          userId_type_name: {
            userId,
            type: FinancialItemType.INCOME,
            name: SAVINGS_REDEMPTION_INCOME_CATEGORY
          }
        },
        create: {
          userId,
          type: FinancialItemType.INCOME,
          name: SAVINGS_REDEMPTION_INCOME_CATEGORY,
          color: '#0F766E'
        },
        update: {}
      });
      income = await tx.financialItem.create({
        data: {
          userId,
          title: SAVINGS_REDEMPTION_INCOME_ITEM,
          name: SAVINGS_REDEMPTION_INCOME_ITEM,
          description,
          amount: input.amount,
          type: FinancialItemType.INCOME,
          category: SAVINGS_REDEMPTION_INCOME_CATEGORY,
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
      color: input.color?.toUpperCase(),
      description: input.description,
      amount: input.amount,
      date: input.date,
      month: input.month ?? (input.date ? input.date.getMonth() + 1 : undefined),
      year: input.year ?? (input.date ? input.date.getFullYear() : undefined),
      isFixed: input.isFixed,
      recurrenceType: input.recurrenceType,
      recurrenceGroupId: input.recurrenceGroupId,
      goalId: input.goalId,
      hasYield: input.hasYield,
      yieldRateMonthly: input.hasYield === false ? null : input.yieldRateMonthly
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

export async function deleteSavingsGroup(userId: string, input: SavingsDeleteGroupInput) {
  const where: Prisma.SavingsWhereInput = {
    userId,
    category: input.category,
    title: input.title
  };
  const result = await prisma.savings.deleteMany({ where });
  return { deletedCount: result.count };
}

export async function updateSavingsGroup(userId: string, input: SavingsUpdateGroupInput) {
  const where: Prisma.SavingsWhereInput = {
    userId,
    category: input.category,
    title: input.title
  };
  const existing = await prisma.savings.findMany({ where });
  if (!existing.length) {
    const error = new Error('Economia nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await assertGoalOwnership(userId, input.goalId);

  const today = endOfToday();
  const currentBalance = existing
    .filter((saving) => saving.date <= today)
    .reduce((sum, saving) => sum + projectedSavingAmount(saving), 0);
  const nextCategory = input.nextCategory?.trim() || input.category;
  const nextTitle = input.nextTitle?.trim() || input.title;
  const nextColor = input.color?.toUpperCase() ?? existing[0].color;
  const nextHasYield = input.hasYield ?? existing.some((saving) => saving.hasYield);
  const nextYieldRateMonthly = nextHasYield
    ? input.yieldRateMonthly ?? toNumber(existing.find((saving) => saving.hasYield)?.yieldRateMonthly ?? 0)
    : null;
  const delta =
    input.targetBalance === undefined
      ? 0
      : roundMoney(input.targetBalance - currentBalance);
  const adjustmentDate = startOfToday();

  const [updated, adjustment] = await prisma.$transaction(async (tx) => {
    const updatedGroup = await tx.savings.updateMany({
      where,
      data: {
        title: nextTitle,
        category: nextCategory,
        color: nextColor,
        description: input.description,
        goalId: input.goalId,
        hasYield: input.hasYield,
        yieldRateMonthly: input.hasYield === false ? null : input.yieldRateMonthly
      }
    });

    const adjustmentSaving =
      Math.abs(delta) >= 0.01
        ? await tx.savings.create({
            data: {
              userId,
              title: nextTitle,
              category: nextCategory,
              color: nextColor,
              description:
                input.description ??
                `Ajuste de saldo para R$ ${input.targetBalance?.toFixed(2).replace('.', ',')}`,
              amount: delta,
              date: adjustmentDate,
              month: adjustmentDate.getMonth() + 1,
              year: adjustmentDate.getFullYear(),
              isFixed: false,
              recurrenceType: RecurrenceType.NONE,
              isInitialBalance: true,
              goalId: input.goalId,
              hasYield: nextHasYield,
              yieldRateMonthly: nextYieldRateMonthly
            }
          })
        : null;

    return [updatedGroup, adjustmentSaving] as const;
  });

  return {
    updatedCount: updated.count,
    adjustment: adjustment ? serializeSaving(adjustment) : null,
    previousBalance: roundMoney(currentBalance),
    targetBalance: input.targetBalance ?? null,
    delta
  };
}

export async function getSavingsOverview(userId: string) {
  const today = endOfToday();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const [allSavings, categories, monthItems, monthlySavings] = await Promise.all([
    prisma.savings.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { title: 'asc' }]
    }),
    prisma.financialCategory.findMany({
      where: { userId, type: FinancialItemType.INVESTMENT },
      select: { name: true, color: true }
    }),
    prisma.financialItem.findMany({
      where: { userId, month: currentMonth, year: currentYear },
      select: { amount: true, type: true, excludedFromTotals: true }
    }),
    prisma.savings.aggregate({
      where: { userId, month: currentMonth, year: currentYear, amount: { gt: 0 }, isInitialBalance: false },
      _sum: { amount: true }
    })
  ]);
  const currentSavings = allSavings.filter((saving) => saving.date <= today);

  const colorMap = new Map(categories.map((category) => [category.name, category.color]));
  const categoryMap = new Map<string, {
    id: string;
    name: string;
    color: string;
    currentSavedBalance: number;
    items: Map<string, { id: string; name: string; color: string; currentSavedBalance: number; rawSavedBalance: number; hasYield: boolean; yieldRateMonthly: number | null; savingIds: string[] }>;
  }>();

  for (const saving of allSavings) {
    const isCurrent = saving.date <= today;
    const rawAmount = toNumber(saving.amount);
    const amount = isCurrent ? projectedSavingAmount(saving) : 0;
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
      color: saving.color,
      currentSavedBalance: 0,
      rawSavedBalance: 0,
      hasYield: false,
      yieldRateMonthly: null,
      savingIds: []
    };
    subItem.currentSavedBalance += amount;
    subItem.rawSavedBalance += isCurrent ? rawAmount : 0;
    subItem.hasYield = subItem.hasYield || saving.hasYield;
    subItem.yieldRateMonthly = saving.hasYield ? toNumber(saving.yieldRateMonthly ?? 0) : subItem.yieldRateMonthly;
    subItem.savingIds.push(saving.id);
    category.items.set(saving.title, subItem);
    categoryMap.set(saving.category, category);
  }

  const monthlyIncome = monthItems
    .filter((item) => !item.excludedFromTotals && incomeTypes().includes(item.type))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthlyExpense = monthItems
    .filter((item) => !item.excludedFromTotals && expenseTypes().includes(item.type))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthlyPlannedSavings = toNumber(monthlySavings._sum.amount ?? 0);
  const monthlySavingsOpportunity = monthlyIncome - monthlyExpense - monthlyPlannedSavings;

  return {
    currentSavedBalance: currentSavings.reduce((sum, saving) => sum + projectedSavingAmount(saving), 0),
    monthlyPlannedSavings,
    monthlySavingsOpportunity: monthlySavingsOpportunity > 0 ? monthlySavingsOpportunity : 0,
    categories: Array.from(categoryMap.values())
      .map((category) => ({
        ...category,
        items: Array.from(category.items.values())
          .sort((a, b) => b.currentSavedBalance - a.currentSavedBalance)
      }))
      .filter((category) => category.items.length > 0)
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
      where: { userId, month: filters.month, year: filters.year, isInitialBalance: false },
      _sum: { amount: true }
    }),
    prisma.savings.aggregate({
      where: { userId, month: filters.month, year: filters.year, amount: { gt: 0 }, isInitialBalance: false },
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
      select: { amount: true, type: true, excludedFromTotals: true }
    })
  ]);

  const monthlyIncome = monthItems
    .filter((item) => !item.excludedFromTotals && incomeTypes().includes(item.type))
    .reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthlyExpense = monthItems
    .filter((item) => !item.excludedFromTotals && expenseTypes().includes(item.type))
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
