import { FinancialItemType, PaymentStatus, Prisma, RecurrenceType } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { SAVINGS_REDEMPTION_INCOME_CATEGORY } from '../../shared/system-categories.js';
import {
  createCreditCardPurchase,
  deleteCreditCardPurchase,
  updateCreditCardPurchase
} from '../credit-cards/credit-card.service.js';
import type {
  BulkDeleteFinancialScopeInput,
  CreateFinancialItemInput,
  CategoryActionInput,
  CopyFinancialCategoryInput,
  ListFinancialItemsInput,
  PaymentSummaryInput,
  PaymentStatusUpdateInput,
  RenameCategoryInput,
  SalaryCandidatesInput,
  UpdateFinancialItemValueInput,
  UpdateFinancialItemInput
} from './financial-item.schemas.js';

type Item = Awaited<ReturnType<typeof prisma.financialItem.findMany>>[number];

const salarySearchTerms = [
  'salario',
  'salário',
  'ordenado',
  'folha',
  'pagamento',
  'adiantamento',
  'pro labore',
  'pró labore'
];

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function serializeItem(item: {
  id: string;
  userId: string;
  title: string;
  name: string;
  description: string | null;
  amount: Prisma.Decimal;
  type: FinancialItemType;
  category: string;
  dueDate: Date | null;
  paymentDate: Date | null;
  status: PaymentStatus;
  dueDay: number | null;
  isFixed: boolean;
  recurrenceType: RecurrenceType;
  recurrenceGroupId: string | null;
  excludedFromTotals: boolean;
  linkedCreditCardId: string | null;
  linkedCreditCardPurchaseId: string | null;
  linkedCreditCardInstallments: number | null;
  linkedCreditCardAmount: Prisma.Decimal | null;
  date: Date;
  month: number;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...item,
    amount: toNumber(item.amount),
    linkedCreditCardAmount: item.linkedCreditCardAmount ? toNumber(item.linkedCreditCardAmount) : null,
    status: currentStatus(item)
  };
}

function normalizeType(type: CreateFinancialItemInput['type'] | UpdateFinancialItemInput['type']) {
  if (type === FinancialItemType.INCOME) return FinancialItemType.INCOME;
  if (type === FinancialItemType.EXPENSE) return FinancialItemType.EXPENSE;
  return undefined;
}

function normalizeCategoryName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function monthCursor(year: number, month: number) {
  return year * 12 + month;
}

function monthDiff(startYear: number, startMonth: number, targetYear: number, targetMonth: number) {
  return monthCursor(targetYear, targetMonth) - monthCursor(startYear, startMonth);
}

function creditCardInstallmentNumberForMonth(
  purchase: { purchaseDate: Date; installments: number; skippedInstallments?: number[] },
  month: number,
  year: number
) {
  const purchaseMonth = purchase.purchaseDate.getMonth() + 1;
  const purchaseYear = purchase.purchaseDate.getFullYear();
  const installmentIndex = monthDiff(purchaseYear, purchaseMonth, year, month);
  if (installmentIndex < 0 || installmentIndex >= purchase.installments) return null;
  if (purchase.skippedInstallments?.includes(installmentIndex + 1)) return null;

  return installmentIndex + 1;
}

function isCreditCardExpenseCategory(category?: string | null, type?: FinancialItemType | 'INCOME' | 'EXPENSE' | 'INVESTMENT') {
  const normalizedType = String(type ?? '');
  if (normalizedType && normalizedType !== FinancialItemType.EXPENSE) return false;
  const normalizedCategory = normalizeCategoryName(category ?? '');
  return normalizedCategory === 'cartao de credito' || normalizedCategory === 'cartoes de credito' || normalizedCategory === 'cartoes';
}

async function removeCreditCardPurchaseInstallmentsForYear(
  tx: Prisma.TransactionClient,
  userId: string,
  year: number,
  cardNames?: string[]
) {
  const normalizedCardNames = cardNames?.map(normalizeCategoryName).filter(Boolean) ?? [];
  const cards = await tx.creditCard.findMany({
    where: { userId },
    select: { id: true, name: true }
  });
  const targetCardIds = normalizedCardNames.length
    ? cards
        .filter((card) => normalizedCardNames.includes(normalizeCategoryName(card.name)))
        .map((card) => card.id)
    : cards.map((card) => card.id);

  if (!targetCardIds.length) return { deletedPurchasesCount: 0, updatedPurchasesCount: 0 };

  const purchases = await tx.creditCardPurchase.findMany({
    where: {
      userId,
      cardId: { in: targetCardIds }
    }
  });

  let deletedPurchasesCount = 0;
  let updatedPurchasesCount = 0;

  for (const purchase of purchases) {
    const installmentsInYear = Array.from({ length: 12 }, (_, index) =>
      creditCardInstallmentNumberForMonth(purchase, index + 1, year)
    ).filter((installmentNumber): installmentNumber is number => installmentNumber !== null);

    if (!installmentsInYear.length) continue;

    const skippedInstallments = Array.from(new Set([...purchase.skippedInstallments, ...installmentsInYear])).sort((a, b) => a - b);
    if (skippedInstallments.length >= purchase.installments) {
      await tx.creditCardPurchase.delete({ where: { id: purchase.id } });
      deletedPurchasesCount += 1;
      continue;
    }

    await tx.creditCardPurchase.update({
      where: { id: purchase.id },
      data: { skippedInstallments }
    });
    updatedPurchasesCount += 1;
  }

  return { deletedPurchasesCount, updatedPurchasesCount };
}

