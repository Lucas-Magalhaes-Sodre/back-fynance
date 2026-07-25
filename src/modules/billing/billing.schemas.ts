import { z } from 'zod';

export const checkoutSchema = z.object({
  provider: z.enum(['MERCADO_PAGO', 'STRIPE']).default('MERCADO_PAGO'),
  planId: z.string().min(1).optional(),
  plan: z.enum(['MONTHLY', 'YEARLY']).optional(),
  couponCode: z.string().trim().max(40).optional(),
  legalAccepted: z.literal(true)
});

export const couponValidationSchema = z.object({
  planId: z.string().min(1),
  couponCode: z.string().trim().min(1).max(40)
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CouponValidationInput = z.infer<typeof couponValidationSchema>;
