import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  financialReminderSchema,
  listFinancialRemindersSchema,
  updateFinancialReminderSchema
} from './financial-reminder.schemas.js';
import {
  createFinancialReminder,
  deleteFinancialReminder,
  listFinancialReminders,
  updateFinancialReminder
} from './financial-reminder.service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listFinancialRemindersController(request: FastifyRequest, reply: FastifyReply) {
  const filters = listFinancialRemindersSchema.parse(request.query);
  const reminders = await listFinancialReminders(request.user.sub, filters);
  return reply.send({ reminders });
}

export async function createFinancialReminderController(request: FastifyRequest, reply: FastifyReply) {
  const data = financialReminderSchema.parse(request.body);
  const reminder = await createFinancialReminder(request.user.sub, data);
  return reply.status(201).send({ reminder });
}

export async function updateFinancialReminderController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateFinancialReminderSchema.parse(request.body);
  const reminder = await updateFinancialReminder(request.user.sub, id, data);
  return reply.send({ reminder });
}

export async function deleteFinancialReminderController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  await deleteFinancialReminder(request.user.sub, id);
  return reply.status(204).send();
}
