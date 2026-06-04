import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createFinancialItemSchema,
  categoryActionSchema,
  listFinancialItemsSchema,
  renameCategorySchema,
  updateFinancialItemValueSchema,
  updateFinancialItemSchema
} from './financial-item.schemas.js';
import {
  createFinancialItem,
  deleteFinancialCategory,
  deleteFinancialItem,
  getDashboard,
  listFinancialItems,
  renameFinancialCategory,
  updateFinancialItem,
  updateFinancialItemValue
} from './financial-item.service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listFinancialItemsController(request: FastifyRequest, reply: FastifyReply) {
  const filters = listFinancialItemsSchema.parse(request.query);
  const items = await listFinancialItems(request.user.sub, filters);
  return reply.send({ items });
}

export async function createFinancialItemController(request: FastifyRequest, reply: FastifyReply) {
  const data = createFinancialItemSchema.parse(request.body);
  const item = await createFinancialItem(request.user.sub, data);
  return reply.status(201).send({ item });
}

export async function updateFinancialItemController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateFinancialItemSchema.parse(request.body);
  const item = await updateFinancialItem(request.user.sub, id, data);
  return reply.send({ item });
}

export async function updateFinancialItemValueController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateFinancialItemValueSchema.parse(request.body);
  const result = await updateFinancialItemValue(request.user.sub, id, data);
  return reply.send(result);
}

export async function deleteFinancialItemController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  await deleteFinancialItem(request.user.sub, id);
  return reply.status(204).send();
}

export async function renameFinancialCategoryController(request: FastifyRequest, reply: FastifyReply) {
  const data = renameCategorySchema.parse(request.body);
  const result = await renameFinancialCategory(request.user.sub, data);
  return reply.send(result);
}

export async function deleteFinancialCategoryController(request: FastifyRequest, reply: FastifyReply) {
  const data = categoryActionSchema.parse(request.body);
  const result = await deleteFinancialCategory(request.user.sub, data);
  return reply.send(result);
}

export async function dashboardController(request: FastifyRequest, reply: FastifyReply) {
  const dashboard = await getDashboard(request.user.sub);
  return reply.send(dashboard);
}
