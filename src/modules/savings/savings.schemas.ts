import { z } from 'zod';

const savingsBaseSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  date: z.coerce.date(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  goalId: z.string().uuid().optional().nullable()
});

export const createSavingSchema = savingsBaseSchema;
export const updateSavingSchema = savingsBaseSchema.partial();

export const listSavingsSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  goalId: z.string().uuid().optional()
});

export const savingsSummarySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

export const savingsTransferSchema = z.object({
  direction: z.enum(['SAVE_FROM_BALANCE', 'WITHDRAW_TO_BALANCE']),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  date: z.coerce.date(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  goalId: z.string().uuid().optional().nullable()
});

export type CreateSavingInput = z.infer<typeof createSavingSchema>;
export type UpdateSavingInput = z.infer<typeof updateSavingSchema>;
export type ListSavingsInput = z.infer<typeof listSavingsSchema>;
export type SavingsSummaryInput = z.infer<typeof savingsSummarySchema>;
export type SavingsTransferInput = z.infer<typeof savingsTransferSchema>;
