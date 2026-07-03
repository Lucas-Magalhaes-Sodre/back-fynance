import { FinancialItemType, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { MONTHS } from './financial-control.constants.js';

type Item = Awaited<ReturnType<typeof prisma.financialItem.findMany>>[number];
type SavingItem = Awaited<ReturnType<typeof prisma.savings.findMany>>[number];

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function serializeItem(item: Item) {
  return { ...item, amount: toNumber(item.amount) };
}

function serializeSaving(saving: SavingItem) {
  return { ...saving, amount: toNumber(saving.amount) };
}

function isIncome(type: FinancialItemType) {
  return type === FinancialItemType.INCOME;
}

function isExpense(type: FinancialItemType) {
  return type === FinancialItemType.EXPENSE;
}

function summarize(items: Item[], savings: SavingItem[] = []) {
  const totalIncome = items.filter((item) => isIncome(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  const totalExpense = items.filter((item) => isExpense(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  const totalSavings = savings.reduce((sum, saving) => sum + toNumber(saving.amount), 0);
  const savingsOut = savings.reduce((sum, saving) => {
    const amount = toNumber(saving.amount);
    return amount > 0 ? sum + amount : sum;
  }, 0);
  const expenses = items.filter((item) => isExpense(item.type));
  const paidExpenses = expenses.filter((item) => item.status === PaymentStatus.PAGO);
  const overdueExpenses = expenses.filter((item) => item.status === PaymentStatus.ATRASADO);
  const pendingExpenses = expenses.filter((item) => item.status === PaymentStatus.PENDENTE);
  return {
    totalIncome,
    totalExpense,
    totalSavings,
    balance: totalIncome - totalExpense - savingsOut,
    paidExpenses: paidExpenses.reduce((sum, item) => sum + toNumber(item.amount), 0),
    pendingExpenses: pendingExpenses.reduce((sum, item) => sum + toNumber(item.amount), 0),
    overdueExpenses: overdueExpenses.reduce((sum, item) => sum + toNumber(item.amount), 0),
    paidExpensesCount: paidExpenses.length,
    pendingExpensesCount: pendingExpenses.length,
    overdueExpensesCount: overdueExpenses.length
  };
}

function splitItems(items: Item[]) {
  return {
    incomes: items.filter((item) => isIncome(item.type)).map(serializeItem),
    expenses: items.filter((item) => isExpense(item.type)).map(serializeItem)
  };
}

function savingRows(savings: SavingItem[]) {
  const rowMap = new Map<string, {
    category: string;
    type: 'SAVING';
    months: Record<number, number>;
    total: number;
  }>();

  for (const saving of savings) {
    const category = saving.category ?? 'Outros';
    if (!rowMap.has(category)) {
      rowMap.set(category, {
        category,
        type: 'SAVING',
        months: Object.fromEntries(MONTHS.map((month) => [month.value, 0])) as Record<number, number>,
        total: 0
      });
    }
    const row = rowMap.get(category);
    if (!row) continue;
    const amount = toNumber(saving.amount);
    row.months[saving.month] += amount;
    row.total += amount;
  }

  return Array.from(rowMap.values()).sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'));
}

function categoryRows(items: Item[], type: 'INCOME' | 'EXPENSE') {
  const rowMap = new Map<string, {
    category: string;
    type: 'INCOME' | 'EXPENSE';
    months: Record<number, number>;
    total: number;
  }>();

  for (const item of items) {
    const targetType = isIncome(item.type) ? 'INCOME' : 'EXPENSE';
    if (targetType !== type) continue;
    const category = item.category;
    if (!rowMap.has(category)) {
      rowMap.set(category, {
        category,
        type,
        months: Object.fromEntries(MONTHS.map((month) => [month.value, 0])) as Record<number, number>,
        total: 0
      });
    }
    const row = rowMap.get(category);
    if (!row) continue;
    const amount = toNumber(item.amount);
    row.months[item.month] += amount;
    row.total += amount;
  }

  return Array.from(rowMap.values()).sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'));
}

export async function getYearControl(userId: string, year: number) {
  const [items, savings] = await Promise.all([
    prisma.financialItem.findMany({
      where: { userId, year },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.savings.findMany({
      where: { userId, year },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  const monthlySummary = MONTHS.map((month) => {
    const monthItems = items.filter((item) => item.month === month.value);
    const monthSavings = savings.filter((saving) => saving.month === month.value);
    const totals = summarize(monthItems, monthSavings);
    return { month: month.value, label: month.label, ...totals };
  });

  const totalIncome = monthlySummary.reduce((sum, month) => sum + month.totalIncome, 0);
  const totalExpense = monthlySummary.reduce((sum, month) => sum + month.totalExpense, 0);
  const totalSavings = monthlySummary.reduce((sum, month) => sum + month.totalSavings, 0);
  const finalBalance = monthlySummary.reduce((sum, month) => sum + month.balance, 0);
  const bestMonth = monthlySummary.reduce((best, month) => (month.balance > best.balance ? month : best), monthlySummary[0]);
  const worstMonth = monthlySummary.reduce((worst, month) => (month.balance < worst.balance ? month : worst), monthlySummary[0]);

  return {
    year,
    months: MONTHS,
    incomeRows: categoryRows(items, 'INCOME'),
    expenseRows: categoryRows(items, 'EXPENSE'),
    savingRows: savingRows(savings),
    monthlySummary,
    totals: {
      totalIncome,
      totalExpense,
      totalSavings,
      finalBalance,
      bestMonth,
      worstMonth
    },
    items: items.map(serializeItem),
    savings: savings.map(serializeSaving),
    categories: {
      incomes: Array.from(new Set(items.filter((item) => isIncome(item.type)).map((item) => item.category))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      expenses: Array.from(new Set(items.filter((item) => isExpense(item.type)).map((item) => item.category))).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
  };
}

export async function getMonthControl(userId: string, month: number, year: number) {
  const [items, savings] = await Promise.all([
    prisma.financialItem.findMany({
      where: { userId, month, year },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.savings.findMany({
      where: { userId, month, year },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  return { month, year, ...splitItems(items), savings: savings.map(serializeSaving), totals: summarize(items, savings) };
}

export async function getDayControl(userId: string, date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const [items, savings] = await Promise.all([
    prisma.financialItem.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.savings.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  return { date: start.toISOString().slice(0, 10), ...splitItems(items), savings: savings.map(serializeSaving), totals: summarize(items, savings) };
}

export async function getWeekControl(userId: string, startDate: Date, endDate: Date) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const [items, savings] = await Promise.all([
    prisma.financialItem.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    }),
    prisma.savings.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const dayKey = day.toISOString().slice(0, 10);
    const dayItems = items.filter((item) => item.date.toISOString().slice(0, 10) === dayKey);
    const daySavings = savings.filter((saving) => saving.date.toISOString().slice(0, 10) === dayKey);
    return { date: dayKey, ...splitItems(dayItems), savings: daySavings.map(serializeSaving), totals: summarize(dayItems, daySavings) };
  });

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    days,
    ...splitItems(items),
    savings: savings.map(serializeSaving),
    totals: summarize(items, savings)
  };
}

export async function getYearSummary(userId: string, year: number) {
  const control = await getYearControl(userId, year);
  return {
    totalIncome: control.totals.totalIncome,
    totalExpense: control.totals.totalExpense,
    finalBalance: control.totals.finalBalance,
    monthlySummary: control.monthlySummary
  };
}