function assertNotManualSavingsRedemption(input: {
  type?: CreateFinancialItemInput['type'] | UpdateFinancialItemInput['type'] | FinancialItemType;
  category?: string | null;
}) {
  const rawType = String(input.type ?? '');
  const type =
    rawType === FinancialItemType.INCOME
      ? FinancialItemType.INCOME
      : rawType === FinancialItemType.EXPENSE
        ? FinancialItemType.EXPENSE
        : undefined;
  const category = input.category;
  if (
    type === FinancialItemType.INCOME &&
    category &&
    normalizeCategoryName(category) === normalizeCategoryName(SAVINGS_REDEMPTION_INCOME_CATEGORY)
  ) {
    const error = new Error('A categoria Resgate de economia so pode ser usada ao resgatar uma economia') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
}

function isExpenseType(type: FinancialItemType | undefined) {
  return type === FinancialItemType.EXPENSE;
}

function typeFilter(type: 'INCOME' | 'EXPENSE') {
  return type === 'INCOME'
    ? [FinancialItemType.INCOME]
    : [FinancialItemType.EXPENSE];
}

function salaryCandidateWhere(userId: string, filters: SalaryCandidatesInput): Prisma.FinancialItemWhereInput {
  return {
    userId,
    type: FinancialItemType.INCOME,
    year: filters.year,
    month: filters.month,
    OR: [
      { isFixed: true },
      { recurrenceType: RecurrenceType.MONTHLY },
      ...salarySearchTerms.flatMap((term) => [
        { name: { contains: term, mode: Prisma.QueryMode.insensitive } },
        { title: { contains: term, mode: Prisma.QueryMode.insensitive } },
        { category: { contains: term, mode: Prisma.QueryMode.insensitive } }
      ])
    ]
  };
}

function normalizeStatus(type: FinancialItemType, dueDate?: Date | null, paymentDate?: Date | null, status?: PaymentStatus) {
  if (status === PaymentStatus.CANCELADO) return PaymentStatus.CANCELADO;
  if (!isExpenseType(type)) return PaymentStatus.PAGO;
  if (paymentDate || status === PaymentStatus.PAGO) return PaymentStatus.PAGO;
  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) return PaymentStatus.ATRASADO;
  }
  return status ?? PaymentStatus.PENDENTE;
}

