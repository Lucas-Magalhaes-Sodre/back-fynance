import { z } from 'zod';

export const updateReferralCouponSchema = z.object({
  code: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_-]+$/, 'Use apenas letras, numeros, hifen ou underline.')
});

export const updateReferralPayoutSchema = z.object({
  preference: z.enum(['CREDIT', 'PIX']),
  pixKeyType: z.enum(['CPF_CNPJ', 'EMAIL', 'PHONE', 'RANDOM']).optional().nullable(),
  pixKey: z.string().trim().max(160).optional().nullable(),
  pixHolderName: z.string().trim().max(120).optional().nullable(),
  referralTermsAccepted: z.boolean().optional().default(false)
});

export const requestReferralWithdrawalSchema = z.object({
  referralTermsAccepted: z.literal(true)
});

export type UpdateReferralCouponInput = z.infer<typeof updateReferralCouponSchema>;
export type UpdateReferralPayoutInput = z.infer<typeof updateReferralPayoutSchema>;
export type RequestReferralWithdrawalInput = z.infer<typeof requestReferralWithdrawalSchema>;
