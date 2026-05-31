import { FinancialItemType } from '@prisma/client';
import { z } from 'zod';

export const legacyFinancialItemTypeSchema = z.nativeEnum(FinancialItemType);
export const financialEntryTypeSchema = z.enum(['INCOME', 'EXPENSE']);
export const recurrenceTypeSchema = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
export const paymentStatusSchema = z.enum(['PENDENTE', 'PAGO', 'ATRASADO']);
export const valueUpdateScopeSchema = z.enum(['ONLY_THIS_PERIOD', 'FROM_THIS_PERIOD_FORWARD', 'ALL_YEAR']);
export const periodTypeSchema = z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']);

const financialItemBaseSchema = z.object({
  title: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  type: z.union([financialEntryTypeSchema, legacyFinancialItemTypeSchema]),
  category: z.string().min(2).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  isFixed: z.coerce.boolean().optional(),
  recurrenceType: recurrenceTypeSchema.optional(),
  recurrenceGroupId: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  paymentDate: z.coerce.date().optional().nullable(),
  status: paymentStatusSchema.optional(),
  date: z.coerce.date()
});

export const updateFinancialItemValueSchema = z.object({
  amount: z.coerce.number().positive(),
  date: z.coerce.date(),
  scope: valueUpdateScopeSchema,
  periodType: periodTypeSchema,
  description: z.string().optional().nullable()
});

export const createFinancialItemSchema = financialItemBaseSchema.refine((data) => data.title || data.name, {
  message: 'Informe o nome do lancamento',
  path: ['name']
});

export const updateFinancialItemSchema = financialItemBaseSchema.partial();

export const listFinancialItemsSchema = z.object({
  type: z.union([financialEntryTypeSchema, legacyFinancialItemTypeSchema]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

export type CreateFinancialItemInput = z.infer<typeof createFinancialItemSchema>;
export type UpdateFinancialItemInput = z.infer<typeof updateFinancialItemSchema>;
export type ListFinancialItemsInput = z.infer<typeof listFinancialItemsSchema>;
export type UpdateFinancialItemValueInput = z.infer<typeof updateFinancialItemValueSchema>;
