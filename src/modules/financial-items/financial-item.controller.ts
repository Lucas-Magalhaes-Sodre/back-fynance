import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  bulkDeleteFinancialScopeSchema,
  createFinancialItemSchema,
  copyFinancialCategorySchema,
  categoryActionSchema,
  listFinancialItemsSchema,
  paymentStatusUpdateSchema,
  paymentSummarySchema,
  renameCategorySchema,
  salaryCandidatesSchema,
  updateCreditCardStatementValueSchema,
  updateFinancialItemValueSchema,
  updateFinancialItemSchema
} from './financial-item.schemas.js';
import {
  copyFinancialCategory,
  createFinancialItem,
  deleteFinancialCategory,
  deleteFinancialItem,
  deleteFinancialScope,
  getDashboard,
  getPaymentSummary,
  listFinancialItems,
  listSalaryCandidates,
  renameFinancialCategory,
  updateCreditCardStatementValue,
  updateFinancialItem,
  updateFinancialItemPaymentStatus,
  updateFinancialItemValue
} from './financial-item.service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listFinancialItemsController(request: FastifyRequest, reply: FastifyReply) {
  const filters = listFinancialItemsSchema.parse(request.query);
  const items = await listFinancialItems(request.user.sub, filters);
  return reply.send({ items });
}

export async function salaryCandidatesController(request: FastifyRequest, reply: FastifyReply) {
  const filters = salaryCandidatesSchema.parse(request.query);
  const result = await listSalaryCandidates(request.user.sub, filters);
  return reply.send(result);
}

export async function createFinancialItemController(request: FastifyRequest, reply: FastifyReply) {
  const data = createFinancialItemSchema.parse(request.body);
  const result = await createFinancialItem(request.user.sub, data);
  return reply.status(201).send(result);
}

export async function copyFinancialCategoryController(request: FastifyRequest, reply: FastifyReply) {
  const data = copyFinancialCategorySchema.parse(request.body);
  const result = await copyFinancialCategory(request.user.sub, data);
  return reply.send(result);
}

export async function bulkDeleteFinancialScopeController(request: FastifyRequest, reply: FastifyReply) {
  const data = bulkDeleteFinancialScopeSchema.parse(request.body);
  const result = await deleteFinancialScope(request.user.sub, data);
  return reply.send(result);
}

export async function updateFinancialItemController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateFinancialItemSchema.parse(request.body);
  const item = await updateFinancialItem(request.user.sub, id, data);
  return reply.send({ item });
}

export async function updateFinancialItemPaymentStatusController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = paymentStatusUpdateSchema.parse(request.body);
  const item = await updateFinancialItemPaymentStatus(request.user.sub, id, data);
  return reply.send({ item });
}

export async function updateFinancialItemValueController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateFinancialItemValueSchema.parse(request.body);
  const result = await updateFinancialItemValue(request.user.sub, id, data);
  return reply.send(result);
}

export async function updateCreditCardStatementValueController(request: FastifyRequest, reply: FastifyReply) {
  const data = updateCreditCardStatementValueSchema.parse(request.body);
  const result = await updateCreditCardStatementValue(request.user.sub, data);
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

export async function paymentSummaryController(request: FastifyRequest, reply: FastifyReply) {
  const filters = paymentSummarySchema.parse(request.query);
  const summary = await getPaymentSummary(request.user.sub, filters);
  return reply.send({ summary });
}
