import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  dayQuerySchema,
  monthQuerySchema,
  weekQuerySchema,
  yearParamsSchema,
  yearQuerySchema
} from './financial-control.schemas.js';
import {
  getDayControl,
  getMonthControl,
  getWeekControl,
  getYearControl,
  getYearSummary
} from './financial-control.service.js';

export async function dayControlController(request: FastifyRequest, reply: FastifyReply) {
  const { date } = dayQuerySchema.parse(request.query);
  return reply.send(await getDayControl(request.user.sub, date));
}

export async function weekControlController(request: FastifyRequest, reply: FastifyReply) {
  const { startDate, endDate } = weekQuerySchema.parse(request.query);
  return reply.send(await getWeekControl(request.user.sub, startDate, endDate));
}

export async function monthControlController(request: FastifyRequest, reply: FastifyReply) {
  const { month, year } = monthQuerySchema.parse(request.query);
  return reply.send(await getMonthControl(request.user.sub, month, year));
}

export async function yearControlController(request: FastifyRequest, reply: FastifyReply) {
  const { year } = yearQuerySchema.parse(request.query);
  return reply.send(await getYearControl(request.user.sub, year));
}

export async function yearControlByParamController(request: FastifyRequest, reply: FastifyReply) {
  const { year } = yearParamsSchema.parse(request.params);
  return reply.send(await getYearControl(request.user.sub, year));
}

export async function yearSummaryController(request: FastifyRequest, reply: FastifyReply) {
  const { year } = yearParamsSchema.parse(request.params);
  return reply.send(await getYearSummary(request.user.sub, year));
}

