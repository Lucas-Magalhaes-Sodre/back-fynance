import { FinancialItemType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import { MONTHS } from '../financial-control/financial-control.constants.js';

type Item = Awaited<ReturnType<typeof prisma.financialItem.findMany>>[number];

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function isIncome(type: FinancialItemType) {
  return type === FinancialItemType.INCOME || type === FinancialItemType.FIXED_INCOME || type === FinancialItemType.EXTRA_INCOME;
}

function isExpense(type: FinancialItemType) {
  return type === FinancialItemType.EXPENSE || type === FinancialItemType.FIXED_EXPENSE || type === FinancialItemType.EXTRA_EXPENSE;
}

function previousMonth(month: number, year: number) {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

function variation(current: number, previous: number) {
  return {
    value: current - previous,
    percentage: previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100
  };
}

function summarize(items: Item[], savings: number) {
  const income = items.filter((item) => isIncome(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  const expense = items.filter((item) => isExpense(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  return { income, expense, savings, balance: income - expense };
}

async function savingsTotal(userId: string, month: number, year: number) {
  const result = await prisma.savings.aggregate({
    where: { userId, month, year },
    _sum: { amount: true }
  });
  return toNumber(result._sum.amount ?? 0);
}

export async function getFinancialComparison(userId: string, month: number, year: number) {
  const previous = previousMonth(month, year);
  const [currentItems, previousItems, yearItems, currentSavings, previousSavings, yearSavings] = await Promise.all([
    prisma.financialItem.findMany({ where: { userId, month, year } }),
    prisma.financialItem.findMany({ where: { userId, month: previous.month, year: previous.year } }),
    prisma.financialItem.findMany({ where: { userId, year } }),
    savingsTotal(userId, month, year),
    savingsTotal(userId, previous.month, previous.year),
    prisma.savings.findMany({ where: { userId, year } })
  ]);

  const currentMonth = summarize(currentItems, currentSavings);
  const previousMonthSummary = summarize(previousItems, previousSavings);

  const monthlyEvolution = MONTHS.map((monthItem) => {
    const monthItems = yearItems.filter((item) => item.month === monthItem.value);
    const savings = yearSavings
      .filter((saving) => saving.month === monthItem.value)
      .reduce((sum, saving) => sum + toNumber(saving.amount), 0);
    return {
      month: monthItem.value,
      label: monthItem.label,
      ...summarize(monthItems, savings)
    };
  });

  const rankedMonths = monthlyEvolution.slice().sort((a, b) => b.balance - a.balance);

  return {
    currentMonth,
    previousMonth: previousMonthSummary,
    incomeVariation: variation(currentMonth.income, previousMonthSummary.income),
    expenseVariation: variation(currentMonth.expense, previousMonthSummary.expense),
    balanceVariation: variation(currentMonth.balance, previousMonthSummary.balance),
    savingsVariation: variation(currentMonth.savings, previousMonthSummary.savings),
    monthlyEvolution,
    bestMonths: rankedMonths.slice(0, 3),
    worstMonths: rankedMonths.slice(-3).reverse()
  };
}
