import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { registerPushTokenSchema } from './push-notification.schemas.js';
import {
  deactivatePushToken,
  dispatchDuePushReminders,
  registerPushToken
} from './push-notification.service.js';

const tokenBodySchema = z.object({ token: z.string().min(10) });

export async function registerPushTokenController(request: FastifyRequest, reply: FastifyReply) {
  const data = registerPushTokenSchema.parse(request.body);
  const pushToken = await registerPushToken(request.user.sub, data);
  return reply.status(201).send({ pushToken });
}

export async function deactivatePushTokenController(request: FastifyRequest, reply: FastifyReply) {
  const { token } = tokenBodySchema.parse(request.body);
  await deactivatePushToken(request.user.sub, token);
  return reply.status(204).send();
}

export async function dispatchDuePushRemindersController(_request: FastifyRequest, reply: FastifyReply) {
  const result = await dispatchDuePushReminders();
  return reply.send(result);
}