function currentStatus(item: {
  type: FinancialItemType;
  dueDate: Date | null;
  paymentDate: Date | null;
  status: PaymentStatus;
}) {
  return normalizeStatus(item.type, item.dueDate, item.paymentDate, item.status);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function dateForMonthlyOccurrence(year: number, month: number, day: number) {
  const safeDay = Math.min(day, daysInMonth(year, month));
  return new Date(year, month - 1, safeDay);
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
  const year = value.getFullYear() + years;
  const month = value.getMonth() + 1;
  const day = value.getDate();
  return dateForMonthlyOccurrence(year, month, day);
}

function jsWeekdayToFormWeekday(value: Date) {
  const day = value.getDay();
  return day === 0 ? 7 : day;
}

function recurringDatesForInput(input: CreateFinancialItemInput) {
  if (!input.recurrenceType || input.recurrenceType === RecurrenceType.NONE || !input.recurrenceGeneration) return [];

  const generation = input.recurrenceGeneration;
  const maxOccurrences = 15_000;

  if (input.recurrenceType === RecurrenceType.MONTHLY) {
    const startMonth = generation.mode === 'ALL_YEAR' ? 1 : generation.startMonth;
    const startYear = generation.startYear;
    const endMonth = generation.endMonth;
    const endYear = generation.endYear;
    const startCursor = monthCursor(startYear, startMonth);
    const endCursor = monthCursor(endYear, endMonth);
    const dueDay = input.dueDay ?? input.date.getDate();

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
    const targetWeekday = input.dueDay ?? jsWeekdayToFormWeekday(startDate);
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

function targetMonthsForValueUpdate(startMonth: number, scope: UpdateFinancialItemValueInput['scope']) {
  if (scope === 'ONLY_THIS_PERIOD') return [startMonth];
  if (scope === 'FROM_THIS_PERIOD_FORWARD') {
    return Array.from({ length: 13 - startMonth }, (_, index) => startMonth + index);
  }
  return Array.from({ length: 12 }, (_, index) => index + 1);
}

function boundedTargetMonths(
  startMonth: number,
  scope: UpdateFinancialItemValueInput['scope'],
  endMonth?: number
) {
  const months = targetMonthsForValueUpdate(startMonth, scope);
  if (!endMonth) return months;
  return months.filter((month) => month >= Math.min(startMonth, endMonth) && month <= Math.max(startMonth, endMonth));
}

function valueUpdateWhere(
  userId: string,
  existing: Awaited<ReturnType<typeof prisma.financialItem.findFirst>>,
  scope: UpdateFinancialItemValueInput['scope']
): Prisma.FinancialItemWhereInput {
  if (!existing || scope === 'ONLY_THIS_PERIOD') return { id: existing?.id, userId };

  const where: Prisma.FinancialItemWhereInput = existing.recurrenceGroupId
    ? {
        userId,
        recurrenceGroupId: existing.recurrenceGroupId,
        year: existing.year
      }
    : {
        userId,
        type: existing.type,
        category: existing.category,
        name: existing.name,
        year: existing.year,
        OR: [
          { isFixed: true },
          { recurrenceType: { not: RecurrenceType.NONE } }
        ]
      };

  if (scope === 'FROM_THIS_PERIOD_FORWARD') {
    where.month = { gte: existing.month };
  }

  return where;
}

function inferCategory(input: CreateFinancialItemInput | UpdateFinancialItemInput) {
  if (input.category) return input.category;
  return 'Outros';
}

function normalizeWriteInput(input: CreateFinancialItemInput) {
  const date = input.date;
  const type = normalizeType(input.type) ?? FinancialItemType.EXPENSE;
  const name = input.name ?? input.title ?? 'Lancamento';
  const isFixed = input.isFixed ?? false;

  return {
    title: input.title ?? name,
    name,
    description: input.description,
    amount: input.amount,
    type,
    category: inferCategory(input),
    dueDate: input.dueDate,
    paymentDate: input.paymentDate,
    status: normalizeStatus(type, input.dueDate, input.paymentDate, input.status),
    dueDay: input.dueDay ?? (input.dueDate ? input.dueDate.getDate() : null),
    isFixed,
    recurrenceType: input.recurrenceType ?? (isFixed ? RecurrenceType.MONTHLY : RecurrenceType.NONE),
    recurrenceGroupId: input.recurrenceGroupId ?? (isFixed ? `${input.category ?? inferCategory(input)}:${name}` : null),
    date,
    month: input.month ?? date.getMonth() + 1,
    year: input.year ?? date.getFullYear()
  };
}

export async function listFinancialItems(userId: string, filters: ListFinancialItemsInput) {
  const where: Prisma.FinancialItemWhereInput = {
    userId,
    type: filters.type,
    status: filters.status && filters.status !== PaymentStatus.ATRASADO ? filters.status : undefined,
    date: {
      gte: filters.startDate,
      lte: filters.endDate
    }
  };

  const items = await prisma.financialItem.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });

  const serializedItems = items.map(serializeItem);
  if (!filters.status || filters.status !== PaymentStatus.ATRASADO) return serializedItems;

  return serializedItems.filter((item) => item.status === PaymentStatus.ATRASADO);
}

export async function copyFinancialCategory(userId: string, input: CopyFinancialCategoryInput) {
  const targetYears = Array.from(new Set(input.targetYears)).filter((targetYear) => targetYear !== input.sourceYear);
  if (!targetYears.length) return { copiedCount: 0 };

  const selectedItems = input.subItems ?? [];
  const selectedFinancialItems = selectedItems.filter((item) => item.type !== 'INVESTMENT');
  const selectedSavings = selectedItems.filter((item) => item.type === 'INVESTMENT');
  const itemTypes = input.scope === 'ALL_INCOME'
    ? [FinancialItemType.INCOME]
    : input.scope === 'ALL_EXPENSE'
      ? [FinancialItemType.EXPENSE]
      : input.scope === 'ALL_TABLE'
        ? [FinancialItemType.INCOME, FinancialItemType.EXPENSE]
        : input.scope === 'CATEGORY' && input.type !== 'INVESTMENT'
          ? [input.type === 'INCOME' ? FinancialItemType.INCOME : FinancialItemType.EXPENSE]
          : undefined;
  const itemWhere: Prisma.FinancialItemWhereInput = {
    userId,
    year: input.sourceYear,
    type: itemTypes ? { in: itemTypes } : undefined,
    category: input.scope === 'CATEGORY' && input.type !== 'INVESTMENT' ? input.category : undefined,
    OR: input.scope === 'SELECTED_SUBITEMS'
      ? selectedFinancialItems
          .map((item) => ({
            type: item.type === 'INCOME' ? FinancialItemType.INCOME : FinancialItemType.EXPENSE,
            category: item.category,
            name: item.name
          }))
      : undefined
  };
  const savingWhere: Prisma.SavingsWhereInput = {
    userId,
    year: input.sourceYear,
    isInitialBalance: false,
    category: input.scope === 'CATEGORY' && input.type === 'INVESTMENT' ? input.category : undefined,
    OR: input.scope === 'SELECTED_SUBITEMS'
      ? selectedSavings
          .map((item) => ({
            category: item.category,
            title: item.name
          }))
      : undefined
  };
  const shouldCopyItems =
    input.scope === 'ALL_INCOME' ||
    input.scope === 'ALL_EXPENSE' ||
    input.scope === 'ALL_TABLE' ||
    (input.scope === 'CATEGORY' && input.type !== 'INVESTMENT') ||
    (input.scope === 'SELECTED_SUBITEMS' && selectedFinancialItems.length > 0);
  const shouldCopySavings =
    input.scope === 'ALL_INVESTMENT' ||
    input.scope === 'ALL_TABLE' ||
    (input.scope === 'CATEGORY' && input.type === 'INVESTMENT') ||
    (input.scope === 'SELECTED_SUBITEMS' && selectedSavings.length > 0);

  const [sourceItems, sourceSavings] = await Promise.all([
    shouldCopyItems
      ? prisma.financialItem.findMany({
          where: itemWhere,
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
        })
      : Promise.resolve([]),
    shouldCopySavings
      ? prisma.savings.findMany({
          where: savingWhere,
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
        })
      : Promise.resolve([])
  ]);

  let copiedCount = 0;
  await prisma.$transaction(async (tx) => {
    for (const targetYear of targetYears) {
      if (input.overwrite) {
        if (shouldCopyItems) {
          await tx.financialItem.deleteMany({
            where: { ...itemWhere, year: targetYear }
          });
        }
        if (shouldCopySavings) {
          await tx.savings.deleteMany({
            where: { ...savingWhere, year: targetYear }
          });
        }
      }
      for (const item of sourceItems) {
        const occurrenceDate = dateForMonthlyOccurrence(targetYear, item.month, item.date.getDate());
        const dueDate = item.dueDate ? dateForMonthlyOccurrence(targetYear, item.month, item.dueDate.getDate()) : null;
        await tx.financialItem.create({
          data: {
            userId,
            title: item.title,
            name: item.name,
            description: item.description,
            amount: item.amount,
            type: item.type,
            category: item.category,
            dueDate,
            paymentDate: item.paymentDate ? dateForMonthlyOccurrence(targetYear, item.month, item.paymentDate.getDate()) : null,
            status: item.status,
            dueDay: item.dueDay,
            isFixed: item.isFixed,
            recurrenceType: item.recurrenceType,
            recurrenceGroupId: item.recurrenceGroupId ? `${item.recurrenceGroupId}:COPY:${targetYear}` : null,
            date: occurrenceDate,
            month: item.month,
            year: targetYear
          }
        });
        copiedCount += 1;
      }
      for (const saving of sourceSavings) {
        const occurrenceDate = dateForMonthlyOccurrence(targetYear, saving.month, saving.date.getDate());
        await tx.savings.create({
          data: {
            userId,
            title: saving.title,
            category: saving.category,
            color: saving.color,
            description: saving.description,
            amount: saving.amount,
            date: occurrenceDate,
            month: saving.month,
            year: targetYear,
            isFixed: saving.isFixed,
            recurrenceType: saving.recurrenceType,
            recurrenceGroupId: saving.recurrenceGroupId
              ? `${saving.recurrenceGroupId}:COPY:${targetYear}`
              : null,
            isInitialBalance: false,
            goalId: saving.goalId,
            hasYield: saving.hasYield,
            yieldRateMonthly: saving.yieldRateMonthly
          }
        });
        copiedCount += 1;
      }
    }
  });

  return { copiedCount };
}

export async function deleteFinancialScope(userId: string, input: BulkDeleteFinancialScopeInput) {
  const selectedItems = input.subItems ?? [];
  const selectedFinancialItems = selectedItems.filter((item) => item.type !== 'INVESTMENT');
  const selectedSavings = selectedItems.filter((item) => item.type === 'INVESTMENT');
  const selectedCreditCardItems = selectedFinancialItems.filter((item) => isCreditCardExpenseCategory(item.category, item.type));
  const shouldDeleteCreditCardPurchases =
    input.scope === 'ALL_EXPENSE' ||
    input.scope === 'ALL_TABLE' ||
    (input.scope === 'CATEGORY' && isCreditCardExpenseCategory(input.category, input.type)) ||
    (input.scope === 'SELECTED_SUBITEMS' && selectedCreditCardItems.length > 0);
  const itemTypes = input.scope === 'ALL_INCOME'
    ? [FinancialItemType.INCOME]
    : input.scope === 'ALL_EXPENSE'
      ? [FinancialItemType.EXPENSE]
      : input.scope === 'ALL_TABLE'
        ? [FinancialItemType.INCOME, FinancialItemType.EXPENSE]
        : input.scope === 'CATEGORY' && input.type !== 'INVESTMENT'
          ? [input.type === 'INCOME' ? FinancialItemType.INCOME : FinancialItemType.EXPENSE]
          : undefined;
  const itemWhere: Prisma.FinancialItemWhereInput = {
    userId,
    year: input.year,
    type: itemTypes ? { in: itemTypes } : undefined,
    category: input.scope === 'CATEGORY' && input.type !== 'INVESTMENT' ? input.category : undefined,
    OR: input.scope === 'SELECTED_SUBITEMS'
      ? selectedFinancialItems.map((item) => ({
          type: item.type === 'INCOME' ? FinancialItemType.INCOME : FinancialItemType.EXPENSE,
          category: item.category,
          name: item.name
        }))
      : undefined
  };
  const savingWhere: Prisma.SavingsWhereInput = {
    userId,
    year: input.year,
    isInitialBalance: false,
    category: input.scope === 'CATEGORY' && input.type === 'INVESTMENT' ? input.category : undefined,
    OR: input.scope === 'SELECTED_SUBITEMS'
      ? selectedSavings.map((item) => ({
          category: item.category,
          title: item.name
        }))
      : undefined
  };
  const shouldDeleteItems =
    input.scope === 'ALL_INCOME' ||
    input.scope === 'ALL_EXPENSE' ||
    input.scope === 'ALL_TABLE' ||
    (input.scope === 'CATEGORY' && input.type !== 'INVESTMENT') ||
    (input.scope === 'SELECTED_SUBITEMS' && selectedFinancialItems.length > 0);
  const shouldDeleteSavings =
    input.scope === 'ALL_INVESTMENT' ||
    input.scope === 'ALL_TABLE' ||
    (input.scope === 'CATEGORY' && input.type === 'INVESTMENT') ||
    (input.scope === 'SELECTED_SUBITEMS' && selectedSavings.length > 0);
  const linkedItems = shouldDeleteItems
    ? await prisma.financialItem.findMany({ where: itemWhere })
    : [];
  await deleteLinkedCreditCardPurchasesForItems(userId, linkedItems);

  const result = await prisma.$transaction(async (tx) => {
    const [itemsResult, savingsResult, creditCardResult] = await Promise.all([
      shouldDeleteItems
        ? tx.financialItem.deleteMany({ where: itemWhere })
        : Promise.resolve({ count: 0 }),
      shouldDeleteSavings
        ? tx.savings.deleteMany({ where: savingWhere })
        : Promise.resolve({ count: 0 }),
      shouldDeleteCreditCardPurchases
        ? removeCreditCardPurchaseInstallmentsForYear(
            tx,
            userId,
            input.year,
            input.scope === 'SELECTED_SUBITEMS' ? selectedCreditCardItems.map((item) => item.name) : undefined
          )
        : Promise.resolve({ deletedPurchasesCount: 0, updatedPurchasesCount: 0 })
    ]);

    return {
      deletedItemsCount: itemsResult.count,
      deletedSavingsCount: savingsResult.count,
      deletedCreditCardPurchasesCount: creditCardResult.deletedPurchasesCount,
      updatedCreditCardPurchasesCount: creditCardResult.updatedPurchasesCount,
      deletedCount: itemsResult.count + savingsResult.count + creditCardResult.deletedPurchasesCount
    };
  });

  return result;
}

export async function listSalaryCandidates(userId: string, filters: SalaryCandidatesInput) {
  const where = salaryCandidateWhere(userId, filters);
  const skip = (filters.page - 1) * filters.limit;
  const [items, total] = await Promise.all([
    prisma.financialItem.findMany({
      where,
      orderBy: [{ month: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }],
      skip,
      take: filters.limit
    }),
    prisma.financialItem.count({ where })
  ]);

  return {
    items: items.map(serializeItem),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.limit))
    }
  };
}

