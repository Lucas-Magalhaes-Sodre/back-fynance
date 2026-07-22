import { ReminderStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma.js';
import type {
  FinancialReminderInput,
  ListFinancialRemindersInput,
  UpdateFinancialReminderInput
} from './financial-reminder.schemas.js';

const maxRemindersPerItem = 3;

function serializeReminder(reminder: {
  id: string;
  userId: string;
  financialItemId: string;
  title: string;
  message: string | null;
  remindAt: Date;
  offsetDays: number | null;
  status: ReminderStatus;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  financialItem?: unknown;
}) {
  return reminder;
}

async function assertFinancialItemOwner(userId: string, financialItemId: string) {
  const item = await prisma.financialItem.findFirst({
    where: { id: financialItemId, userId },
    select: { id: true }
  });
  if (item) return;

  const error = new Error('Lancamento financeiro nao encontrado') as Error & { statusCode: number };
  error.statusCode = 404;
  throw error;
}

async function assertReminderLimit(userId: string, financialItemId: string, exceptId?: string) {
  const count = await prisma.financialReminder.count({
    where: {
      userId,
      financialItemId,
      id: exceptId ? { not: exceptId } : undefined
    }
  });
  if (count < maxRemindersPerItem) return;

  const error = new Error('Cada lancamento pode ter no maximo 3 lembretes') as Error & { statusCode: number };
  error.statusCode = 400;
  throw error;
}

export async function listFinancialReminders(userId: string, filters: ListFinancialRemindersInput) {
  const now = new Date();
  const reminders = await prisma.financialReminder.findMany({
    where: {
      userId,
      financialItemId: filters.financialItemId,
      status: filters.status,
      remindAt: filters.dueOnly
        ? { lte: now }
        : {
            gte: filters.from,
            lte: filters.to
          }
    },
    include: {
      financialItem: true
    },
    orderBy: [{ remindAt: 'asc' }, { createdAt: 'asc' }]
  });

  return reminders.map(serializeReminder);
}

export async function createFinancialReminder(userId: string, input: FinancialReminderInput) {
  await assertFinancialItemOwner(userId, input.financialItemId);
  await assertReminderLimit(userId, input.financialItemId);

  const reminder = await prisma.financialReminder.create({
    data: {
      userId,
      financialItemId: input.financialItemId,
      title: input.title.trim(),
      message: input.message?.trim() || null,
      remindAt: input.remindAt,
      offsetDays: input.offsetDays ?? null
    }
  });

  return serializeReminder(reminder);
}

export async function updateFinancialReminder(userId: string, id: string, input: UpdateFinancialReminderInput) {
  const existing = await prisma.financialReminder.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Lembrete nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  const nextFinancialItemId = input.financialItemId ?? existing.financialItemId;
  if (input.financialItemId && input.financialItemId !== existing.financialItemId) {
    await assertFinancialItemOwner(userId, input.financialItemId);
  }
  await assertReminderLimit(userId, nextFinancialItemId, id);

  const reminder = await prisma.financialReminder.update({
    where: { id },
    data: {
      financialItemId: input.financialItemId,
      title: input.title?.trim(),
      message: input.message === undefined ? undefined : input.message?.trim() || null,
      remindAt: input.remindAt,
      offsetDays: input.offsetDays === undefined ? undefined : input.offsetDays,
      status: input.status
    }
  });

  return serializeReminder(reminder);
}

export async function deleteFinancialReminder(userId: string, id: string) {
  const existing = await prisma.financialReminder.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error('Lembrete nao encontrado') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  await prisma.financialReminder.delete({ where: { id } });
}
