import { prisma } from '../../shared/prisma.js';
import { env } from '../../shared/env.js';
import type { RegisterPushTokenInput } from './push-notification.schemas.js';
import webPush, { type PushSubscription } from 'web-push';

type ExpoPushMessage = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, string>;
};

const expoPushUrl = 'https://exp.host/--/api/v2/push/send';
const webPushPlatform = 'WEB';

if (env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY) {
  webPush.setVapidDetails(
    env.WEB_PUSH_SUBJECT || 'mailto:suporte@deluketfinance.com',
    env.WEB_PUSH_PUBLIC_KEY,
    env.WEB_PUSH_PRIVATE_KEY
  );
}

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

function isWebPushPlatform(platform?: string | null) {
  return platform?.toUpperCase() === webPushPlatform;
}

function parseWebPushSubscription(token: string): PushSubscription | null {
  try {
    const parsed = JSON.parse(token) as PushSubscription;
    if (!parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys?.auth) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isValidWebPushSubscription(token: string) {
  return Boolean(parseWebPushSubscription(token));
}

export function webPushAvailable() {
  return Boolean(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY);
}

export function getWebPushPublicKey() {
  return env.WEB_PUSH_PUBLIC_KEY ?? '';
}

export async function registerPushToken(userId: string, input: RegisterPushTokenInput) {
  const token = input.token.trim();
  const platform = input.platform?.trim().toUpperCase() ?? null;
  if (isWebPushPlatform(platform) && !isValidWebPushSubscription(token)) {
    const error = new Error('Inscricao web push invalida') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  if (!isWebPushPlatform(platform) && !isExpoPushToken(token)) {
    const error = new Error('Token push invalido') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  return prisma.pushToken.upsert({
    where: { token },
    create: {
      userId,
      token,
      platform,
      deviceName: input.deviceName ?? null
    },
    update: {
      userId,
      platform,
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

async function sendWebPushMessage(subscription: PushSubscription, payload: object) {
  if (!webPushAvailable()) return false;
  await webPush.sendNotification(subscription, JSON.stringify(payload));
  return true;
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
      saving: true,
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
      .filter((pushToken) => !isWebPushPlatform(pushToken.platform) && isExpoPushToken(pushToken.token))
      .map((pushToken) => ({
        to: pushToken.token,
        sound: 'default' as const,
        title: reminder.title,
        body:
          reminder.message ||
          `Lembrete financeiro: ${
            reminder.financialItem?.title ?? reminder.saving?.title ?? reminder.title
          }`,
        data: {
          reminderId: reminder.id,
          ...(reminder.financialItemId ? { financialItemId: reminder.financialItemId } : {}),
          ...(reminder.savingId ? { savingId: reminder.savingId } : {})
        }
      }))
  );

  const webReminderIds = new Set<string>();
  let webMessages = 0;
  await Promise.all(
    reminders.flatMap((reminder) =>
      reminder.user.pushTokens
        .filter((pushToken) => isWebPushPlatform(pushToken.platform))
        .map(async (pushToken) => {
          const subscription = parseWebPushSubscription(pushToken.token);
          if (!subscription) {
            await prisma.pushToken.update({ where: { id: pushToken.id }, data: { isActive: false } }).catch(() => null);
            return;
          }
          try {
            const sent = await sendWebPushMessage(subscription, {
              title: reminder.title,
              body:
                reminder.message ||
                `Lembrete financeiro: ${
                  reminder.financialItem?.title ?? reminder.saving?.title ?? reminder.title
                }`,
              url: '/app',
              reminderId: reminder.id,
              financialItemId: reminder.financialItemId,
              savingId: reminder.savingId
            });
            if (sent) {
              webMessages += 1;
              webReminderIds.add(reminder.id);
            }
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await prisma.pushToken.update({ where: { id: pushToken.id }, data: { isActive: false } }).catch(() => null);
            }
          }
        })
    )
  );

  await sendExpoPushMessages(messages);

  const sentReminderIds = Array.from(new Set([
    ...messages.map((message) => String(message.data?.reminderId ?? '')).filter(Boolean),
    ...webReminderIds
  ]));

  if (sentReminderIds.length) {
    await prisma.financialReminder.updateMany({
      where: { id: { in: sentReminderIds } },
      data: { sentAt: now }
    });
  }

  return { reminders: reminders.length, messages: messages.length + webMessages };
}
