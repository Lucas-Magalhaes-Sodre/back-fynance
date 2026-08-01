import { z } from 'zod';

export const financialEntryTypeSchema = z.enum(['INCOME', 'EXPENSE']);
export const recurrenceTypeSchema = z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
export const paymentStatusSchema = z.enum(['PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO']);
export const valueUpdateScopeSchema = z.enum(['ONLY_THIS_PERIOD', 'FROM_THIS_PERIOD_FORWARD', 'ALL_YEAR']);
export const periodTypeSchema = z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']);

function normalizeMoneyValue(value: unknown) {
  if (typeof value !== 'string') return value;
  const normalized = value
    .replace(/\s/g, '')
    .replace(/[R$]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number(normalized);
}

const positiveMoneySchema = z.preprocess(normalizeMoneyValue, z.coerce.number().positive());
const nonnegativeMoneySchema = z.preprocess(normalizeMoneyValue, z.coerce.number().nonnegative());

export const categoryActionSchema = z.object({
  type: financialEntryTypeSchema,
  category: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(3000).optional()
});
export const renameCategorySchema = categoryActionSchema.extend({
  newCategory: z.string().min(1)
});

const financialItemBaseSchema = z.object({
  title: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  amount: positiveMoneySchema,
  type: financialEntryTypeSchema,
  category: z.string().min(2).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  isFixed: z.coerce.boolean().optional(),
  recurrenceType: recurrenceTypeSchema.optional(),
  recurrenceGroupId: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  paymentDate: z.coerce.date().optional().nullable(),
  status: paymentStatusSchema.optional(),
  date: z.coerce.date()
});

const periodFilterSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

export const paymentStatusUpdateSchema = z.object({
  status: paymentStatusSchema,
  paymentDate: z.coerce.date().optional().nullable(),
  paidAt: z.coerce.date().optional().nullable()
});

export const updateFinancialItemValueSchema = z.object({
  amount: nonnegativeMoneySchema,
  date: z.coerce.date(),
  scope: valueUpdateScopeSchema,
  periodType: periodTypeSchema,
  endMonth: z.coerce.number().int().min(1).max(12).optional(),
  description: z.string().optional().nullable(),
  paidWithCreditCard: z.coerce.boolean().optional(),
  creditCardId: z.string().uuid().optional().nullable(),
  creditCardInstallments: z.coerce.number().int().min(1).max(240).optional().nullable()
}).refine((data) => !data.paidWithCreditCard || data.scope === 'ONLY_THIS_PERIOD', {
  message: 'Pagamento via cartao so pode ser configurado para uma celula por vez',
  path: ['scope']
}).refine((data) => !data.paidWithCreditCard || Boolean(data.creditCardId), {
  message: 'Informe o cartao usado no pagamento',
  path: ['creditCardId']
}).refine((data) => !data.paidWithCreditCard || data.amount > 0, {
  message: 'Informe um valor maior que zero para pagar no cartao',
  path: ['amount']
});

export const createFinancialItemSchema = financialItemBaseSchema.refine((data) => data.title || data.name, {
  message: 'Informe o nome do lancamento',
  path: ['name']
});

export const updateFinancialItemSchema = financialItemBaseSchema.partial();

export const listFinancialItemsSchema = z.object({
  type: financialEntryTypeSchema.optional(),
  status: paymentStatusSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

export const salaryCandidatesSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1900).max(3000),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

export const copyFinancialCategorySchema = z.object({
  scope: z.enum(['CATEGORY', 'ALL_INCOME', 'ALL_EXPENSE', 'ALL_INVESTMENT', 'ALL_TABLE', 'SELECTED_SUBITEMS']).default('CATEGORY'),
  type: z.enum(['INCOME', 'EXPENSE', 'INVESTMENT']).optional(),
  category: z.string().min(1).optional(),
  subItems: z.array(z.object({
    type: z.enum(['INCOME', 'EXPENSE', 'INVESTMENT']),
    category: z.string().min(1),
    name: z.string().min(1)
  })).max(200).optional(),
  sourceYear: z.coerce.number().int().min(1900).max(3000),
  targetYears: z.array(z.coerce.number().int().min(1900).max(3000)).min(1).max(5),
  overwrite: z.coerce.boolean().default(true)
}).refine((data) => data.scope !== 'CATEGORY' || (data.type && data.category), {
  message: 'Informe tipo e categoria para copiar uma categoria',
  path: ['category']
}).refine((data) => data.scope !== 'SELECTED_SUBITEMS' || Boolean(data.subItems?.length), {
  message: 'Selecione ao menos um subitem para copiar',
  path: ['subItems']
});

export const bulkDeleteFinancialScopeSchema = z.object({
  scope: z.enum(['CATEGORY', 'ALL_INCOME', 'ALL_EXPENSE', 'ALL_INVESTMENT', 'ALL_TABLE', 'SELECTED_SUBITEMS']),
  type: z.enum(['INCOME', 'EXPENSE', 'INVESTMENT']).optional(),
  category: z.string().min(1).optional(),
  subItems: z.array(z.object({
    type: z.enum(['INCOME', 'EXPENSE', 'INVESTMENT']),
    category: z.string().min(1),
    name: z.string().min(1)
  })).max(200).optional(),
  year: z.coerce.number().int().min(1900).max(3000)
}).refine((data) => data.scope !== 'CATEGORY' || (data.type && data.category), {
  message: 'Informe tipo e categoria para excluir uma categoria',
  path: ['category']
}).refine((data) => data.scope !== 'SELECTED_SUBITEMS' || Boolean(data.subItems?.length), {
  message: 'Selecione ao menos um subitem para excluir',
  path: ['subItems']
});

export const paymentSummarySchema = periodFilterSchema;

export type CreateFinancialItemInput = z.infer<typeof createFinancialItemSchema>;
export type UpdateFinancialItemInput = z.infer<typeof updateFinancialItemSchema>;
export type ListFinancialItemsInput = z.infer<typeof listFinancialItemsSchema>;
export type SalaryCandidatesInput = z.infer<typeof salaryCandidatesSchema>;
export type CopyFinancialCategoryInput = z.infer<typeof copyFinancialCategorySchema>;
export type BulkDeleteFinancialScopeInput = z.infer<typeof bulkDeleteFinancialScopeSchema>;
export type UpdateFinancialItemValueInput = z.infer<typeof updateFinancialItemValueSchema>;
export type PaymentStatusUpdateInput = z.infer<typeof paymentStatusUpdateSchema>;
export type PaymentSummaryInput = z.infer<typeof paymentSummarySchema>;
export type CategoryActionInput = z.infer<typeof categoryActionSchema>;
export type RenameCategoryInput = z.infer<typeof renameCategorySchema>;
