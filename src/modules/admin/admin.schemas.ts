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
  defaultTrialDays: z.coerce.number().int().min(0).max(3650),
  contactEmails: z.array(z.string().trim().email()).max(5).optional().default([]),
  contactPhones: z.array(z.string().trim().min(3).max(40)).max(5).optional().default([]),
  contactMessage: z.string().trim().max(180).optional().default('')
});

export const billingPlanSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  originalPrice: z.coerce.number().min(0).max(999999).optional().nullable(),
  price: z.coerce.number().min(0).max(999999),
  currency: z.string().trim().min(3).max(3).default('BRL'),
  durationMonths: z.coerce.number().int().min(1).max(120),
  productKeys: z.array(z.string().trim().min(1)).optional().default([]),
  productLabels: z.record(z.string().trim().max(60)).optional().default({}),
  includedItems: z.array(z.string().trim().max(100)).max(30).optional().default([]),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0)
});

export const billingPlanOrderSchema = z.object({
  planIds: z.array(z.string().min(1)).min(1)
});

export const billingCouponSchema = z.object({
  code: z.string().trim().min(2).max(40),
  description: z.string().trim().max(240).optional().nullable(),
  discountType: z.enum(['PERCENT', 'FIXED']),
  discountValue: z.coerce.number().min(0).max(999999),
  active: z.boolean().default(true),
  startsAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  usageLimit: z.coerce.number().int().min(1).max(100000).optional().nullable(),
  billingPlanId: z.string().min(1).optional().nullable()
});

export const anonymizeUserSchema = z.object({
  confirmationEmail: z.string().email(),
  note: z.string().trim().max(500).optional()
});

export type AdminUpdateSubscriptionInput = z.infer<typeof adminUpdateSubscriptionSchema>;
export type AnonymizeUserInput = z.infer<typeof anonymizeUserSchema>;
export type GrantTrialInput = z.infer<typeof grantTrialSchema>;
export type AppSettingsInput = z.infer<typeof appSettingsSchema>;
export type BillingPlanInput = z.infer<typeof billingPlanSchema>;
export type BillingPlanOrderInput = z.infer<typeof billingPlanOrderSchema>;
export type BillingCouponInput = z.infer<typeof billingCouponSchema>;
