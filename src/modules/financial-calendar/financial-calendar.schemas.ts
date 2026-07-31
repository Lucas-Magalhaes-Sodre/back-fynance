import { z } from 'zod';

export const financialCalendarQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(1900).max(3000)
});

export type FinancialCalendarQuery = z.infer<typeof financialCalendarQuerySchema>;
