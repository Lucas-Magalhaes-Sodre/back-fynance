import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3333),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  DEFAULT_TRIAL_DAYS: z.coerce.number().int().min(0).default(14),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADO_PAGO_MONTHLY_PLAN_URL: z.string().url().optional(),
  MERCADO_PAGO_YEARLY_PLAN_URL: z.string().url().optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_SUBJECT: z.string().optional()
});

export const env = envSchema.parse(process.env);
