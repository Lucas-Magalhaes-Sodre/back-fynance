import { FinancialItemType, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';

type InsightType = 'POSITIVE' | 'WARNING' | 'INFO' | 'NEGATIVE';

type Insight = {
  type: InsightType;
  title: string;
  description: string;
  value?: number;
  actionLabel?: string;
  actionTarget?: string;
};

type Item = Awaited<ReturnType<typeof prisma.financialItem.findMany>>[number];

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function isIncome(type: FinancialItemType) {
  return type === FinancialItemType.INCOME;
}

function isExpense(type: FinancialItemType) {
  return type === FinancialItemType.EXPENSE;
}

function currentStatus(item: Pick<Item, 'type' | 'dueDate' | 'paymentDate' | 'status'>) {
  if (item.status === PaymentStatus.CANCELADO) return PaymentStatus.CANCELADO;
  if (!isExpense(item.type)) return PaymentStatus.PAGO;
  if (item.paymentDate || item.status === PaymentStatus.PAGO) return PaymentStatus.PAGO;

  if (item.dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(item.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) return PaymentStatus.ATRASADO;
  }

  return item.status;
}

function totals(items: Item[]) {
  const income = items.filter((item) => isIncome(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  const expense = items.filter((item) => isExpense(item.type)).reduce((sum, item) => sum + toNumber(item.amount), 0);
  return { income, expense, balance: income - expense };
}

function previousMonth(month: number, year: number) {
  if (month === 1) return { month: 12, year: year - 1 };
  return { month: month - 1, year };
}

function percentageVariation(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function getFinancialInsights(userId: string, month: number, year: number) {
  const previous = previousMonth(month, year);
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(now.getDate() + 7);

  const [currentItems, previousItems, savings, savedOut] = await Promise.all([
    prisma.financialItem.findMany({ where: { userId, month, year } }),
    prisma.financialItem.findMany({ where: { userId, month: previous.month, year: previous.year } }),
    prisma.savings.aggregate({ where: { userId, month, year }, _sum: { amount: true } }),
    prisma.savings.aggregate({ where: { userId, month, year, amount: { gt: 0 } }, _sum: { amount: true } })
  ]);

  const currentTotals = totals(currentItems);
  const previousTotals = totals(previousItems);
  const expenseVariation = percentageVariation(currentTotals.expense, previousTotals.expense);
  const monthlySavings = toNumber(savings._sum.amount ?? 0);
  const availableBalance = currentTotals.balance - toNumber(savedOut._sum.amount ?? 0);
  const expenses = currentItems.filter((item) => isExpense(item.type));
  const overdueBills = expenses.filter((item) => currentStatus(item) === PaymentStatus.ATRASADO);
  const upcomingPendingBills = expenses.filter((item) => {
    if (!item.dueDate || currentStatus(item) !== PaymentStatus.PENDENTE) return false;
    return item.dueDate >= now && item.dueDate <= sevenDaysFromNow;
  });

  const categoryTotals = new Map<string, number>();
  for (const item of expenses) {
    categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + toNumber(item.amount));
  }
  const topCategory = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1])[0];

  const insights: Insight[] = [
    {
      type: availableBalance >= 0 ? 'POSITIVE' : 'NEGATIVE',
      title: availableBalance >= 0 ? 'Saldo disponivel positivo no mes' : 'Saldo disponivel negativo no mes',
      description: availableBalance >= 0
        ? 'Suas receitas cobrem as despesas e economias/investimentos deste periodo.'
        : 'Suas despesas e economias/investimentos ultrapassaram as receitas deste periodo.',
      value: availableBalance
    },
    {
      type: expenseVariation > 10 ? 'WARNING' : 'INFO',
      title: 'Comparacao de despesas',
      description: `Suas despesas variaram ${expenseVariation.toFixed(1)}% em relacao ao mes anterior.`,
      value: expenseVariation
    },
    {
      type: monthlySavings > 0 ? 'POSITIVE' : 'INFO',
      title: 'Economias/investimentos registrados',
      description: monthlySavings > 0
        ? 'Voce registrou dinheiro guardado ou investido neste mes.'
        : 'Ainda nao ha economia/investimento registrada neste mes.',
      value: monthlySavings,
      actionLabel: 'Ver economias/invest.',
      actionTarget: '/app/savings'
    },
    {
      type: overdueBills.length > 0 ? 'NEGATIVE' : 'POSITIVE',
      title: 'Contas atrasadas',
      description: overdueBills.length > 0
        ? `Existem ${overdueBills.length} conta(s) atrasada(s).`
        : 'Nenhuma conta atrasada encontrada para este mes.',
      value: overdueBills.length,
      actionLabel: 'Ver controle',
      actionTarget: '/app/control'
    },
    {
      type: upcomingPendingBills.length > 0 ? 'WARNING' : 'INFO',
      title: 'Pendencias proximas',
      description: `Existem ${upcomingPendingBills.length} conta(s) pendente(s) para os proximos 7 dias.`,
      value: upcomingPendingBills.length,
      actionLabel: 'Ver calendario',
      actionTarget: '/app/control'
    }
  ];

  if (topCategory) {
    insights.push({
      type: 'INFO',
      title: 'Maior categoria de gasto',
      description: `Sua maior categoria de despesa no mes foi ${topCategory[0]}.`,
      value: topCategory[1]
    });
  }

  return { insights };
}
