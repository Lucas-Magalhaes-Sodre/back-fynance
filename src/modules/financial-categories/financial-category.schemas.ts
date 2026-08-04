import { z } from 'zod';

export const financialCategoryTypeSchema = z.enum(['INCOME', 'EXPENSE', 'INVESTMENT']);

export const financialCategorySchema = z.object({
  name: z.string().min(2),
  type: financialCategoryTypeSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
});

export const listFinancialCategoriesSchema = z.object({
  type: financialCategoryTypeSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});

export const updateFinancialCategorySchema = financialCategorySchema.partial();

export type FinancialCategoryInput = z.infer<typeof financialCategorySchema>;
export type ListFinancialCategoriesInput = z.infer<typeof listFinancialCategoriesSchema>;
export type UpdateFinancialCategoryInput = z.infer<typeof updateFinancialCategorySchema>;
