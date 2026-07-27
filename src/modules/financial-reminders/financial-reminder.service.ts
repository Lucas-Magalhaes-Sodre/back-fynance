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
  financialItemId: string | null;
  savingId: string | null;
  title: string;
  message: string | null;
  remindAt: Date;
  offsetDays: number | null;
  status: ReminderStatus;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  financialItem?: unknown;
  saving?: unknown;
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

async function assertSavingOwner(userId: string, savingId: string) {
  const saving = await prisma.savings.findFirst({
    where: { id: savingId, userId },
    select: { id: true }
  });
  if (saving) return;

  const error = new Error('Economia nao encontrada') as Error & { statusCode: number };
  error.statusCode = 404;
  throw error;
}

async function assertReminderLimit(
  userId: string,
  target: { financialItemId?: string | null; savingId?: string | null },
  exceptId?: string
) {
  const count = await prisma.financialReminder.count({
    where: {
      userId,
      financialItemId: target.financialItemId || undefined,
      savingId: target.savingId || undefined,
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
      savingId: filters.savingId,
      status: filters.status,
      remindAt: filters.dueOnly
        ? { lte: now }
        : {
            gte: filters.from,
            lte: filters.to
          }
    },
    include: {
      financialItem: true,
      saving: true
    },
    orderBy: [{ remindAt: 'asc' }, { createdAt: 'asc' }]
  });

  return reminders.map(serializeReminder);
}

export async function createFinancialReminder(userId: string, input: FinancialReminderInput) {
  if (input.financialItemId) await assertFinancialItemOwner(userId, input.financialItemId);
  if (input.savingId) await assertSavingOwner(userId, input.savingId);
  await assertReminderLimit(userId, {
    financialItemId: input.financialItemId,
    savingId: input.savingId
  });

  const reminder = await prisma.financialReminder.create({
    data: {
      userId,
      financialItemId: input.financialItemId ?? null,
      savingId: input.savingId ?? null,
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
  const nextSavingId = input.savingId ?? existing.savingId;
  if (input.financialItemId && input.financialItemId !== existing.financialItemId) {
    await assertFinancialItemOwner(userId, input.financialItemId);
  }
  if (input.savingId && input.savingId !== existing.savingId) {
    await assertSavingOwner(userId, input.savingId);
  }
  await assertReminderLimit(userId, { financialItemId: nextFinancialItemId, savingId: nextSavingId }, id);

  const reminder = await prisma.financialReminder.update({
    where: { id },
    data: {
      financialItemId: input.financialItemId,
      savingId: input.savingId,
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
