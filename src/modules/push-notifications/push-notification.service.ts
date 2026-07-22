import { prisma } from '../../shared/prisma.js';
import type { RegisterPushTokenInput } from './push-notification.schemas.js';

type ExpoPushMessage = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, string>;
};

const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isExpoPushToken(token: string) {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

export async function registerPushToken(userId: string, input: RegisterPushTokenInput) {
  const token = input.token.trim();
  if (!isExpoPushToken(token)) {
    const error = new Error('Token push invalido') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  return prisma.pushToken.upsert({
    where: { token },
    create: {
      userId,
      token,
      platform: input.platform ?? null,
      deviceName: input.deviceName ?? null
    },
    update: {
      userId,
      platform: input.platform ?? null,
      deviceName: input.deviceName ?? null,
      isActive: true
    }
  });
}

export async function deactivatePushToken(userId: string, token: string) {
  await prisma.pushToken.updateMany({
    where: { userId, token },
    data: { isActive: false }
  });
}

async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  if (!messages.length) return;

  for (const group of chunk(messages, 100)) {
    const response = await fetch(expoPushUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(group)
    });

    if (!response.ok) {
      throw new Error(`Expo push failed with status ${response.status}`);
    }
  }
}

export async function dispatchDuePushReminders(now = new Date()) {
  const reminders = await prisma.financialReminder.findMany({
    where: {
      status: 'PENDING',
      sentAt: null,
      remindAt: { lte: now },
      user: {
        pushTokens: {
          some: { isActive: true }
        }
      }
    },
    include: {
      financialItem: true,
      user: {
        include: {
          pushTokens: {
            where: { isActive: true }
          }
        }
      }
    },
    orderBy: [{ remindAt: 'asc' }, { createdAt: 'asc' }],
    take: 100
  });

  const messages = reminders.flatMap((reminder) =>
    reminder.user.pushTokens
      .filter((pushToken) => isExpoPushToken(pushToken.token))
      .map((pushToken) => ({
        to: pushToken.token,
        sound: 'default' as const,
        title: reminder.title,
        body: reminder.message || `Lembrete financeiro: ${reminder.financialItem.title}`,
        data: {
          reminderId: reminder.id,
          financialItemId: reminder.financialItemId
        }
      }))
  );

  await sendExpoPushMessages(messages);

  if (reminders.length) {
    await prisma.financialReminder.updateMany({
      where: { id: { in: reminders.map((reminder) => reminder.id) } },
      data: { sentAt: now }
    });
  }

  return { reminders: reminders.length, messages: messages.length };
}
