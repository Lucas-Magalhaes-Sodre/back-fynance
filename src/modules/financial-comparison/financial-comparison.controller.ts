import type { FastifyReply, FastifyRequest } from 'fastify';
import { financialComparisonQuerySchema } from './financial-comparison.schemas.js';
import { getFinancialComparison } from './financial-comparison.service.js';

export async function financialComparisonController(request: FastifyRequest, reply: FastifyReply) {
  const { month, year } = financialComparisonQuerySchema.parse(request.query);
  const comparison = await getFinancialComparison(request.user.sub, month, year);
  return reply.send(comparison);
}
