import { z } from 'zod';

export const reminderStatusSchema = z.enum(['PENDING', 'READ', 'DISMISSED']);
const queryBooleanSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

export const financialReminderSchema = z.object({
  financialItemId: z.string().uuid(),
  title: z.string().min(2),
  message: z.string().optional().nullable(),
  remindAt: z.coerce.date(),
  offsetDays: z.coerce.number().int().min(0).max(365).optional().nullable()
});

export const updateFinancialReminderSchema = financialReminderSchema.partial().extend({
  status: reminderStatusSchema.optional()
});

export const listFinancialRemindersSchema = z.object({
  financialItemId: z.string().uuid().optional(),
  status: reminderStatusSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  dueOnly: queryBooleanSchema.optional()
});

export type FinancialReminderInput = z.infer<typeof financialReminderSchema>;
export type UpdateFinancialReminderInput = z.infer<typeof updateFinancialReminderSchema>;
export type ListFinancialRemindersInput = z.infer<typeof listFinancialRemindersSchema>;