export async function createFinancialItem(userId: string, input: CreateFinancialItemInput) {
  assertNotManualSavingsRedemption(input);
  if (input.recurrenceType && input.recurrenceType !== RecurrenceType.NONE && input.recurrenceGeneration) {
    const occurrenceDates = recurringDatesForInput(input);
    if (!occurrenceDates.length) {
      const error = new Error('Nenhuma ocorrencia encontrada para o periodo informado') as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    const recurrenceGroupId =
      input.recurrenceGroupId ??
      `${userId}:${input.type}:${input.category ?? 'Outros'}:${input.name ?? input.title ?? 'Lancamento'}:${Date.now()}`;
    const items = await prisma.$transaction(
      occurrenceDates.map((occurrenceDate) => {
        const occurrenceYear = occurrenceDate.getFullYear();
        const occurrenceMonth = occurrenceDate.getMonth() + 1;
        const isExpense = input.type === 'EXPENSE';
        const data = normalizeWriteInput({
          ...input,
          date: occurrenceDate,
          month: occurrenceMonth,
          year: occurrenceYear,
          dueDate: isExpense ? occurrenceDate : null,
          paymentDate: isExpense ? null : occurrenceDate,
          status: isExpense ? PaymentStatus.PENDENTE : PaymentStatus.PAGO,
          isFixed: true,
          recurrenceType: input.recurrenceType,
          recurrenceGroupId,
          recurrenceGeneration: undefined
        });

        return prisma.financialItem.create({
          data: {
            userId,
            ...data
          }
        });
      })
    );

    return {
      item: serializeItem(items[0]),
      items: items.map(serializeItem)
    };
  }

  const data = normalizeWriteInput(input);
  const item = await prisma.financialItem.create({
    data: {
      userId,
      ...data
    }
  });

  return {
    item: serializeItem(item),
    items: [serializeItem(item)]
  };
}

export async function updateFinancialItem(userId: string, id: string, input: UpdateFinancialItemInput) {
  const existing = await prisma.financialItem.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Registro financeiro nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  assertNotManualSavingsRedemption({
    ...input,
    type: input.type ?? existing.type,
    category: input.category ?? existing.category
  });

  const item = await prisma.financialItem.update({
    where: { id },
    data: {
      ...input,
      title: input.title ?? input.name,
      name: input.name ?? input.title,
      type: input.type ? normalizeType(input.type) : undefined,
      category: input.category ?? (input.type ? inferCategory(input) : undefined),
      paymentDate: input.paymentDate,
      status: input.type || input.dueDate || input.paymentDate || input.status
        ? normalizeStatus((normalizeType(input.type) ?? existing.type), input.dueDate ?? existing.dueDate, input.paymentDate ?? existing.paymentDate, input.status)
        : undefined,
      recurrenceGroupId: input.recurrenceGroupId,
      dueDay: input.dueDay ?? (input.dueDate ? input.dueDate.getDate() : undefined),
      month: input.month ?? (input.date ? input.date.getMonth() + 1 : undefined),
      year: input.year ?? (input.date ? input.date.getFullYear() : undefined)
    }
  });

  return serializeItem(item);
}

export async function updateFinancialItemPaymentStatus(userId: string, id: string, input: PaymentStatusUpdateInput) {
  const existing = await prisma.financialItem.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Registro financeiro nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const item = await prisma.financialItem.update({
    where: { id },
    data: {
      status: input.status,
      paymentDate: null
    }
  });

  return serializeItem(item);
}

export async function deleteFinancialItem(userId: string, id: string) {
  const existing = await prisma.financialItem.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Registro financeiro nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await clearCreditCardPaymentLink(userId, existing);
  await prisma.financialItem.delete({ where: { id } });
}

export async function renameFinancialCategory(userId: string, input: RenameCategoryInput) {
  const where: Prisma.FinancialItemWhereInput = {
    userId,
    category: input.category,
    type: { in: typeFilter(input.type) },
    year: input.year
  };

  const result = await prisma.financialItem.updateMany({
    where,
    data: { category: input.newCategory }
  });

  return { updatedCount: result.count };
}

export async function deleteFinancialCategory(userId: string, input: CategoryActionInput) {
  const where: Prisma.FinancialItemWhereInput = {
    userId,
    category: input.category,
    type: { in: typeFilter(input.type) },
    year: input.year
  };
  const linkedItems = await prisma.financialItem.findMany({ where });
  await deleteLinkedCreditCardPurchasesForItems(userId, linkedItems);

  const result = await prisma.$transaction(async (tx) => {
    const [itemsResult, creditCardResult] = await Promise.all([
      tx.financialItem.deleteMany({ where }),
      input.year && isCreditCardExpenseCategory(input.category, input.type)
        ? removeCreditCardPurchaseInstallmentsForYear(tx, userId, input.year)
        : Promise.resolve({ deletedPurchasesCount: 0, updatedPurchasesCount: 0 })
    ]);

    return {
      deletedCount: itemsResult.count + creditCardResult.deletedPurchasesCount,
      deletedItemsCount: itemsResult.count,
      deletedCreditCardPurchasesCount: creditCardResult.deletedPurchasesCount,
      updatedCreditCardPurchasesCount: creditCardResult.updatedPurchasesCount
    };
  });

  return result;
}

export async function getDashboard(userId: string) {
  const [items, savingsTotal, savingsOut] = await Promise.all([
    prisma.financialItem.findMany({
      where: { userId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 5
    }),
    prisma.savings.aggregate({
      where: { userId },
      _sum: { amount: true }
    }),
    prisma.savings.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true }
    })
  ]);

  const totals = {
    totalIncomes: 0,
    totalExpenses: 0,
    totalSavings: toNumber(savingsTotal._sum.amount ?? 0),
    finalBalance: 0
  };

  for (const item of items) {
    if (item.excludedFromTotals) continue;
    const amount = toNumber(item.amount);
    if (!isExpenseType(item.type)) totals.totalIncomes += amount;
    if (isExpenseType(item.type)) totals.totalExpenses += amount;
  }

  totals.finalBalance = totals.totalIncomes - totals.totalExpenses - toNumber(savingsOut._sum.amount ?? 0);

  return { totals, recentItems: items.map(serializeItem) };
}

