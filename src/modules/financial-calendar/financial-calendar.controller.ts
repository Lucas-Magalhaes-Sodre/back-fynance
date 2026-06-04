import type { FastifyReply, FastifyRequest } from 'fastify';
import { financialCalendarQuerySchema } from './financial-calendar.schemas.js';
import { getFinancialCalendar } from './financial-calendar.service.js';

export async function financialCalendarController(request: FastifyRequest, reply: FastifyReply) {
  const { month, year } = financialCalendarQuerySchema.parse(request.query);
  const calendar = await getFinancialCalendar(request.user.sub, month, year);
  return reply.send(calendar);
}
