import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createFinancialGoalSchema,
  listFinancialGoalsSchema,
  updateFinancialGoalSchema
} from './financial-goal.schemas.js';
import {
  createFinancialGoal,
  deleteFinancialGoal,
  listFinancialGoals,
  updateFinancialGoal
} from './financial-goal.service.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listFinancialGoalsController(request: FastifyRequest, reply: FastifyReply) {
  const filters = listFinancialGoalsSchema.parse(request.query);
  const goals = await listFinancialGoals(request.user.sub, filters);
  return reply.send({ goals });
}

export async function createFinancialGoalController(request: FastifyRequest, reply: FastifyReply) {
  const data = createFinancialGoalSchema.parse(request.body);
  const goal = await createFinancialGoal(request.user.sub, data);
  return reply.status(201).send({ goal });
}

export async function updateFinancialGoalController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  const data = updateFinancialGoalSchema.parse(request.body);
  const goal = await updateFinancialGoal(request.user.sub, id, data);
  return reply.send({ goal });
}

export async function deleteFinancialGoalController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  await deleteFinancialGoal(request.user.sub, id);
  return reply.status(204).send();
}
