import { z } from 'zod';

export const registerPushTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.string().optional().nullable(),
  deviceName: z.string().optional().nullable()
});

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
