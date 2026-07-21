import { FinancialItemType, PaymentStatus, Prisma, RecurrenceType } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  CreditCardInput,
  DeleteCreditCardPurchaseInput,
  CreditCardPurchaseInput,
  ListCreditCardsInput,
  UpdateCreditCardInput,
  UpdateCreditCardPurchaseInput
} from './credit-card.schemas.js';

const CREDIT_CARD_CATEGORIES = ['Cartões de Crédito', 'Cartão de Crédito'];
const CREDIT_CARD_CATEGORY = 'Cartões de Crédito';
const AUTO_DESCRIPTION = 'Gerado automaticamente pelo detalhamento do cartao';

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function normalizeName(name: string) {
  return name.trim();
}

function monthCursor(year: number, month: number) {
  return year * 12 + month;
}

function monthDiff(startYear: number, startMonth: number, targetYear: number, targetMonth: number) {
  return monthCursor(targetYear, targetMonth) - monthCursor(startYear, startMonth);
}

function autoRecurrenceGroupId(cardId: string, year: number, month: number) {
  return `CREDIT_CARD_AUTO:${cardId}:${year}:${month}`;
}

function dateForCardBill(year: number, month: number, dueDay: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(year, month - 1, day);
}

function serializeCard(card: {
  id: string;
  userId: string;
  name: string;
  dueDay: number;
  creditLimit: Prisma.Decimal | null;
  isActive: boolean;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...card, creditLimit: card.creditLimit ? toNumber(card.creditLimit) : null };
}

function serializePurchase(purchase: {
  id: string;
  userId: string;
  cardId: string;
  title: string;
  description: string | null;
  amount: Prisma.Decimal;
  purchaseDate: Date;
  installments: number;
  skippedInstallments: number[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return { ...purchase, amount: toNumber(purchase.amount) };
}

function installmentForMonth(
  purchase: { amount: Prisma.Decimal; purchaseDate: Date; installments: number; skippedInstallments?: number[] },
  month: number,
  year: number
) {
  const purchaseMonth = purchase.purchaseDate.getMonth() + 1;
  const purchaseYear = purchase.purchaseDate.getFullYear();
  const installmentIndex = monthDiff(purchaseYear, purchaseMonth, year, month);
  if (installmentIndex < 0 || installmentIndex >= purchase.installments) return null;
  if (purchase.skippedInstallments?.includes(installmentIndex + 1)) return null;

  return {
    installmentNumber: installmentIndex + 1,
    installmentAmount: toNumber(purchase.amount) / purchase.installments
  };
}

function periodsForPurchase(purchase: { purchaseDate: Date; installments: number }) {
  const periods: Array<{ year: number; month: number }> = [];
  const startYear = purchase.purchaseDate.getFullYear();
  const startMonth = purchase.purchaseDate.getMonth() + 1;
  for (let index = 0; index < purchase.installments; index += 1) {
    const cursor = monthCursor(startYear, startMonth) + index;
    periods.push({
      year: Math.floor((cursor - 1) / 12),
      month: ((cursor - 1) % 12) + 1
    });
  }
  return periods;
}

function periodForInstallment(purchase: { purchaseDate: Date }, installmentNumber: number) {
  const startYear = purchase.purchaseDate.getFullYear();
  const startMonth = purchase.purchaseDate.getMonth() + 1;
  const cursor = monthCursor(startYear, startMonth) + installmentNumber - 1;
  return {
    year: Math.floor((cursor - 1) / 12),
    month: ((cursor - 1) % 12) + 1
  };
}

function uniquePeriods(periods: Array<{ year: number; month: number }>) {
  const map = new Map<string, { year: number; month: number }>();
  for (const period of periods) {
    map.set(`${period.year}:${period.month}`, period);
  }
  return Array.from(map.values());
}

async function assertCardExists(userId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId } });
  if (card) return card;

  const error = new Error('Cartao nao encontrado') as Error & { statusCode: number };
  error.statusCode = 404;
  throw error;
}

