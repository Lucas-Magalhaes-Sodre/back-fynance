import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  financialCategorySchema,
  listFinancialCategoriesSchema,
  updateFinancialCategorySchema
} from './financial-category.schemas.js';
import {
  createFinancialCategory,
  deleteFinancialCategory,
  listFinancialCategories,
  updateFinancialCategory
} from './financial-category.service.js';

const idParamsSchema = z.object({ id: z.string().min(1) });

export async function listFinancialCategoriesController(request: FastifyRequest, reply: FastifyReply) {
  const filters = listFinancialCategoriesSchema.parse(request.query);
  const categories = await listFinancialCategories(request.user.sub, filters);
  return reply.send({ categories });
}

export async function createFinancialCategoryController(request: FastifyRequest, reply: FastifyReply) {
  const data = financialCategorySchema.parse(request.body);
  const category = await createFinancialCategory(request.user.sub, data);
  return reply.status(201).send({ category });
}

export async function updateFinancialCategoryController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateFinancialCategorySchema.parse(request.body);
  const category = await updateFinancialCategory(request.user.sub, id, data);
  return reply.send({ category });
}

export async function deleteFinancialCategoryController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  await deleteFinancialCategory(request.user.sub, id);
  return reply.status(204).send();
}
