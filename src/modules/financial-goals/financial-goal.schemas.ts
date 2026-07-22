import { FinancialGoalStatus } from '@prisma/client';
import { z } from 'zod';

export const financialGoalStatusSchema = z.nativeEnum(FinancialGoalStatus);

const financialGoalBaseSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  targetAmount: z.coerce.number().positive(),
  currentAmount: z.coerce.number().min(0).optional(),
  startDate: z.coerce.date(),
  targetDate: z.coerce.date().optional().nullable(),
  category: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageUrls: z.array(z.string()).max(3).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  hasYield: z.coerce.boolean().optional(),
  yieldRateMonthly: z.coerce.number().min(0).max(100).optional().nullable(),
  status: financialGoalStatusSchema.optional()
});

export const createFinancialGoalSchema = financialGoalBaseSchema;
export const updateFinancialGoalSchema = financialGoalBaseSchema.partial();

export const listFinancialGoalsSchema = z.object({
  status: financialGoalStatusSchema.optional()
});

export const listGoalSavingsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(5)
});

export type CreateFinancialGoalInput = z.infer<typeof createFinancialGoalSchema>;
export type UpdateFinancialGoalInput = z.infer<typeof updateFinancialGoalSchema>;
export type ListFinancialGoalsInput = z.infer<typeof listFinancialGoalsSchema>;
export type ListGoalSavingsInput = z.infer<typeof listGoalSavingsSchema>;