async function syncCardFinancialPeriods(userId: string, cardId: string, periods: Array<{ year: number; month: number }>) {
  const unique = uniquePeriods(periods);
  if (!unique.length) return;

  const card = await assertCardExists(userId, cardId);
  const purchases = await prisma.creditCardPurchase.findMany({ where: { userId, cardId } });

  for (const period of unique) {
    const detailedAmount = purchases.reduce((sum, purchase) => {
      const installment = installmentForMonth(purchase, period.month, period.year);
      return sum + (installment?.installmentAmount ?? 0);
    }, 0);
    const recurrenceGroupId = autoRecurrenceGroupId(cardId, period.year, period.month);
    const financialItems = await prisma.financialItem.findMany({
      where: {
        userId,
        type: FinancialItemType.EXPENSE,
        category: { in: CREDIT_CARD_CATEGORIES },
        name: card.name,
        month: period.month,
        year: period.year
      }
    });
    const autoItem = financialItems.find((item) => item.recurrenceGroupId === recurrenceGroupId);
    const manualAmount = financialItems
      .filter((item) => item.recurrenceGroupId !== recurrenceGroupId)
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
    const autoAmount = Math.max(detailedAmount - manualAmount, 0);
    const date = dateForCardBill(period.year, period.month, card.dueDay);

    if (autoAmount <= 0) {
      if (autoItem) await prisma.financialItem.delete({ where: { id: autoItem.id } });
      continue;
    }

    if (autoItem) {
      await prisma.financialItem.update({
        where: { id: autoItem.id },
        data: {
          title: card.name,
          name: card.name,
          category: CREDIT_CARD_CATEGORY,
          amount: autoAmount,
          dueDate: date,
          date,
          dueDay: card.dueDay,
          month: period.month,
          year: period.year,
          description: AUTO_DESCRIPTION
        }
      });
      continue;
    }

    await prisma.financialItem.create({
      data: {
        userId,
        title: card.name,
        name: card.name,
        description: AUTO_DESCRIPTION,
        amount: autoAmount,
        type: FinancialItemType.EXPENSE,
        category: CREDIT_CARD_CATEGORY,
        dueDate: date,
        paymentDate: null,
        status: PaymentStatus.PENDENTE,
        dueDay: card.dueDay,
        isFixed: false,
        recurrenceType: RecurrenceType.NONE,
        recurrenceGroupId,
        date,
        month: period.month,
        year: period.year
      }
    });
  }
}

export async function listCreditCards(userId: string, filters: ListCreditCardsInput) {
  const now = new Date();
  const month = filters.month ?? now.getMonth() + 1;
  const year = filters.year ?? now.getFullYear();
  const cards = await prisma.creditCard.findMany({
    where: {
      userId,
      id: filters.cardId,
      name: filters.cardName ? { equals: filters.cardName, mode: 'insensitive' } : undefined
    },
    orderBy: { name: 'asc' }
  });

  const purchases = await prisma.creditCardPurchase.findMany({
    where: {
      userId,
      cardId: { in: cards.map((card) => card.id) }
    },
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }]
  });

  const statementItems = await prisma.financialItem.findMany({
    where: {
      userId,
      type: FinancialItemType.EXPENSE,
      category: { in: CREDIT_CARD_CATEGORIES },
      year
    }
  });

  const cardSummaries = cards.map((card) => {
    const cardPurchases = purchases.filter((purchase) => purchase.cardId === card.id);
    const cardStatementItems = statementItems
      .filter((item) => item.name.toLocaleLowerCase('pt-BR') === card.name.toLocaleLowerCase('pt-BR'))
    const monthlySummary = Array.from({ length: 12 }, (_, index) => {
      const summaryMonth = index + 1;
      const monthPurchases = cardPurchases.flatMap((purchase) => {
        const installment = installmentForMonth(purchase, summaryMonth, year);
        if (!installment) return [];
        return [{ ...serializePurchase(purchase), ...installment }];
      });
      const detailedAmount = monthPurchases.reduce((sum, purchase) => sum + purchase.installmentAmount, 0);
      const statementAmount = cardStatementItems
        .filter((item) => item.month === summaryMonth)
        .reduce((sum, item) => sum + toNumber(item.amount), 0);
      const otherAmount = Math.max(statementAmount - detailedAmount, 0);

      return {
        month: summaryMonth,
        label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(year, index, 1)),
        statementAmount,
        detailedAmount,
        otherAmount,
        purchases: monthPurchases
      };
    });
    const currentMonthSummary = monthlySummary.find((summary) => summary.month === month) ?? monthlySummary[0];
    const statementAmount = currentMonthSummary.statementAmount;
    const detailedAmount = currentMonthSummary.detailedAmount;
    const monthPurchases = currentMonthSummary.purchases;
    const otherAmount = Math.max(statementAmount - detailedAmount, 0);
    const yearStatementAmount = monthlySummary.reduce((sum, summary) => sum + summary.statementAmount, 0);
    const creditLimit = card.creditLimit ? toNumber(card.creditLimit) : null;

    return {
      ...serializeCard(card),
      statementAmount,
      detailedAmount,
      otherAmount,
      usedAmount: statementAmount,
      usedPercent: creditLimit && creditLimit > 0 ? Math.min((statementAmount / creditLimit) * 100, 100) : null,
      yearStatementAmount,
      monthlySummary,
      monthPurchases
    };
  });

  return { cards: cardSummaries, month, year };
}

