import type { FastifyReply, FastifyRequest } from 'fastify';
import { financialInsightsQuerySchema } from './financial-insights.schemas.js';
import { getFinancialInsights } from './financial-insights.service.js';

export async function financialInsightsController(request: FastifyRequest, reply: FastifyReply) {
  const { month, year } = financialInsightsQuerySchema.parse(request.query);
  const insights = await getFinancialInsights(request.user.sub, month, year);
  return reply.send(insights);
}
