import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastify from 'fastify';
import { ZodError } from 'zod';
import { authRoutes } from './modules/auth/auth.routes.js';
import { financialCalendarRoutes } from './modules/financial-calendar/financial-calendar.routes.js';
import { financialCategoryRoutes } from './modules/financial-categories/financial-category.routes.js';
import { financialComparisonRoutes } from './modules/financial-comparison/financial-comparison.routes.js';
import { financialControlRoutes, financialSummaryRoutes } from './modules/financial-control/financial-control.routes.js';
import { financialGoalRoutes } from './modules/financial-goals/financial-goal.routes.js';
import { financialInsightsRoutes } from './modules/financial-insights/financial-insights.routes.js';
import { financialItemRoutes } from './modules/financial-items/financial-item.routes.js';
import { savingsRoutes } from './modules/savings/savings.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { env } from './shared/env.js';

export function buildApp() {
  const app = fastify({ logger: true });
  const allowedOrigins = env.WEB_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

  app.register(cors, {
    origin: [...allowedOrigins, 'http://localhost:19006', 'http://localhost:8081'],
    credentials: true
  });

  app.register(jwt, { secret: env.JWT_SECRET });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: 'Erro de validacao',
        issues: error.flatten().fieldErrors
      });
    }

    const statusCode = error.statusCode ?? 500;
    return reply.status(statusCode).send({
      message: statusCode === 500 ? 'Erro interno do servidor' : error.message
    });
  });

  app.get('/health', async () => ({ status: 'ok', message: 'Backend is running' }));
  app.register(authRoutes, { prefix: '/auth' });
  app.register(userRoutes, { prefix: '/users' });
  app.register(financialItemRoutes, { prefix: '/financial-items' });
  app.register(financialCategoryRoutes, { prefix: '/financial-categories' });
  app.register(savingsRoutes, { prefix: '/savings' });
  app.register(financialCalendarRoutes, { prefix: '/financial-calendar' });
  app.register(financialComparisonRoutes, { prefix: '/financial-comparison' });
  app.register(financialGoalRoutes, { prefix: '/financial-goals' });
  app.register(financialInsightsRoutes, { prefix: '/financial-insights' });
  app.register(financialControlRoutes, { prefix: '/financial-control' });
  app.register(financialSummaryRoutes, { prefix: '/financial-summary' });

  return app;
}