export async function createCreditCard(userId: string, input: CreditCardInput) {
  const name = normalizeName(input.name);
  try {
    const card = await prisma.creditCard.create({
      data: {
        userId,
        name,
        dueDay: input.dueDay,
        creditLimit: input.creditLimit ?? null,
        color: input.color?.toUpperCase() ?? '#0F766E',
        isActive: input.isActive ?? true
      }
    });
    return serializeCard(card);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const conflict = new Error('Ja existe um cartao com este nome') as Error & { statusCode: number };
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

export async function updateCreditCard(userId: string, id: string, input: UpdateCreditCardInput) {
  const existing = await assertCardExists(userId, id);
  const nextName = input.name ? normalizeName(input.name) : undefined;
  const card = await prisma.creditCard.update({
    where: { id },
    data: {
      name: nextName,
      dueDay: input.dueDay,
      creditLimit: input.creditLimit,
      color: input.color?.toUpperCase(),
      isActive: input.isActive
    }
  });
  if (nextName && nextName !== existing.name) {
    await prisma.financialItem.updateMany({
      where: {
        userId,
        type: FinancialItemType.EXPENSE,
        category: { in: CREDIT_CARD_CATEGORIES },
        name: existing.name
      },
      data: {
        title: nextName,
        name: nextName
      }
    });
  }
  return serializeCard(card);
}

export async function deleteCreditCard(userId: string, id: string) {
  await assertCardExists(userId, id);
  await prisma.financialItem.deleteMany({
    where: {
      userId,
      recurrenceGroupId: { startsWith: `CREDIT_CARD_AUTO:${id}:` }
    }
  });
  await prisma.creditCard.delete({ where: { id } });
}

export async function createCreditCardPurchase(userId: string, input: CreditCardPurchaseInput) {
  await assertCardExists(userId, input.cardId);
  const purchase = await prisma.creditCardPurchase.create({
    data: {
      userId,
      cardId: input.cardId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      amount: input.amount,
      purchaseDate: input.purchaseDate,
      installments: input.installments,
      skippedInstallments: []
    }
  });
  await syncCardFinancialPeriods(userId, input.cardId, periodsForPurchase(purchase));
  return serializePurchase(purchase);
}

export async function updateCreditCardPurchase(
  userId: string,
  id: string,
  input: UpdateCreditCardPurchaseInput
) {
  const existing = await prisma.creditCardPurchase.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Compra nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const purchase = await prisma.creditCardPurchase.update({
    where: { id },
    data: {
      title: input.title?.trim(),
      description: input.description?.trim() || input.description,
      amount: input.amount,
      purchaseDate: input.purchaseDate,
      installments: input.installments,
      skippedInstallments: input.purchaseDate || input.installments ? [] : undefined
    }
  });
  await syncCardFinancialPeriods(userId, existing.cardId, [
    ...periodsForPurchase(existing),
    ...periodsForPurchase(purchase)
  ]);
  return serializePurchase(purchase);
}

export async function deleteCreditCardPurchase(userId: string, id: string, input: DeleteCreditCardPurchaseInput) {
  const existing = await prisma.creditCardPurchase.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Compra nao encontrada') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  if (input.deleteAllInstallments || existing.installments <= 1 || !input.installmentNumber) {
    await prisma.creditCardPurchase.delete({ where: { id } });
    await syncCardFinancialPeriods(userId, existing.cardId, periodsForPurchase(existing));
    return;
  }

  const skippedInstallments = Array.from(new Set([...existing.skippedInstallments, input.installmentNumber])).sort((a, b) => a - b);
  if (skippedInstallments.length >= existing.installments) {
    await prisma.creditCardPurchase.delete({ where: { id } });
    await syncCardFinancialPeriods(userId, existing.cardId, periodsForPurchase(existing));
    return;
  }

  await prisma.creditCardPurchase.update({
    where: { id },
    data: { skippedInstallments }
  });
  await syncCardFinancialPeriods(userId, existing.cardId, [
    input.month && input.year
      ? { month: input.month, year: input.year }
      : periodForInstallment(existing, input.installmentNumber)
  ]);
}
