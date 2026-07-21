import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  creditCardPurchaseSchema,
  creditCardSchema,
  deleteCreditCardPurchaseSchema,
  listCreditCardsSchema,
  updateCreditCardPurchaseSchema,
  updateCreditCardSchema
} from './credit-card.schemas.js';
import {
  createCreditCard,
  createCreditCardPurchase,
  deleteCreditCard,
  deleteCreditCardPurchase,
  listCreditCards,
  updateCreditCard,
  updateCreditCardPurchase
} from './credit-card.service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listCreditCardsController(request: FastifyRequest, reply: FastifyReply) {
  const filters = listCreditCardsSchema.parse(request.query);
  const result = await listCreditCards(request.user.sub, filters);
  return reply.send(result);
}

export async function createCreditCardController(request: FastifyRequest, reply: FastifyReply) {
  const data = creditCardSchema.parse(request.body);
  const card = await createCreditCard(request.user.sub, data);
  return reply.status(201).send({ card });
}

export async function updateCreditCardController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateCreditCardSchema.parse(request.body);
  const card = await updateCreditCard(request.user.sub, id, data);
  return reply.send({ card });
}

export async function deleteCreditCardController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  await deleteCreditCard(request.user.sub, id);
  return reply.status(204).send();
}

export async function createCreditCardPurchaseController(request: FastifyRequest, reply: FastifyReply) {
  const data = creditCardPurchaseSchema.parse(request.body);
  const purchase = await createCreditCardPurchase(request.user.sub, data);
  return reply.status(201).send({ purchase });
}

export async function updateCreditCardPurchaseController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateCreditCardPurchaseSchema.parse(request.body);
  const purchase = await updateCreditCardPurchase(request.user.sub, id, data);
  return reply.send({ purchase });
}

export async function deleteCreditCardPurchaseController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = deleteCreditCardPurchaseSchema.parse(request.body ?? {});
  await deleteCreditCardPurchase(request.user.sub, id, data);
  return reply.status(204).send();
}
