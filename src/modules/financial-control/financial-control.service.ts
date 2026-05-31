import { FinancialItemType, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, MONTHS } from './financial-control.constants.js';

type Item = Awaited<ReturnType<typeof prisma.financialItem.findMany>>[number];

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function serializeItem(item: Item) {
  return { ...item, amount: toNumber(item.amount) };
}

function isIncome(type: FinancialItemType) {
  return type === FinancialItemType.INCOME || type === FinancialItemType.FIXED_INCOME || type === FinancialItemType.EXTRA_INCOME;
}

function isExpense(type: FinancialItemType) {
  return type === FinancialItemType.EXPENSE || type === FinancialItemType.FIXED_EXPENSE || type === FinancialItemType.EXTRA_EXPENSE;
}

function summarize(items: Item[]) {
  const totalIncome = items.filter((item) => isIncome(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  const totalExpense = items.filter((item) => isExpense(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  const expenses = items.filter((item) => isExpense(item.type));
  const paidExpenses = expenses.filter((item) => item.status === PaymentStatus.PAGO);
  const overdueExpenses = expenses.filter((item) => item.status === PaymentStatus.ATRASADO);
  const pendingExpenses = expenses.filter((item) => item.status === PaymentStatus.PENDENTE);
  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
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

function categoryRows(items: Item[], categories: string[], type: 'INCOME' | 'EXPENSE') {
  const rows = categories.map((category) => ({
    category,
    type,
    months: Object.fromEntries(MONTHS.map((month) => [month.value, 0])) as Record<number, number>,
    total: 0
  }));

  const rowMap = new Map(rows.map((row) => [row.category, row]));

  for (const item of items) {
    const targetType = isIncome(item.type) ? 'INCOME' : 'EXPENSE';
    if (targetType !== type) continue;
    const category = rowMap.has(item.category) ? item.category : 'Outros';
    const row = rowMap.get(category);
    if (!row) continue;
    const amount = toNumber(item.amount);
    row.months[item.month] += amount;
    row.total += amount;
  }

  return rows;
}

export async function getYearControl(userId: string, year: number) {
  const items = await prisma.financialItem.findMany({
    where: { userId, year },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  });

  const monthlySummary = MONTHS.map((month) => {
    const monthItems = items.filter((item) => item.month === month.value);
    const totals = summarize(monthItems);
    return { month: month.value, label: month.label, ...totals };
  });

  const totalIncome = monthlySummary.reduce((sum, month) => sum + month.totalIncome, 0);
  const totalExpense = monthlySummary.reduce((sum, month) => sum + month.totalExpense, 0);
  const bestMonth = monthlySummary.reduce((best, month) => (month.balance > best.balance ? month : best), monthlySummary[0]);
  const worstMonth = monthlySummary.reduce((worst, month) => (month.balance < worst.balance ? month : worst), monthlySummary[0]);

  return {
    year,
    months: MONTHS,
    incomeRows: categoryRows(items, INCOME_CATEGORIES, 'INCOME'),
    expenseRows: categoryRows(items, EXPENSE_CATEGORIES, 'EXPENSE'),
    monthlySummary,
    totals: {
      totalIncome,
      totalExpense,
      finalBalance: totalIncome - totalExpense,
      bestMonth,
      worstMonth
    },
    items: items.map(serializeItem),
    categories: { incomes: INCOME_CATEGORIES, expenses: EXPENSE_CATEGORIES }
  };
}

export async function getMonthControl(userId: string, month: number, year: number) {
  const items = await prisma.financialItem.findMany({
    where: { userId, month, year },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  });

  return { month, year, ...splitItems(items), totals: summarize(items) };
}

export async function getDayControl(userId: string, date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const items = await prisma.financialItem.findMany({
    where: { userId, date: { gte: start, lte: end } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  });

  return { date: start.toISOString().slice(0, 10), ...splitItems(items), totals: summarize(items) };
}

export async function getWeekControl(userId: string, startDate: Date, endDate: Date) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const items = await prisma.financialItem.findMany({
    where: { userId, date: { gte: start, lte: end } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }]
  });

  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const dayKey = day.toISOString().slice(0, 10);
    const dayItems = items.filter((item) => item.date.toISOString().slice(0, 10) === dayKey);
    return { date: dayKey, ...splitItems(dayItems), totals: summarize(dayItems) };
  });

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    days,
    ...splitItems(items),
    totals: summarize(items)
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
