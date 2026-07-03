import { z } from 'zod';

export const financialInsightsQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

export type FinancialInsightsQuery = z.infer<typeof financialInsightsQuerySchema>;
