import { FinancialItemType, PaymentStatus, Prisma, RecurrenceType } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';

type CalendarItem = {
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
};

type CalendarSaving = {
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
};

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isIncome(type: FinancialItemType) {
  return type === FinancialItemType.INCOME;
}

function isExpense(type: FinancialItemType) {
  return type === FinancialItemType.EXPENSE;
}

function currentStatus(item: Pick<CalendarItem, 'type' | 'dueDate' | 'paymentDate' | 'status'>) {
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

function serializeItem(item: CalendarItem) {
  return { ...item, amount: toNumber(item.amount), status: currentStatus(item) };
}

function serializeSaving(saving: CalendarSaving) {
  return { ...saving, amount: toNumber(saving.amount) };
}

export async function getFinancialCalendar(userId: string, month: number, year: number) {
  const daysInMonth = new Date(year, month, 0).getDate();

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

  const serializedItems = items.map(serializeItem);
  const serializedSavings = savings.map(serializeSaving);

  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index + 1));
    const key = dateKey(date);
    const dayItems = serializedItems.filter((item) => dateKey(item.date) === key);
    const daySavings = serializedSavings.filter((saving) => dateKey(saving.date) === key);
    const incomes = dayItems.filter((item) => isIncome(item.type)).reduce((sum, item) => sum + item.amount, 0);
    const expenses = dayItems.filter((item) => isExpense(item.type)).reduce((sum, item) => sum + item.amount, 0);
    const savingTotal = daySavings.reduce((sum, saving) => sum + saving.amount, 0);
    const savedOut = daySavings.reduce((sum, saving) => (saving.amount > 0 ? sum + saving.amount : sum), 0);
    const pendingBills = dayItems.filter((item) => isExpense(item.type) && item.status === PaymentStatus.PENDENTE);
    const overdueBills = dayItems.filter((item) => isExpense(item.type) && item.status === PaymentStatus.ATRASADO);

    return {
      date: key,
      incomes,
      expenses,
      savings: savingTotal,
      pendingBills: pendingBills.length,
      overdueBills: overdueBills.length,
      balance: incomes - expenses - savedOut,
      items: dayItems,
      savingItems: daySavings
    };
  });

  return { month, year, days };
}
