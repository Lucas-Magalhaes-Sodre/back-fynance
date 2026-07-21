import { z } from 'zod';

export const creditCardSchema = z.object({
  name: z.string().min(2),
  dueDay: z.coerce.number().int().min(1).max(31),
  creditLimit: z.coerce.number().positive().optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isActive: z.coerce.boolean().optional()
});

export const updateCreditCardSchema = creditCardSchema.partial();

export const creditCardPurchaseSchema = z.object({
  cardId: z.string().uuid(),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  purchaseDate: z.coerce.date(),
  installments: z.coerce.number().int().min(1).max(240).default(1)
});

export const updateCreditCardPurchaseSchema = creditCardPurchaseSchema.omit({ cardId: true }).partial();

export const deleteCreditCardPurchaseSchema = z.object({
  deleteAllInstallments: z.coerce.boolean().optional(),
  installmentNumber: z.coerce.number().int().min(1).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional()
}).optional().default({});

export const listCreditCardsSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  cardId: z.string().uuid().optional(),
  cardName: z.string().optional()
});

export type CreditCardInput = z.infer<typeof creditCardSchema>;
export type UpdateCreditCardInput = z.infer<typeof updateCreditCardSchema>;
export type CreditCardPurchaseInput = z.infer<typeof creditCardPurchaseSchema>;
export type UpdateCreditCardPurchaseInput = z.infer<typeof updateCreditCardPurchaseSchema>;
export type DeleteCreditCardPurchaseInput = z.infer<typeof deleteCreditCardPurchaseSchema>;
export type ListCreditCardsInput = z.infer<typeof listCreditCardsSchema>;
