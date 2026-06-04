import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createSavingSchema,
  listSavingsSchema,
  savingsSummarySchema,
  updateSavingSchema
} from './savings.schemas.js';
import {
  createSaving,
  deleteSaving,
  getSavingsSummary,
  listSavings,
  updateSaving
} from './savings.service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listSavingsController(request: FastifyRequest, reply: FastifyReply) {
  const filters = listSavingsSchema.parse(request.query);
  const savings = await listSavings(request.user.sub, filters);
  return reply.send({ savings });
}

export async function createSavingController(request: FastifyRequest, reply: FastifyReply) {
  const data = createSavingSchema.parse(request.body);
  const saving = await createSaving(request.user.sub, data);
  return reply.status(201).send({ saving });
}

export async function updateSavingController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateSavingSchema.parse(request.body);
  const saving = await updateSaving(request.user.sub, id, data);
  return reply.send({ saving });
}

export async function deleteSavingController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  await deleteSaving(request.user.sub, id);
  return reply.status(204).send();
}

export async function savingsSummaryController(request: FastifyRequest, reply: FastifyReply) {
  const filters = savingsSummarySchema.parse(request.query);
  const summary = await getSavingsSummary(request.user.sub, filters);
  return reply.send({ summary });
}
