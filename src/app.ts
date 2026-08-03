import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastify from 'fastify';
import { ZodError } from 'zod';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { creditCardRoutes } from './modules/credit-cards/credit-card.routes.js';
import { financialCalendarRoutes } from './modules/financial-calendar/financial-calendar.routes.js';
import { financialCategoryRoutes } from './modules/financial-categories/financial-category.routes.js';
import { financialComparisonRoutes } from './modules/financial-comparison/financial-comparison.routes.js';
import { financialControlRoutes, financialSummaryRoutes } from './modules/financial-control/financial-control.routes.js';
import { financialGoalRoutes } from './modules/financial-goals/financial-goal.routes.js';
import { financialInsightsRoutes } from './modules/financial-insights/financial-insights.routes.js';
import { financialItemRoutes } from './modules/financial-items/financial-item.routes.js';
import { financialReminderRoutes } from './modules/financial-reminders/financial-reminder.routes.js';
import { privacyRoutes } from './modules/privacy/privacy.routes.js';
import { pushNotificationRoutes } from './modules/push-notifications/push-notification.routes.js';
import { referralRoutes } from './modules/referrals/referral.routes.js';
import { savingsRoutes } from './modules/savings/savings.routes.js';
import { userRoutes } from './modules/users/user.routes.js';
import { env } from './shared/env.js';

export function buildApp() {
  const app = fastify({ logger: true, bodyLimit: 3 * 1024 * 1024 });
  const allowedOrigins = env.WEB_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
  const localDevOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}):(5173|5174|5175|19006|8081)$/;

  app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || localDevOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true
  });

  app.register(helmet, {
    contentSecurityPolicy: false
  });
  app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute'
  });

  app.register(jwt, { secret: env.JWT_SECRET });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: 'Erro de validacao',
        issues: error.flatten().fieldErrors
      });
    }

    const handledError = error as Error & { statusCode?: number };
    const statusCode = handledError.statusCode ?? 500;
    return reply.status(statusCode).send({
      message: statusCode === 500 ? 'Erro interno do servidor' : handledError.message
    });
  });

  app.get('/health', async () => ({ status: 'ok', message: 'Backend is running' }));
  app.register(authRoutes, { prefix: '/auth' });
  app.register(billingRoutes, { prefix: '/billing' });
  app.register(adminRoutes, { prefix: '/admin' });
  app.register(privacyRoutes, { prefix: '/privacy' });
  app.register(pushNotificationRoutes, { prefix: '/push-notifications' });
  app.register(referralRoutes, { prefix: '/referrals' });
  app.register(userRoutes, { prefix: '/users' });
  app.register(creditCardRoutes, { prefix: '/credit-cards' });
  app.register(financialItemRoutes, { prefix: '/financial-items' });
  app.register(financialReminderRoutes, { prefix: '/financial-reminders' });
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
