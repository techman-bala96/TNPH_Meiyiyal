import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

export type WorkerCategory = Database['public']['Enums']['worker_category'];
export type PaymentMethodology = Database['public']['Enums']['payment_methodology'];

export const workerFormSchema = z.object({
  about: z.string().min(20, 'About section must be at least 20 characters'),
  yearsExperience: z.number().min(0).max(50).optional(),
  hourlyRate: z.number().min(0).optional(),
});

export type WorkerFormData = z.infer<typeof workerFormSchema>;
