import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createSavingSchema,
  listSavingsSchema,
  savingsExtractSchema,
  savingsProjectionSchema,
  savingsSummarySchema,
  savingsTransferSchema,
  updateSavingSchema
} from './savings.schemas.js';
import {
  createSaving,
  deleteSaving,
  getSavingsExtract,
  getSavingsOverview,
  getSavingsProjection,
  getSavingsSummary,
  listSavings,
  transferSavings,
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

export async function savingsOverviewController(request: FastifyRequest, reply: FastifyReply) {
  const overview = await getSavingsOverview(request.user.sub);
  return reply.send({ overview });
}

export async function savingsExtractController(request: FastifyRequest, reply: FastifyReply) {
  const filters = savingsExtractSchema.parse(request.query);
  const extract = await getSavingsExtract(request.user.sub, filters);
  return reply.send(extract);
}

export async function savingsProjectionController(request: FastifyRequest, reply: FastifyReply) {
  const filters = savingsProjectionSchema.parse(request.query);
  const projection = await getSavingsProjection(request.user.sub, filters);
  return reply.send({ projection });
}

export async function savingsTransferController(request: FastifyRequest, reply: FastifyReply) {
  const data = savingsTransferSchema.parse(request.body);
  const result = await transferSavings(request.user.sub, data);
  return reply.status(201).send(result);
}
