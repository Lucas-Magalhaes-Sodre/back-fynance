import { z } from 'zod';

export const checkoutSchema = z.object({
  provider: z.enum(['MERCADO_PAGO', 'STRIPE']).default('MERCADO_PAGO'),
  plan: z.enum(['MONTHLY', 'YEARLY'])
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
