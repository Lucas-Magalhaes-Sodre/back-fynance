import { FinancialItemType, PaymentStatus, Prisma, RecurrenceType } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreateFinancialItemInput,
  CategoryActionInput,
  ListFinancialItemsInput,
  PaymentSummaryInput,
  PaymentStatusUpdateInput,
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
  return { ...item, amount: toNumber(item.amount), status: currentStatus(item) };
}

function normalizeType(type: CreateFinancialItemInput['type'] | UpdateFinancialItemInput['type']) {
  if (type === FinancialItemType.INCOME) return FinancialItemType.INCOME;
  if (type === FinancialItemType.EXPENSE) return FinancialItemType.EXPENSE;
  return undefined;
}

function isExpenseType(type: FinancialItemType | undefined) {
  return type === FinancialItemType.EXPENSE;
}

function typeFilter(type: 'INCOME' | 'EXPENSE') {
  return type === 'INCOME'
    ? [FinancialItemType.INCOME]
    : [FinancialItemType.EXPENSE];
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
      .filter((item) => item.type === FinancialItemType.INCOME)
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
    const totalExpense = items
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