export async function getPaymentSummary(userId: string, filters: PaymentSummaryInput) {
  const items = await prisma.financialItem.findMany({
    where: {
      userId,
      type: { in: typeFilter('EXPENSE') },
      month: filters.month,
      year: filters.year,
      date: {
        gte: filters.startDate,
        lte: filters.endDate
      }
    }
  });

  const summary = {
    paidCount: 0,
    pendingCount: 0,
    overdueCount: 0,
    canceledCount: 0,
    paidTotal: 0,
    pendingTotal: 0,
    overdueTotal: 0
  };

  for (const item of items) {
    if (item.excludedFromTotals) continue;
    const amount = toNumber(item.amount);
    const status = currentStatus(item);

    if (status === PaymentStatus.PAGO) {
      summary.paidCount += 1;
      summary.paidTotal += amount;
    }

    if (status === PaymentStatus.PENDENTE) {
      summary.pendingCount += 1;
      summary.pendingTotal += amount;
    }

    if (status === PaymentStatus.ATRASADO) {
      summary.overdueCount += 1;
      summary.overdueTotal += amount;
    }

    if (status === PaymentStatus.CANCELADO) {
      summary.canceledCount += 1;
    }
  }

  return summary;
}

async function clearCreditCardPaymentLink(userId: string, item: Item) {
  if (!item.linkedCreditCardPurchaseId) {
    return {
      excludedFromTotals: false,
      linkedCreditCardId: null,
      linkedCreditCardPurchaseId: null,
      linkedCreditCardInstallments: null,
      linkedCreditCardAmount: null
    };
  }

  try {
    await deleteCreditCardPurchase(userId, item.linkedCreditCardPurchaseId, { deleteAllInstallments: true });
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode !== 404) {
      throw error;
    }
  }

  return {
    excludedFromTotals: false,
    linkedCreditCardId: null,
    linkedCreditCardPurchaseId: null,
    linkedCreditCardInstallments: null,
    linkedCreditCardAmount: null
  };
}

