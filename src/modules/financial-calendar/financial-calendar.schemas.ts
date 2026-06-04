import { z } from 'zod';

export const financialCalendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

export type FinancialCalendarQuery = z.infer<typeof financialCalendarQuerySchema>;
