import { z } from 'zod';

export const adminUpdateSubscriptionSchema = z.object({
  subscriptionStatus: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'BLOCKED', 'MANUAL']).optional(),
  trialEndsAt: z.coerce.date().optional().nullable(),
  manualAccessUntil: z.coerce.date().optional().nullable(),
  accessBlockedAt: z.coerce.date().optional().nullable(),
  subscriptionPlan: z.enum(['FREE', 'MONTHLY', 'YEARLY', 'LIFETIME']).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  note: z.string().optional()
});

export const grantTrialSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
  note: z.string().optional()
});

export const appSettingsSchema = z.object({
  defaultTrialDays: z.coerce.number().int().min(0).max(3650)
});

export type AdminUpdateSubscriptionInput = z.infer<typeof adminUpdateSubscriptionSchema>;
export type GrantTrialInput = z.infer<typeof grantTrialSchema>;
export type AppSettingsInput = z.infer<typeof appSettingsSchema>;