async function deleteLinkedCreditCardPurchasesForItems(userId: string, items: Item[]) {
  const linkedItems = items.filter((item) => item.linkedCreditCardPurchaseId);
  const purchaseIds = new Set<string>();

  for (const item of linkedItems) {
    if (!item.linkedCreditCardPurchaseId || purchaseIds.has(item.linkedCreditCardPurchaseId)) continue;
    purchaseIds.add(item.linkedCreditCardPurchaseId);
    await clearCreditCardPaymentLink(userId, item);
  }

  return { deletedLinkedPurchasesCount: purchaseIds.size };
}

async function upsertCreditCardPaymentLink(userId: string, item: Item, input: UpdateFinancialItemValueInput) {
  if (item.type !== FinancialItemType.EXPENSE) {
    const error = new Error('Somente despesas podem ser pagas via cartao') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  if (!input.creditCardId) {
    const error = new Error('Informe o cartao usado no pagamento') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const purchasePayload = {
    title: item.name || item.title,
    description: input.description ?? item.description ?? `Planejado em ${item.category}`,
    amount: input.amount,
    purchaseDate: dateForMonthlyOccurrence(
      input.creditCardFirstInstallmentYear ?? item.year,
      input.creditCardFirstInstallmentMonth ?? item.month,
      input.date.getDate()
    ),
    installments: input.creditCardInstallments ?? item.linkedCreditCardInstallments ?? 1
  };
  if (item.linkedCreditCardPurchaseId && item.linkedCreditCardId && item.linkedCreditCardId !== input.creditCardId) {
    await clearCreditCardPaymentLink(userId, item);
  }

  const shouldUpdatePurchase =
    Boolean(item.linkedCreditCardPurchaseId) &&
    (!item.linkedCreditCardId || item.linkedCreditCardId === input.creditCardId);
  const purchase = shouldUpdatePurchase && item.linkedCreditCardPurchaseId
    ? await updateCreditCardPurchase(userId, item.linkedCreditCardPurchaseId, purchasePayload)
    : await createCreditCardPurchase(userId, {
        cardId: input.creditCardId,
        ...purchasePayload
      });

  return {
    excludedFromTotals: true,
    linkedCreditCardId: input.creditCardId,
    linkedCreditCardPurchaseId: purchase.id,
    linkedCreditCardInstallments: purchase.installments,
    linkedCreditCardAmount: input.amount,
    status: PaymentStatus.PAGO
  };
}

export async function updateFinancialItemValue(userId: string, id: string, input: UpdateFinancialItemValueInput) {
  const existing = await prisma.financialItem.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Registro financeiro nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  assertNotManualSavingsRedemption({
    type: existing.type,
    category: existing.category
  });

  const creditCardLinkData = input.paidWithCreditCard === true
    ? await upsertCreditCardPaymentLink(userId, existing, input)
    : input.paidWithCreditCard === false
      ? await clearCreditCardPaymentLink(userId, existing)
      : {};

  const updateData = {
    amount: input.amount,
    description: input.description ?? existing.description,
    ...creditCardLinkData
  };

  if (input.scope === 'ONLY_THIS_PERIOD') {
    await prisma.financialItem.update({ where: { id: existing.id }, data: updateData });
  } else {
    const months = boundedTargetMonths(existing.month, input.scope, input.endMonth);
    const selectedDate = input.date;
    const occurrenceDay = existing.dueDay ?? existing.dueDate?.getDate() ?? selectedDate.getDate();
    const recurrenceGroupId =
      existing.recurrenceGroupId ?? `${userId}:${existing.type}:${existing.category}:${existing.name}:${existing.year}`;

    await prisma.$transaction(async (tx) => {
      for (const month of months) {
        const monthItems = await tx.financialItem.findMany({
          where: {
            userId,
            type: existing.type,
            category: existing.category,
            name: existing.name,
            year: existing.year,
            month,
            OR: [
              { recurrenceGroupId },
              { recurrenceGroupId: existing.recurrenceGroupId },
              { recurrenceGroupId: null }
            ]
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
        });
        const [primary, ...duplicates] = monthItems;
        if (primary) {
          await tx.financialItem.update({
            where: { id: primary.id },
            data: {
              ...updateData,
              isFixed: primary.isFixed || existing.isFixed,
              recurrenceType: primary.recurrenceType !== RecurrenceType.NONE
                ? primary.recurrenceType
                : existing.recurrenceType,
              recurrenceGroupId
            }
          });
          if (duplicates.length) {
            await tx.financialItem.deleteMany({
              where: { id: { in: duplicates.map((item) => item.id) } }
            });
          }
          continue;
        }

        if (input.amount <= 0) continue;

        const occurrenceDate = dateForMonthlyOccurrence(existing.year, month, occurrenceDay);
        const dueDate = isExpenseType(existing.type) ? occurrenceDate : null;
        await tx.financialItem.create({
          data: {
            userId,
            title: existing.title,
            name: existing.name,
            description: input.description ?? existing.description,
            amount: input.amount,
            type: existing.type,
            category: existing.category,
            dueDate,
            paymentDate: null,
            status: normalizeStatus(existing.type, dueDate, null, existing.status),
            dueDay: existing.dueDay ?? (isExpenseType(existing.type) ? occurrenceDay : null),
            isFixed: existing.isFixed || existing.recurrenceType !== RecurrenceType.NONE || Boolean(existing.recurrenceGroupId),
            recurrenceType: existing.recurrenceType !== RecurrenceType.NONE
              ? existing.recurrenceType
              : RecurrenceType.MONTHLY,
            recurrenceGroupId,
            date: occurrenceDate,
            month,
            year: existing.year
          }
        });
      }
    });
  }

  const touchedWhere: Prisma.FinancialItemWhereInput = input.scope === 'ONLY_THIS_PERIOD'
    ? { id: existing.id, userId }
    : {
        userId,
        type: existing.type,
        category: existing.category,
        name: existing.name,
        year: existing.year,
        month: { in: boundedTargetMonths(existing.month, input.scope, input.endMonth) },
        recurrenceGroupId: existing.recurrenceGroupId ?? `${userId}:${existing.type}:${existing.category}:${existing.name}:${existing.year}`
      };

  const touchedItems = await prisma.financialItem.findMany({
    where: touchedWhere,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  });

  const yearItems = await prisma.financialItem.findMany({ where: { userId, year: existing.year } });
  const monthItems = yearItems.filter((item) => item.month === existing.month);

  const summarize = (items: typeof yearItems) => {
    const calculationItems = items.filter((item) => !item.excludedFromTotals);
    const totalIncome = calculationItems
      .filter((item) => item.type === FinancialItemType.INCOME)
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
    const totalExpense = calculationItems
      .filter((item) => item.type === FinancialItemType.EXPENSE)
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
    return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
  };

  return {
    items: touchedItems.map(serializeItem),
    changedCount: touchedItems.length,
    monthSummary: summarize(monthItems),
    yearSummary: summarize(yearItems)
  };
}
