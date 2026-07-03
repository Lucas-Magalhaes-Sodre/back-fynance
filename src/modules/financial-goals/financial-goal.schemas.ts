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
  status: financialGoalStatusSchema.optional()
});

export const createFinancialGoalSchema = financialGoalBaseSchema;
export const updateFinancialGoalSchema = financialGoalBaseSchema.partial();

export const listFinancialGoalsSchema = z.object({
  status: financialGoalStatusSchema.optional()
});

export type CreateFinancialGoalInput = z.infer<typeof createFinancialGoalSchema>;
export type UpdateFinancialGoalInput = z.infer<typeof updateFinancialGoalSchema>;
export type ListFinancialGoalsInput = z.infer<typeof listFinancialGoalsSchema>;
