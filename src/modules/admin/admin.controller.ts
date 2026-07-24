import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminUpdateSubscriptionSchema, appSettingsSchema, grantTrialSchema } from './admin.schemas.js';
import {
  getAdminBillingOverview,
  getDefaultTrialDays,
  grantTrial,
  listAdminUsers,
  listSubscriptionEvents,
  updateAppSettings,
  updateAdminUserSubscription
} from './admin.service.js';

const userParamsSchema = z.object({ userId: z.string().uuid() });
const eventsQuerySchema = z.object({ userId: z.string().uuid().optional() });

export async function listAdminUsersController(_request: FastifyRequest, reply: FastifyReply) {
  const users = await listAdminUsers();
  return reply.send({ users });
}

export async function updateAdminUserSubscriptionController(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = userParamsSchema.parse(request.params);
  const data = adminUpdateSubscriptionSchema.parse(request.body);
  if (data.role === 'USER' && userId === request.user.sub) {
    return reply.status(400).send({ message: 'Voce nao pode remover seu proprio acesso administrativo.' });
  }
  const user = await updateAdminUserSubscription(userId, data);
  return reply.send({ user });
}

export async function grantTrialController(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = userParamsSchema.parse(request.params);
  const data = grantTrialSchema.parse(request.body);
  const user = await grantTrial(userId, data);
  return reply.send({ user });
}

export async function listSubscriptionEventsController(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = eventsQuerySchema.parse(request.query);
  const events = await listSubscriptionEvents(userId);
  return reply.send({ events });
}

export async function adminBillingOverviewController(_request: FastifyRequest, reply: FastifyReply) {
  const overview = await getAdminBillingOverview();
  return reply.send({ overview });
}

export async function getAppSettingsController(_request: FastifyRequest, reply: FastifyReply) {
  const defaultTrialDays = await getDefaultTrialDays();
  return reply.send({ settings: { defaultTrialDays } });
}

export async function updateAppSettingsController(request: FastifyRequest, reply: FastifyReply) {
  const data = appSettingsSchema.parse(request.body);
  const settings = await updateAppSettings(data);
  return reply.send({ settings });
}
