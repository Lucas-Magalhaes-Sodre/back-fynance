import { FinancialItemType, PaymentStatus, Prisma, RecurrenceType } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreateFinancialItemInput,
  CategoryActionInput,
  ListFinancialItemsInput,
  RenameCategoryInput,
  UpdateFinancialItemValueInput,
  UpdateFinancialItemInput
} from './financial-item.schemas.js';

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
  date: Date;
  month: number;
  year: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...item, amount: toNumber(item.amount) };
}

function normalizeType(type: CreateFinancialItemInput['type'] | UpdateFinancialItemInput['type']) {
  if (type === FinancialItemType.FIXED_INCOME || type === FinancialItemType.EXTRA_INCOME) return FinancialItemType.INCOME;
  if (type === FinancialItemType.FIXED_EXPENSE || type === FinancialItemType.EXTRA_EXPENSE) return FinancialItemType.EXPENSE;
  return type;
}

function isExpenseType(type: FinancialItemType | undefined) {
  return type === FinancialItemType.EXPENSE || type === FinancialItemType.FIXED_EXPENSE || type === FinancialItemType.EXTRA_EXPENSE;
}

function typeFilter(type: 'INCOME' | 'EXPENSE') {
  return type === 'INCOME'
    ? [FinancialItemType.INCOME, FinancialItemType.FIXED_INCOME, FinancialItemType.EXTRA_INCOME]
    : [FinancialItemType.EXPENSE, FinancialItemType.FIXED_EXPENSE, FinancialItemType.EXTRA_EXPENSE];
}

function normalizeStatus(type: FinancialItemType, dueDate?: Date | null, paymentDate?: Date | null, status?: PaymentStatus) {
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

function inferCategory(input: CreateFinancialItemInput | UpdateFinancialItemInput) {
  if (input.category) return input.category;
  if (input.type === FinancialItemType.FIXED_INCOME) return 'Receitas fixas';
  if (input.type === FinancialItemType.EXTRA_INCOME) return 'Receitas extras';
  if (input.type === FinancialItemType.FIXED_EXPENSE) return 'Despesas fixas';
  if (input.type === FinancialItemType.EXTRA_EXPENSE) return 'Despesas extras';
  return 'Outros';
}

function normalizeWriteInput(input: CreateFinancialItemInput) {
  const date = input.date;
  const type = normalizeType(input.type) ?? FinancialItemType.EXPENSE;
  const name = input.name ?? input.title ?? 'Lancamento';
  const isFixed = input.isFixed ?? (input.type === FinancialItemType.FIXED_INCOME || input.type === FinancialItemType.FIXED_EXPENSE);

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
    date: {
      gte: filters.startDate,
      lte: filters.endDate
    }
  };

  const items = await prisma.financialItem.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });

  return items.map(serializeItem);
}

export async function createFinancialItem(userId: string, input: CreateFinancialItemInput) {
  const data = normalizeWriteInput(input);
  const item = await prisma.financialItem.create({
    data: {
      userId,
      ...data
    }
  });

  return serializeItem(item);
}

export async function updateFinancialItem(userId: string, id: string, input: UpdateFinancialItemInput) {
  const existing = await prisma.financialItem.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Registro financeiro nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

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

export async function deleteFinancialItem(userId: string, id: string) {
  const existing = await prisma.financialItem.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Registro financeiro nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

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

  const result = await prisma.financialItem.deleteMany({ where });
  return { deletedCount: result.count };
}

export async function getDashboard(userId: string) {
  const items = await prisma.financialItem.findMany({
    where: { userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });

  const totals = {
    fixedExpenses: 0,
    extraExpenses: 0,
    fixedIncomes: 0,
    extraIncomes: 0,
    totalIncomes: 0,
    totalExpenses: 0,
    finalBalance: 0
  };

  for (const item of items) {
    const amount = toNumber(item.amount);
    if (item.type === FinancialItemType.FIXED_EXPENSE) totals.fixedExpenses += amount;
    if (item.type === FinancialItemType.EXTRA_EXPENSE || item.type === FinancialItemType.EXPENSE) totals.extraExpenses += amount;
    if (item.type === FinancialItemType.FIXED_INCOME) totals.fixedIncomes += amount;
    if (item.type === FinancialItemType.EXTRA_INCOME || item.type === FinancialItemType.INCOME) totals.extraIncomes += amount;
  }

  totals.totalIncomes = totals.fixedIncomes + totals.extraIncomes;
  totals.totalExpenses = totals.fixedExpenses + totals.extraExpenses;
  totals.finalBalance = totals.totalIncomes - totals.totalExpenses;

  return { totals, recentItems: items.slice(0, 8).map(serializeItem) };
}

export async function updateFinancialItemValue(userId: string, id: string, input: UpdateFinancialItemValueInput) {
  const existing = await prisma.financialItem.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Registro financeiro nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const updateData = {
    amount: input.amount,
    description: input.description ?? existing.description
  };

  let where: Prisma.FinancialItemWhereInput = { id, userId };

  if (input.scope !== 'ONLY_THIS_PERIOD' && existing.recurrenceGroupId) {
    where = {
      userId,
      recurrenceGroupId: existing.recurrenceGroupId,
      year: existing.year
    };

    if (input.scope === 'FROM_THIS_PERIOD_FORWARD') {
      where.month = { gte: existing.month };
    }
  }

  await prisma.financialItem.updateMany({ where, data: updateData });

  const touchedItems = await prisma.financialItem.findMany({
    where,
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  });

  const yearItems = await prisma.financialItem.findMany({ where: { userId, year: existing.year } });
  const monthItems = yearItems.filter((item) => item.month === existing.month);

  const summarize = (items: typeof yearItems) => {
    const totalIncome = items
      .filter((item) => item.type === FinancialItemType.INCOME || item.type === FinancialItemType.FIXED_INCOME || item.type === FinancialItemType.EXTRA_INCOME)
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
    const totalExpense = items
      .filter((item) => item.type === FinancialItemType.EXPENSE || item.type === FinancialItemType.FIXED_EXPENSE || item.type === FinancialItemType.EXTRA_EXPENSE)
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
