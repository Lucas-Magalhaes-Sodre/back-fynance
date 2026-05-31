import { z } from 'zod';

export const yearParamsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100)
});

export const dayQuerySchema = z.object({
  date: z.coerce.date()
});

export const weekQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date()
}).refine((data) => data.endDate >= data.startDate, {
  message: 'A data final deve ser maior ou igual a inicial',
  path: ['endDate']
});

export const monthQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

export const yearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100)
});

export type DayQuery = z.infer<typeof dayQuerySchema>;
export type WeekQuery = z.infer<typeof weekQuerySchema>;
export type MonthQuery = z.infer<typeof monthQuerySchema>;
export type YearQuery = z.infer<typeof yearQuerySchema>;
