import { z } from 'zod';

export const recurrenceTypeSchema = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

const savingsBaseSchema = z.object({
  title: z.string().min(2),
  category: z.string().min(2).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  date: z.coerce.date(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  isFixed: z.coerce.boolean().optional(),
  recurrenceType: recurrenceTypeSchema.optional(),
  recurrenceGroupId: z.string().optional().nullable(),
  recurrenceGeneration: z.object({
    mode: z.enum(['ALL_YEAR', 'FROM_SELECTED_MONTH', 'CUSTOM']),
    startMonth: z.coerce.number().int().min(1).max(12),
    startYear: z.coerce.number().int().min(2000).max(2100),
    endMonth: z.coerce.number().int().min(1).max(12),
    endYear: z.coerce.number().int().min(2000).max(2100)
  }).optional(),
  goalId: z.string().uuid().optional().nullable(),
  hasYield: z.coerce.boolean().optional(),
  yieldRateMonthly: z.coerce.number().min(0).max(100).optional().nullable()
});

export const createSavingSchema = savingsBaseSchema;
export const updateSavingSchema = savingsBaseSchema.partial();

export const listSavingsSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  category: z.string().optional(),
  goalId: z.string().uuid().optional()
});

export const savingsSummarySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

export const savingsExtractSchema = z.object({
  mode: z.enum(['current', 'future']).default('current'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  categoryId: z.string().optional(),
  subItemId: z.string().optional(),
  movementType: z.enum(['DEPOSIT', 'WITHDRAW']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

export const savingsProjectionSchema = z.object({
  targetDate: z.coerce.date()
});

export const savingsTransferSchema = z.object({
  direction: z.enum(['SAVE_FROM_BALANCE', 'WITHDRAW_TO_BALANCE']),
  title: z.string().min(2),
  category: z.string().min(2).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  date: z.coerce.date(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  goalId: z.string().uuid().optional().nullable(),
  hasYield: z.coerce.boolean().optional(),
  yieldRateMonthly: z.coerce.number().min(0).max(100).optional().nullable()
});

export type CreateSavingInput = z.infer<typeof createSavingSchema>;
export type UpdateSavingInput = z.infer<typeof updateSavingSchema>;
export type ListSavingsInput = z.infer<typeof listSavingsSchema>;
export type SavingsSummaryInput = z.infer<typeof savingsSummarySchema>;
export type SavingsExtractInput = z.infer<typeof savingsExtractSchema>;
export type SavingsProjectionInput = z.infer<typeof savingsProjectionSchema>;
export type SavingsTransferInput = z.infer<typeof savingsTransferSchema>;
