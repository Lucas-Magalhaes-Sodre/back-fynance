import { z } from 'zod';

export const cookieConsentSchema = z.object({
  visitorId: z.string().uuid(),
  version: z.string().min(1).max(32),
  necessary: z.literal(true),
  preferences: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
  sourcePath: z.string().max(256).optional().nullable()
});

export type CookieConsentInput = z.infer<typeof cookieConsentSchema>;
